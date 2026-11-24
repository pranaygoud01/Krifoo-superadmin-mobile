/**
 * Tables & online booking — set up once.
 * Each table is added once (name, seats, area, online booking); when guests can book comes from
 * the weekly booking hours (Booking hours screen), so nothing has to be posted day by day.
 * Restaurants still on the old daily posts get a one-tap import.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Switch, Alert } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Plus, Pencil, Trash2, Armchair, Clock, PoundSterling, CalendarClock, Sparkles, Settings2, Power } from 'lucide-react-native';
import { Colors } from '../constants/colors';
import { useToast } from '../context/ToastContext';
import { ScreenHeader } from '../components/ScreenHeader';
import { Notice, PrimaryButton, LoadingState, useFormLayout } from '../components/settings/FormKit';
import { SearchBar, FilterChips, Card, Badge, IconAction, EmptyState, LoadError, TextAction, Fab, FAB_SPACE, listStyles } from '../components/ui/ListKit';
import { TableFormSheet, type TableFormTarget } from '../components/tables/TableFormSheet';
import { floorService, type FloorStatus, type LiveTable } from '../services/floor.service';
import {
  bookingSettingsService,
  hoursSummary,
  priceSummary,
  tablePriceSummary,
  noticeLabel,
  cancelLabel,
  type BookingSetup,
} from '../services/booking-settings.service';

export default function TablesScreen() {
  const router = useRouter();
  const { showToast } = useToast();
  const { gutter } = useFormLayout();

  const [floor, setFloor] = useState<FloorStatus | null>(null);
  const [setup, setSetup] = useState<BookingSetup | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [area, setArea] = useState('all');
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [form, setForm] = useState<TableFormTarget | null>(null);

  const load = useCallback(async () => {
    const [f, s] = await Promise.all([floorService.getStatus(), bookingSettingsService.getSetup()]);
    setRefreshing(false);
    if (!f.success || !f.data || !s.success || !s.data) {
      setError(f.message || s.message || 'Please check your connection and try again.');
      return;
    }
    setError('');
    setFloor(f.data);
    setSetup(s.data);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const settings = setup?.settings;
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (floor?.floors || [])
      .filter((f) => area === 'all' || f._id === area)
      .map((f) => ({ floor: f, tables: f.tables.filter((t) => !q || `${t.label} ${f.name}`.toLowerCase().includes(q)) }))
      .filter((g) => g.tables.length);
  }, [floor, area, query]);
  const allTables = useMemo(() => (floor?.floors || []).flatMap((f) => f.tables), [floor]);
  const onlineCount = allTables.filter((t) => t.bookable).length;

  /* ── Actions ───────────────────────────────────────────────────────── */

  const toggleOnline = async (t: LiveTable) => {
    if (!setup?.exists && !t.bookable) {
      Alert.alert('Set your booking hours first', 'Choose when guests can book (for example lunch and dinner) — it only takes a minute.', [
        { text: 'Not now', style: 'cancel' },
        { text: 'Set booking hours', onPress: () => router.push('/booking-settings') },
      ]);
      return;
    }
    setBusyId(t._id);
    const res = await floorService.updateTable(t._id, { bookable: !t.bookable });
    setBusyId(null);
    if (!res.success) return showToast({ title: 'Couldn’t update', message: res.message || 'Please try again.', type: 'error' });
    showToast({ message: `${t.label} ${t.bookable ? 'is no longer bookable online' : 'can be booked online'}`, type: 'success' });
    load();
  };

  const remove = (t: LiveTable) => {
    Alert.alert(`Delete ${t.label}?`, 'It’s removed from your floor plan and online booking. Past visits and bookings stay in your records.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setBusyId(t._id);
          const res = await floorService.deleteTable(t._id);
          setBusyId(null);
          if (!res.success) return showToast({ title: 'Couldn’t delete', message: res.message || 'Please try again.', type: 'error' });
          showToast({ message: `${t.label} deleted`, type: 'info' });
          load();
        },
      },
    ]);
  };

  const runImport = () => {
    const legacy = setup?.legacy;
    if (!legacy) return;
    const s = legacy.suggestion;
    Alert.alert(
      'Set up your tables once',
      `We’ll add ${s.tables.length} table${s.tables.length === 1 ? '' : 's'} (${s.tables.map((t) => t.label).slice(0, 8).join(', ')}${s.tables.length > 8 ? '…' : ''}) to your floor plan, bookable online.\n\nBooking hours: ${hoursSummary(s.weekly)}\nPrice: ${priceSummary(s.priceModel, s.price)}\n\nUpcoming bookings move with their table. You can change everything afterwards.`,
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Import tables',
          onPress: async () => {
            setImporting(true);
            const res = await bookingSettingsService.importLegacy();
            setImporting(false);
            if (!res.success || !res.data) return showToast({ title: 'Couldn’t import', message: res.message || 'Please try again.', type: 'error' });
            const d = res.data;
            showToast({
              title: 'Tables set up',
              message: `${d.tablesCreated + d.tablesUpdated} tables bookable${d.bookingsMoved ? ` · ${d.bookingsMoved} booking${d.bookingsMoved === 1 ? '' : 's'} moved` : ''}. Check your booking hours.`,
              type: 'success',
            });
            load();
          },
        },
      ]
    );
  };

  /* ── Render ────────────────────────────────────────────────────────── */

  if (!floor && !error) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="Tables" />
        <LoadingState label="Loading tables…" />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="Tables"
        subtitle={setup?.exists ? `${onlineCount} of ${allTables.length} bookable online` : `${allTables.length} table${allTables.length === 1 ? '' : 's'}`}
        rightElement={<TextAction label="Booking hours" icon={CalendarClock} onPress={() => router.push('/booking-settings')} />}
      />
      {error && !floor ? (
        <LoadError message={error} onRetry={load} />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingHorizontal: gutter }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} colors={[Colors.primary]} />}
        >
          {/* Old daily posts → one-tap import */}
          {setup?.legacy ? (
            <Card style={styles.importCard}>
              <View style={styles.importHead}>
                <Sparkles size={20} color={Colors.primary} />
                <Text style={styles.importTitle}>No more posting tables every day</Text>
              </View>
              <Text style={styles.importText}>
                You have {setup.legacy.upcoming || setup.legacy.posts} daily table post{(setup.legacy.upcoming || setup.legacy.posts) === 1 ? '' : 's'}. Import them once: your tables go on the floor plan, your hours become weekly booking hours ({hoursSummary(setup.legacy.suggestion.weekly)}) and upcoming bookings move with them.
              </Text>
              <PrimaryButton label="Import my tables" icon={Sparkles} loading={importing} onPress={runImport} />
            </Card>
          ) : null}

          {/* Booking setup summary */}
          {setup?.exists && settings ? (
            <Card style={styles.summary}>
              {!settings.enabled ? (
                <View style={styles.offRow}>
                  <Power size={16} color={Colors.danger} />
                  <Text style={styles.offText}>Online booking is switched off — guests can’t book right now.</Text>
                </View>
              ) : null}
              <SummaryLine icon={Clock} text={hoursSummary(settings.weekly)} />
              <SummaryLine icon={PoundSterling} text={`${priceSummary(settings.priceModel, settings.price)}${settings.priceModel !== 'free' ? ` · ${cancelLabel(settings.freeCancelHours ?? 24)}` : ''}`} />
              <SummaryLine icon={CalendarClock} text={`Up to ${settings.maxBookingHours} h · book ${settings.maxDaysAhead} days ahead · ${noticeLabel(settings.minNoticeMinutes)}`} />
              <TextAction label="Change booking hours & rules" icon={Settings2} tone="primary" onPress={() => router.push('/booking-settings')} style={styles.summaryAction} />
            </Card>
          ) : !setup?.legacy ? (
            <Notice tone="info" icon={CalendarClock} title="Let guests book tables">
              Add your tables, then set your booking hours once (for example lunch and dinner). Guests book them in the Krifoo app — no daily posting.
            </Notice>
          ) : null}

          {allTables.length ? (
            <>
              <SearchBar value={query} onChangeText={setQuery} placeholder="Search tables or areas" />
              {(floor?.floors.length || 0) > 1 ? (
                <FilterChips
                  options={[{ value: 'all', label: 'All areas', count: allTables.length }, ...(floor?.floors || []).map((f) => ({ value: f._id, label: f.name, count: f.tables.length }))]}
                  value={area}
                  onChange={setArea}
                />
              ) : null}
            </>
          ) : null}

          {!allTables.length ? (
            <EmptyState
              icon={Armchair}
              title="No tables yet"
              message="Add each table once with its seats and area. Choose which ones guests can book online."
              actionLabel="Add a table"
              onAction={() => setForm({ kind: 'add' })}
            />
          ) : !rows.length ? (
            <EmptyState icon={Armchair} title="No tables match" message="Try another area or search." />
          ) : (
            rows.map(({ floor: f, tables }) => (
              <View key={f._id} style={styles.group}>
                <Text style={listStyles.sectionHeader}>{f.name}</Text>
                {tables.map((t) => (
                  <Card key={t._id} muted={!t.bookable}>
                    <View style={listStyles.row}>
                      <View style={styles.badge}>
                        <Text style={styles.badgeText} numberOfLines={1}>{t.label}</Text>
                      </View>
                      <View style={listStyles.flex}>
                        <Text style={listStyles.title} numberOfLines={1}>{/^\d+$/.test(t.label) ? `Table ${t.label}` : t.label}</Text>
                        <Text style={listStyles.sub}>Up to {t.seats} guest{t.seats === 1 ? '' : 's'} · {f.name}</Text>
                      </View>
                      <Switch
                        value={!!t.bookable}
                        onValueChange={() => toggleOnline(t)}
                        disabled={busyId === t._id}
                        trackColor={{ false: Colors.cardBorder, true: Colors.success }}
                        thumbColor="#FFFFFF"
                        accessibilityLabel={`${t.label} bookable online`}
                      />
                    </View>
                    <View style={styles.footer}>
                      <Badge label={t.bookable ? 'Bookable online' : 'Not online'} tone={t.bookable ? 'success' : 'neutral'} />
                      {t.bookable && settings ? <Badge label={tablePriceSummary(settings, t.bookingPrice)} tone={t.bookingPrice != null ? 'brand' : 'neutral'} /> : null}
                      {t.bookable && t.maxBookingHours != null ? <Badge label={`Up to ${t.maxBookingHours} h`} tone="info" /> : null}
                      <View style={listStyles.flex} />
                      <IconAction icon={Pencil} label={`Edit ${t.label}`} onPress={() => setForm({ kind: 'edit', table: t, floorId: f._id })} />
                      <IconAction icon={Trash2} label={`Delete ${t.label}`} tone="danger" onPress={() => remove(t)} busy={busyId === t._id} />
                    </View>
                  </Card>
                ))}
              </View>
            ))
          )}
        </ScrollView>
      )}

      {allTables.length > 0 ? <Fab label="Add table" icon={Plus} onPress={() => setForm({ kind: 'add' })} /> : null}

      {settings ? (
        <TableFormSheet
          visible={!!form}
          target={form}
          floors={floor?.floors || []}
          settings={settings}
          onClose={() => setForm(null)}
          onSaved={(message) => {
            setForm(null);
            showToast({ message, type: 'success' });
            load();
          }}
        />
      ) : null}
    </View>
  );
}

function SummaryLine({ icon: Icon, text }: { icon: any; text: string }) {
  return (
    <View style={styles.summaryLine}>
      <Icon size={15} color={Colors.textMuted} />
      <Text style={styles.summaryText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.backgroundSecondary },
  content: { paddingTop: 12, paddingBottom: FAB_SPACE, gap: 12, width: '100%', maxWidth: 900, alignSelf: 'center' },
  importCard: { gap: 10, borderColor: Colors.primary, borderWidth: 1 },
  importHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  importTitle: { fontSize: 16, fontWeight: '800', color: Colors.text, flex: 1 },
  importText: { fontSize: 14, color: Colors.text, lineHeight: 20 },
  summary: { gap: 6 },
  summaryLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  summaryText: { flex: 1, fontSize: 14, color: Colors.text, lineHeight: 20 },
  summaryAction: { alignSelf: 'flex-start', marginTop: 4 },
  offRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10, backgroundColor: Colors.statusRejected.bg, marginBottom: 4 },
  offText: { flex: 1, fontSize: 13, fontWeight: '700', color: Colors.statusRejected.text },
  group: { gap: 10 },
  badge: { minWidth: 48, height: 48, paddingHorizontal: 8, borderRadius: 14, backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 16, fontWeight: '900', color: Colors.primaryDark, maxWidth: 80 },
  footer: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.cardBorder },
});

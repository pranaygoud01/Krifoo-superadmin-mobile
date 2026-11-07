/**
 * Dining tables — post bookable tables with hourly time slots.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, Switch, Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Plus, Pencil, Trash2, Timer, Clock, CalendarDays, Armchair } from 'lucide-react-native';
import { Colors } from '../constants/colors';
import { useToast } from '../context/ToastContext';
import { ScreenHeader } from '../components/ScreenHeader';
import { BottomSheet } from '../components/ui/BottomSheet';
import { SearchableSelect } from '../components/SearchableSelect';
import { Field, FieldRow, Segmented, StepperField, Notice, PrimaryButton, sanitizeDecimal } from '../components/settings/FormKit';
import {
  SearchBar,
  FilterChips,
  Card,
  Badge,
  IconAction,
  EmptyState,
  LoadError,
  Fab,
  FAB_SPACE,
  formatGBP,
  listStyles,
} from '../components/ui/ListKit';
import { restaurantOwnerService } from '../services/restaurant-owner.service';
import { DiningTable } from '../types';

const AREAS = ['Indoor', 'Outdoor', 'Terrace', 'Rooftop', 'Garden', 'Balcony', 'Bar & Counter', 'Private Dining', 'VIP Lounge'];

/** Opening hours selectable for slots (last slot starts one hour before the end time). */
const HOURS = Array.from({ length: 19 }, (_, i) => i + 6); // 06:00 … 24:00
const hourValue = (h: number) => `${String(h).padStart(2, '0')}:00`;
const hourLabel = (h: number) => (h === 24 ? 'Midnight' : hourValue(h));

const PRESETS = [
  { label: 'Lunch', start: 11, end: 15 },
  { label: 'Dinner', start: 17, end: 23 },
  { label: 'Lunch & dinner', start: 11, end: 23 },
  { label: 'All day', start: 9, end: 23 },
];

const REPEAT_OPTIONS = [
  { value: '1', label: 'Just this day' },
  { value: '3', label: '3 days' },
  { value: '7', label: '7 days' },
];

/** Local YYYY-MM-DD (never via toISOString, which shifts the date in non-UTC timezones). */
const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Date part of a table's date, without timezone shifting ("2026-11-07T00:00:00Z" → "2026-11-07"). */
const tableDay = (t: DiningTable) => (typeof t.date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(t.date) ? t.date.slice(0, 10) : t.date ? isoDay(new Date(t.date)) : '');

const addDays = (iso: string, n: number) => {
  const [y, m, d] = iso.split('-').map(Number);
  return isoDay(new Date(y, m - 1, d + n));
};

const dayLabel = (iso: string, today: string) => {
  if (iso === today) return 'Today';
  if (iso === addDays(today, 1)) return 'Tomorrow';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
};

const slotsBetween = (start: number, end: number) => (end > start ? Array.from({ length: end - start }, (_, i) => hourValue(start + i)) : []);

type Form = {
  tableNumber: string;
  capacity: string;
  area: string;
  date: string;
  start: number;
  end: number;
  fee: string;
  maxHours: string;
  repeat: string;
};

export default function TablesScreen() {
  const { showToast } = useToast();
  const today = isoDay(new Date());
  const nextDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(today, i)), [today]);

  const [tables, setTables] = useState<DiningTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [dayFilter, setDayFilter] = useState<string>('upcoming');
  const [areaFilter, setAreaFilter] = useState('all');
  const [query, setQuery] = useState('');

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<DiningTable | null>(null);
  const [form, setForm] = useState<Form>(() => emptyForm(today));
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await restaurantOwnerService.getTables();
      if (res.success) {
        setTables(res.data || []);
        setLoadError(null);
      } else {
        setLoadError(res.message || 'Please check your connection and try again.');
      }
    } catch (e: any) {
      setLoadError(e?.message || 'Please check your connection and try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  /* ── Filtering ─────────────────────────────────────────────────────── */

  const areas = useMemo(() => Array.from(new Set(tables.map((t) => t.area || 'Indoor'))).sort(), [tables]);

  const dayCounts = useMemo(() => {
    const map: Record<string, number> = { upcoming: 0, past: 0 };
    tables.forEach((t) => {
      const d = tableDay(t);
      if (d >= today) map.upcoming++;
      else map.past++;
      map[d] = (map[d] || 0) + 1;
    });
    return map;
  }, [tables, today]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tables
      .filter((t) => {
        const d = tableDay(t);
        if (dayFilter === 'upcoming' && d < today) return false;
        if (dayFilter === 'past' && d >= today) return false;
        if (dayFilter !== 'upcoming' && dayFilter !== 'past' && d !== dayFilter) return false;
        if (areaFilter !== 'all' && (t.area || 'Indoor') !== areaFilter) return false;
        if (q && !`${t.tableNumber} ${t.area || ''}`.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => {
        const byDay = dayFilter === 'past' ? tableDay(b).localeCompare(tableDay(a)) : tableDay(a).localeCompare(tableDay(b));
        return byDay || String(a.tableNumber).localeCompare(String(b.tableNumber), undefined, { numeric: true });
      });
  }, [tables, dayFilter, areaFilter, query, today]);

  /* ── Form ──────────────────────────────────────────────────────────── */

  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm(nextDays.includes(dayFilter) ? dayFilter : today));
    setErrors({});
    setSheetOpen(true);
  };

  const openEdit = (t: DiningTable) => {
    const hours = (t.availableHours || []).map((h) => parseInt(h, 10)).filter((h) => !isNaN(h)).sort((a, b) => a - b);
    setEditing(t);
    setForm({
      tableNumber: String(t.tableNumber || ''),
      capacity: String(t.capacity || 2),
      area: t.area || 'Indoor',
      date: tableDay(t) || today,
      start: hours[0] ?? 11,
      end: hours.length ? hours[hours.length - 1] + 1 : 23,
      fee: String(t.bookingPrice ?? 0),
      maxHours: String(t.maxBookingHours || 2),
      repeat: '1',
    });
    setErrors({});
    setSheetOpen(true);
  };

  const validate = (): boolean => {
    const e: Partial<Record<keyof Form, string>> = {};
    if (!form.tableNumber.trim()) e.tableNumber = 'Enter a table name or number.';
    const cap = Number(form.capacity);
    if (!Number.isInteger(cap) || cap < 1 || cap > 50) e.capacity = 'Between 1 and 50 guests.';
    if (form.end <= form.start) e.end = 'Must be after the start time.';
    const fee = Number(form.fee || 0);
    if (isNaN(fee) || fee < 0 || fee > 500) e.fee = 'Between £0 and £500.';
    const maxH = Number(form.maxHours);
    if (!Number.isInteger(maxH) || maxH < 1 || maxH > 12) e.maxHours = 'Between 1 and 12 hours.';

    if (!editing) {
      // Same table name already posted for one of the chosen days?
      const days = Array.from({ length: Number(form.repeat) }, (_, i) => addDays(form.date, i));
      const name = form.tableNumber.trim().toLowerCase();
      const clash = tables.find((t) => String(t.tableNumber).toLowerCase() === name && days.includes(tableDay(t)));
      if (clash) e.tableNumber = `${form.tableNumber.trim()} is already posted for ${dayLabel(tableDay(clash), today)}.`;
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    setSaving(true);
    const base = {
      tableNumber: form.tableNumber.trim(),
      capacity: Number(form.capacity),
      area: form.area,
      bookingPrice: Math.round(Number(form.fee || 0) * 100) / 100,
      maxBookingHours: Number(form.maxHours),
    };
    try {
      if (editing) {
        const res = await restaurantOwnerService.updateTable(editing._id, base);
        if (!res.success) throw new Error(res.message || 'Couldn’t update the table.');
        showToast({ title: 'Table updated', message: `${base.tableNumber} has been saved.`, type: 'success' });
      } else {
        const days = Array.from({ length: Number(form.repeat) }, (_, i) => addDays(form.date, i));
        const failed: string[] = [];
        for (const day of days) {
          const res = await restaurantOwnerService.addTable({
            ...base,
            date: day,
            startTime: hourValue(form.start),
            endTime: hourValue(form.end),
          });
          if (!res.success) failed.push(`${dayLabel(day, today)}: ${res.message || 'failed'}`);
        }
        if (failed.length === days.length) throw new Error(failed[0]);
        showToast(
          failed.length
            ? { title: `Posted for ${days.length - failed.length} of ${days.length} days`, message: failed.join(' · '), type: 'warning' }
            : { title: 'Table posted', message: `${base.tableNumber} is bookable${days.length > 1 ? ` for ${days.length} days` : ''}.`, type: 'success' }
        );
      }
      setSheetOpen(false);
      load();
    } catch (e: any) {
      showToast({ title: 'Couldn’t save', message: e?.message || 'Please try again.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (t: DiningTable) => {
    setBusyId(t._id);
    setTables((prev) => prev.map((x) => (x._id === t._id ? { ...x, isActive: !x.isActive } : x)));
    try {
      const res = await restaurantOwnerService.toggleTableStatus(t._id);
      if (!res.success) throw new Error(res.message);
    } catch (e: any) {
      setTables((prev) => prev.map((x) => (x._id === t._id ? { ...x, isActive: t.isActive } : x)));
      showToast({ title: 'Couldn’t update table', message: e?.message || 'Please try again.', type: 'error' });
    } finally {
      setBusyId(null);
    }
  };

  const remove = (t: DiningTable) => {
    Alert.alert(`Delete ${t.tableNumber}?`, `It will no longer be bookable on ${dayLabel(tableDay(t), today)}.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setBusyId(t._id);
          try {
            const res = await restaurantOwnerService.deleteTable(t._id);
            if (!res.success) throw new Error(res.message);
            setTables((prev) => prev.filter((x) => x._id !== t._id));
            showToast({ title: 'Table deleted', message: `${t.tableNumber} was removed.`, type: 'info' });
          } catch (e: any) {
            showToast({ title: 'Couldn’t delete', message: e?.message || 'Please try again.', type: 'error' });
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  };

  /* ── Render ────────────────────────────────────────────────────────── */

  const slotsPreview = slotsBetween(form.start, form.end);
  const activeCount = tables.filter((t) => t.isActive && tableDay(t) >= today).length;

  const renderTable = ({ item: t }: { item: DiningTable }) => {
    const hours = (t.availableHours || []).slice().sort();
    const first = hours[0];
    const lastEnd = hours.length ? hourValue(parseInt(hours[hours.length - 1], 10) + 1) : null;
    const fee = Number(t.bookingPrice || 0);
    return (
      <Card muted={!t.isActive}>
        <View style={listStyles.row}>
          <View style={styles.tableBadge}>
            <Text style={styles.tableBadgeText} numberOfLines={1}>
              {t.tableNumber}
            </Text>
          </View>
          <View style={listStyles.flex}>
            <Text style={listStyles.title} numberOfLines={1}>
              {/^\d+$/.test(String(t.tableNumber)) ? `Table ${t.tableNumber}` : t.tableNumber}
            </Text>
            <Text style={listStyles.sub}>
              {t.area || 'Indoor'} · up to {t.capacity} guests
            </Text>
          </View>
          <Switch
            value={t.isActive}
            onValueChange={() => toggleActive(t)}
            disabled={busyId === t._id}
            trackColor={{ false: Colors.cardBorder, true: Colors.success }}
            thumbColor="#FFFFFF"
            accessibilityLabel={`${t.tableNumber} bookable`}
          />
        </View>

        <View style={styles.metaRow}>
          <Meta icon={CalendarDays} text={dayLabel(tableDay(t), today)} />
          <Meta icon={Clock} text={first && lastEnd ? `${first}–${lastEnd} · ${hours.length} slots` : 'No slots'} />
          <Meta icon={Timer} text={`Max ${t.maxBookingHours || 2} h`} />
        </View>

        <View style={[listStyles.row, styles.footer]}>
          <Badge label={t.isActive ? 'Bookable' : 'Hidden'} tone={t.isActive ? 'success' : 'neutral'} />
          <Badge label={fee > 0 ? `${formatGBP(fee)} deposit` : 'Free to book'} tone={fee > 0 ? 'brand' : 'neutral'} />
          <View style={listStyles.flex} />
          <IconAction icon={Pencil} label={`Edit ${t.tableNumber}`} onPress={() => openEdit(t)} />
          <IconAction icon={Trash2} label={`Delete ${t.tableNumber}`} tone="danger" onPress={() => remove(t)} busy={busyId === t._id} />
        </View>
      </Card>
    );
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Tables" subtitle={`${activeCount} bookable table${activeCount === 1 ? '' : 's'} upcoming`} />

      <View style={listStyles.toolbar}>
        <View style={[listStyles.frame, styles.toolbarInner]}>
          <SearchBar value={query} onChangeText={setQuery} placeholder="Search table or area" />
          <FilterChips
            options={[
              { value: 'upcoming', label: 'Upcoming', count: dayCounts.upcoming },
              ...nextDays.map((d) => ({ value: d, label: dayLabel(d, today), count: dayCounts[d] || 0 })),
              { value: 'past', label: 'Past', count: dayCounts.past },
            ]}
            value={dayFilter}
            onChange={setDayFilter}
          />
          {areas.length > 1 ? (
            <FilterChips options={[{ value: 'all', label: 'All areas' }, ...areas.map((a) => ({ value: a, label: a }))]} value={areaFilter} onChange={setAreaFilter} />
          ) : null}
        </View>
      </View>

      {loading ? (
        <EmptyState icon={Armchair} title="Loading tables…" />
      ) : loadError && tables.length === 0 ? (
        <LoadError message={loadError} onRetry={() => { setLoading(true); load(); }} />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(t) => t._id}
          renderItem={renderTable}
          contentContainerStyle={[styles.list, listStyles.frame]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} colors={[Colors.primary]} />}
          ListEmptyComponent={
            tables.length === 0 ? (
              <EmptyState
                icon={Armchair}
                title="No tables yet"
                message="Add your tables with the hours they can be booked. Customers can then reserve them in the Krifoo app."
                actionLabel="Add a table"
                onAction={openAdd}
              />
            ) : (
              <EmptyState icon={Armchair} title="No tables match" message="Try another day, area or search." actionLabel="Add a table" onAction={openAdd} />
            )
          }
        />
      )}

      {tables.length > 0 && <Fab label="Add table" icon={Plus} onPress={openAdd} />}

      <BottomSheet
        visible={sheetOpen}
        title={editing ? `Edit ${editing.tableNumber}` : 'Add a table'}
        subtitle={editing ? dayLabel(tableDay(editing), today) : 'Customers can book it in hourly slots'}
        onClose={() => setSheetOpen(false)}
        footer={
          <>
            <PrimaryButton label="Cancel" tone="secondary" onPress={() => setSheetOpen(false)} style={styles.flex} />
            <PrimaryButton label={editing ? 'Save changes' : Number(form.repeat) > 1 ? `Post for ${form.repeat} days` : 'Post table'} onPress={save} loading={saving} style={styles.flex} />
          </>
        }
      >
        <FieldRow>
          <Field
            label="Table name"
            required
            value={form.tableNumber}
            onChangeText={(v) => set('tableNumber', v)}
            placeholder="e.g. 4 or Window 2"
            maxLength={20}
            error={errors.tableNumber}
          />
          <Field
            label="Seats"
            required
            value={form.capacity}
            onChangeText={(v) => set('capacity', v.replace(/\D/g, ''))}
            keyboardType="number-pad"
            maxLength={2}
            suffix="guests"
            error={errors.capacity}
          />
        </FieldRow>

        <Text style={styles.label}>Area</Text>
        <SearchableSelect
          title="Choose an area"
          searchPlaceholder="Search areas"
          value={form.area}
          onChange={(v) => set('area', v)}
          options={Array.from(new Set([...AREAS, ...areas, form.area])).map((a) => ({ value: a, label: a }))}
        />
        <View style={styles.gap} />

        {editing ? (
          <Notice tone="info" icon={CalendarDays}>
            {`Date and hours: ${dayLabel(form.date, today)}, ${hourLabel(form.start)}–${hourLabel(form.end)}. To change them, delete this table and post it again.`}
          </Notice>
        ) : (
          <>
            <Text style={styles.label}>Date</Text>
            <FilterChips options={nextDays.map((d) => ({ value: d, label: dayLabel(d, today) }))} value={form.date} onChange={(v) => set('date', v)} />
            <Text style={styles.label}>Repeat</Text>
            <Segmented options={REPEAT_OPTIONS} value={form.repeat} onChange={(v) => set('repeat', v)} />

            <Text style={styles.label}>Bookable hours</Text>
            <FilterChips
              options={PRESETS.map((p) => ({ value: `${p.start}-${p.end}`, label: `${p.label} · ${hourValue(p.start)}–${hourValue(p.end)}` }))}
              value={`${form.start}-${form.end}`}
              onChange={(v) => {
                const [s, e] = v.split('-').map(Number);
                setForm((f) => ({ ...f, start: s, end: e }));
                setErrors((x) => ({ ...x, end: undefined }));
              }}
            />
            <FieldRow>
              <View>
                <Text style={styles.label}>From</Text>
                <SearchableSelect
                  title="Bookable from"
                  searchPlaceholder="Search times"
                  value={String(form.start)}
                  onChange={(v) => set('start', Number(v))}
                  options={HOURS.filter((h) => h < 24).map((h) => ({ value: String(h), label: hourLabel(h) }))}
                />
              </View>
              <View>
                <Text style={styles.label}>Until</Text>
                <SearchableSelect
                  title="Bookable until"
                  searchPlaceholder="Search times"
                  value={String(form.end)}
                  onChange={(v) => set('end', Number(v))}
                  error={!!errors.end}
                  options={HOURS.filter((h) => h > form.start).map((h) => ({ value: String(h), label: hourLabel(h) }))}
                />
              </View>
            </FieldRow>
            <Text style={[styles.hint, errors.end && { color: Colors.danger }]}>
              {errors.end || (slotsPreview.length ? `${slotsPreview.length} one-hour slots: ${slotsPreview[0]} to ${slotsPreview[slotsPreview.length - 1]}` : '')}
            </Text>
          </>
        )}

        <FieldRow>
          <Field
            label="Booking deposit"
            prefix="£"
            value={form.fee}
            onChangeText={(v) => set('fee', sanitizeDecimal(v))}
            keyboardType="decimal-pad"
            placeholder="0.00"
            hint="0 = free to book"
            error={errors.fee}
          />
          <StepperField
            label="Longest booking"
            value={form.maxHours}
            onChange={(v) => set('maxHours', v)}
            step={1}
            min={1}
            max={12}
            suffix="h"
            error={errors.maxHours}
          />
        </FieldRow>
      </BottomSheet>
    </View>
  );
}

function emptyForm(date: string): Form {
  return { tableNumber: '', capacity: '4', area: 'Indoor', date, start: 11, end: 23, fee: '0', maxHours: '2', repeat: '1' };
}

function Meta({ icon: Icon, text }: { icon: any; text: string }) {
  return (
    <View style={styles.meta}>
      <Icon size={14} color={Colors.textSubtle} />
      <Text style={listStyles.meta}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.backgroundSecondary },
  flex: { flex: 1 },
  toolbarInner: { paddingHorizontal: 16 },
  list: { padding: 16, paddingBottom: FAB_SPACE },
  tableBadge: { minWidth: 48, height: 48, paddingHorizontal: 8, borderRadius: 14, backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  tableBadgeText: { fontSize: 16, fontWeight: '900', color: Colors.primaryDark, maxWidth: 80 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 12 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  footer: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.cardBorder, flexWrap: 'wrap' },
  label: { fontSize: 13, fontWeight: '700', color: Colors.text, marginBottom: 2, marginTop: 4 },
  hint: { fontSize: 12, color: Colors.textSubtle, marginTop: 6, marginBottom: 14 },
  gap: { height: 14 },
});

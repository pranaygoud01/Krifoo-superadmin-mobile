import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Switch, TouchableOpacity, Modal } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '../components/ScreenHeader';
import { Colors } from '../constants/colors';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { restaurantService } from '../services/restaurant.service';
import { restaurantOwnerService } from '../services/restaurant-owner.service';
import { Clock, Truck, Globe, Copy, CircleAlert, X, Info, RefreshCw } from 'lucide-react-native';
import { Restaurant } from '../types';
import { RestaurantPicker } from '../components/settings/RestaurantPicker';
import {
  ErrorView,
  FormFrame,
  FormSection,
  LoadingState,
  Notice,
  PrimaryButton,
  SAVE_BAR_SPACE,
  SaveBar,
  Segmented,
  ToggleRow,
  formStyles,
  isEqualJSON,
  useFormLayout,
  useUnsavedChangesGuard,
} from '../components/settings/FormKit';

/**
 * Opening & delivery hours.
 * Owner:       GET/PUT /api/restaurants/timings
 * Super admin: GET/PUT /api/admin/restaurants/:id/timings
 * Payload: { timings, hasCustomDeliveryTimings, deliveryTimings, hasCustomExternalDeliveryTimings, externalDeliveryTimings }.
 * Validation mirrors the backend: ≥ 1 open day, open ≠ close, and custom delivery hours must sit
 * inside the store's hours for that day (overnight shifts supported).
 */

interface DaySchedule {
  day: string;
  isOpen: boolean;
  openTime: string;
  closeTime: string;
}

type Channel = 'store' | 'krifoo' | 'website';

type Hours = {
  store: DaySchedule[];
  krifooCustom: boolean;
  krifoo: DaySchedule[];
  websiteCustom: boolean;
  website: DaySchedule[];
};

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_LABEL = (d: string) => d.charAt(0).toUpperCase() + d.slice(1);

const TIME_SLOTS = [
  ...Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`),
  '23:59',
];

const toMinutes = (t: string) => {
  const [h, m] = (t || '0:0').split(':').map(Number);
  return h * 60 + m;
};

const format12h = (t?: string) => {
  if (!t) return '—';
  const [hRaw, m] = t.split(':');
  const h = parseInt(hRaw, 10);
  if (isNaN(h)) return t;
  return `${h % 12 || 12}:${m} ${h >= 12 ? 'PM' : 'AM'}`;
};

const normalise = (list: any[] | undefined, fallback?: DaySchedule[]): DaySchedule[] =>
  DAYS.map((day) => {
    const found = (list || []).find((t) => String(t.day).toLowerCase() === day);
    const fb = fallback?.find((t) => t.day === day);
    return found
      ? { day, isOpen: !!found.isOpen, openTime: found.openTime || '09:00', closeTime: found.closeTime || '22:00' }
      : fb
      ? { ...fb }
      : { day, isOpen: false, openTime: '09:00', closeTime: '22:00' };
  });

const toHours = (data: any): Hours => {
  const store = normalise(data?.timings);
  return {
    store,
    krifooCustom: data?.hasCustomDeliveryTimings === true,
    krifoo: normalise(data?.deliveryTimings, store),
    websiteCustom: data?.hasCustomExternalDeliveryTimings === true,
    website: normalise(data?.externalDeliveryTimings, store),
  };
};

/** Per-day validation errors for one channel, keyed by day. */
function validateChannel(list: DaySchedule[], store: DaySchedule[], isDelivery: boolean): Record<string, string> {
  const errs: Record<string, string> = {};
  list.forEach((d) => {
    if (!d.isOpen) return;
    if (d.openTime === d.closeTime) {
      errs[d.day] = 'Opening and closing times can’t be the same.';
      return;
    }
    if (!isDelivery) return;
    const s = store.find((x) => x.day === d.day);
    if (!s || !s.isOpen) {
      errs[d.day] = 'The store is closed this day — delivery can’t be open.';
      return;
    }
    const so = toMinutes(s.openTime);
    const scRaw = toMinutes(s.closeTime);
    const sc = scRaw <= so ? scRaw + 1440 : scRaw;
    const doo = toMinutes(d.openTime);
    const dcRaw = toMinutes(d.closeTime);
    const dc = dcRaw <= doo ? dcRaw + 1440 : dcRaw;
    if (doo < so || dc > sc) errs[d.day] = `Must be within store hours (${format12h(s.openTime)} – ${format12h(s.closeTime)}).`;
  });
  return errs;
}

export default function OperationalTimingsScreen() {
  const params = useLocalSearchParams<{ restaurantId?: string }>();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { gutter, isTablet } = useFormLayout();
  const insets = useSafeAreaInsets();
  const isSuperAdmin = user?.userType === 'super_admin';

  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [restaurantId, setRestaurantId] = useState<string>(params.restaurantId || '');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [channel, setChannel] = useState<Channel>('store');
  const [hours, setHours] = useState<Hours>(toHours(null));
  const [saved, setSaved] = useState<Hours>(toHours(null));
  const [picker, setPicker] = useState<{ day: string; field: 'openTime' | 'closeTime' } | null>(null);

  const dirty = !isEqualJSON(hours, saved);
  useUnsavedChangesGuard(dirty);

  /* ── Validation ───────────────────────────────────────────────────────── */

  const errors = useMemo(() => {
    const store = validateChannel(hours.store, hours.store, false);
    const krifoo = hours.krifooCustom ? validateChannel(hours.krifoo, hours.store, true) : {};
    const website = hours.websiteCustom ? validateChannel(hours.website, hours.store, true) : {};
    const noOpenDay = !hours.store.some((d) => d.isOpen);
    return { store, krifoo, website, noOpenDay };
  }, [hours]);

  const errorCount =
    Object.keys(errors.store).length + Object.keys(errors.krifoo).length + Object.keys(errors.website).length + (errors.noOpenDay ? 1 : 0);

  /* ── Data ─────────────────────────────────────────────────────────────── */

  const fetchHours = useCallback(
    async (id?: string) => {
      const res: any =
        isSuperAdmin && id ? await restaurantService.getRestaurantTimings(id) : await restaurantOwnerService.getRestaurantTimings();
      if (res.success && res.data) {
        const h = toHours(res.data);
        setHours(h);
        setSaved(h);
      } else {
        throw new Error(res.message || 'Opening hours could not be loaded.');
      }
    },
    [isSuperAdmin]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      if (isSuperAdmin) {
        const list: any = await restaurantService.getRestaurants({ limit: 100 });
        const items: Restaurant[] = list.data || [];
        setRestaurants(items);
        const target = params.restaurantId || items[0]?._id;
        if (!target) throw new Error('There are no restaurants to configure yet.');
        setRestaurantId(target);
        await fetchHours(target);
      } else {
        await fetchHours();
      }
    } catch (e: any) {
      setLoadError(e?.message || 'Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }, [isSuperAdmin, params.restaurantId, fetchHours]);

  useEffect(() => {
    load();
  }, [load]);

  const switchRestaurant = async (r: Restaurant) => {
    if (r._id === restaurantId) return;
    if (dirty) {
      showToast({ title: 'Unsaved changes', message: 'Save or discard your changes before switching restaurant.', type: 'error' });
      return;
    }
    setLoading(true);
    try {
      setRestaurantId(r._id);
      await fetchHours(r._id);
    } catch (e: any) {
      showToast({ title: 'Couldn’t load hours', message: e?.message || 'Try again.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  /* ── Editing ──────────────────────────────────────────────────────────── */

  const listKey: Record<Channel, 'store' | 'krifoo' | 'website'> = { store: 'store', krifoo: 'krifoo', website: 'website' };
  const isCustom = channel === 'store' ? true : channel === 'krifoo' ? hours.krifooCustom : hours.websiteCustom;
  const currentList = channel === 'store' ? hours.store : isCustom ? hours[listKey[channel]] : hours.store;
  const currentErrors = channel === 'store' ? errors.store : channel === 'krifoo' ? errors.krifoo : errors.website;

  const updateDay = (day: string, patch: Partial<DaySchedule>) =>
    setHours((prev) => {
      const key = listKey[channel];
      return { ...prev, [key]: prev[key].map((d) => (d.day === day ? { ...d, ...patch } : d)) };
    });

  const setCustom = (value: boolean) =>
    setHours((prev) => {
      if (channel === 'krifoo') return { ...prev, krifooCustom: value, krifoo: value ? prev.krifoo : prev.store.map((d) => ({ ...d })) };
      return { ...prev, websiteCustom: value, website: value ? prev.website : prev.store.map((d) => ({ ...d })) };
    });

  const copyStoreHours = () =>
    setHours((prev) => ({ ...prev, [listKey[channel]]: prev.store.map((d) => ({ ...d })) }));

  const copyMondayToAll = () =>
    setHours((prev) => {
      const key = listKey[channel];
      const mon = prev[key].find((d) => d.day === 'monday');
      if (!mon) return prev;
      return { ...prev, [key]: prev[key].map((d) => ({ ...d, isOpen: mon.isOpen, openTime: mon.openTime, closeTime: mon.closeTime })) };
    });

  /* ── Save ─────────────────────────────────────────────────────────────── */

  const save = async () => {
    if (errorCount) {
      // Jump to the first channel with a problem so the user sees it.
      if (errors.noOpenDay || Object.keys(errors.store).length) setChannel('store');
      else if (Object.keys(errors.krifoo).length) setChannel('krifoo');
      else setChannel('website');
      showToast({ title: 'Check your hours', message: 'Some days need fixing before saving.', type: 'error' });
      return;
    }
    const payload = {
      timings: hours.store,
      hasCustomDeliveryTimings: hours.krifooCustom,
      deliveryTimings: hours.krifooCustom ? hours.krifoo : hours.store,
      hasCustomExternalDeliveryTimings: hours.websiteCustom,
      externalDeliveryTimings: hours.websiteCustom ? hours.website : hours.store,
    };
    setSaving(true);
    try {
      const res: any = isSuperAdmin
        ? await restaurantService.updateRestaurantTimings(restaurantId, payload)
        : await restaurantOwnerService.updateRestaurantTimings(payload);
      if (res.success) {
        await fetchHours(isSuperAdmin ? restaurantId : undefined).catch(() => setSaved(hours));
        showToast({ title: 'Hours saved', message: 'Opening and delivery hours are updated.', type: 'success' });
      } else {
        showToast({ title: 'Save failed', message: res.message || 'Could not save hours.', type: 'error' });
      }
    } catch (e: any) {
      showToast({ title: 'Save failed', message: e?.message || 'Could not reach the server.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  /* ── Render ───────────────────────────────────────────────────────────── */

  const openDays = currentList.filter((d) => d.isOpen).length;
  const channelMeta: Record<Channel, { title: string; desc: string; icon: any }> = {
    store: { title: 'Store hours', desc: 'When your store is open for orders.', icon: Clock },
    krifoo: { title: 'Krifoo app delivery', desc: 'When customers can order delivery through the Krifoo app.', icon: Truck },
    website: { title: 'Website delivery', desc: 'When customers can order delivery on your own website.', icon: Globe },
  };
  const meta = channelMeta[channel];
  const pickerDay = picker ? currentList.find((d) => d.day === picker.day) : undefined;

  const tabLabel = (c: Channel, label: string) => {
    const n = c === 'store' ? Object.keys(errors.store).length + (errors.noOpenDay ? 1 : 0) : Object.keys(errors[c]).length;
    return n ? `${label} ⚠` : label;
  };

  return (
    <View style={formStyles.screen}>
      <ScreenHeader title="Opening hours" subtitle="Store and delivery schedules" />

      {loading ? (
        <LoadingState label="Loading opening hours…" />
      ) : loadError ? (
        <ErrorView message={loadError} onRetry={load} />
      ) : (
        <ScrollView
          contentContainerStyle={[formStyles.scroll, { paddingHorizontal: gutter, paddingBottom: SAVE_BAR_SPACE }]}
          showsVerticalScrollIndicator={false}
        >
          <FormFrame>
            {isSuperAdmin && (
              <RestaurantPicker
                restaurants={restaurants}
                selectedId={restaurantId}
                selectedName={restaurants.find((r) => r._id === restaurantId)?.restaurantName}
                onSelect={switchRestaurant}
              />
            )}

            <Segmented<Channel>
              value={channel}
              onChange={setChannel}
              options={[
                { value: 'store', label: tabLabel('store', 'Store') },
                { value: 'krifoo', label: tabLabel('krifoo', isTablet ? 'Krifoo delivery' : 'Krifoo') },
                { value: 'website', label: tabLabel('website', isTablet ? 'Website delivery' : 'Website') },
              ]}
            />

            <FormSection
              icon={meta.icon}
              title={meta.title}
              description={meta.desc}
              right={<Text style={styles.openCount}>{openDays}/7 open</Text>}
            >
              {channel !== 'store' && (
                <ToggleRow
                  title="Use different hours"
                  description={isCustom ? 'Set separate delivery hours below.' : 'Delivery follows your store hours.'}
                  value={isCustom}
                  onChange={setCustom}
                />
              )}

              {channel === 'store' && errors.noOpenDay && (
                <Notice tone="danger" icon={CircleAlert}>
                  Open at least one day so customers can order.
                </Notice>
              )}

              {channel !== 'store' && !isCustom && (
                <View style={{ marginTop: 12 }}>
                  <Notice tone="info" icon={Info}>
                    Same as store hours. Turn on “Use different hours” to change them.
                  </Notice>
                </View>
              )}

              <View style={[styles.days, !isCustom && styles.daysReadOnly]} pointerEvents={isCustom ? 'auto' : 'none'}>
                {currentList.map((d, i) => {
                  const err = currentErrors[d.day];
                  return (
                    <View key={d.day} style={[styles.dayRow, i < currentList.length - 1 && styles.dayDivider]}>
                      <View style={styles.dayTop}>
                        <Text style={styles.dayName}>{isTablet ? DAY_LABEL(d.day) : DAY_LABEL(d.day).slice(0, 3)}</Text>
                        <Switch
                          value={d.isOpen}
                          onValueChange={(v) => updateDay(d.day, { isOpen: v })}
                          trackColor={{ false: Colors.cardBorder, true: Colors.success }}
                          thumbColor="#FFFFFF"
                          ios_backgroundColor={Colors.cardBorder}
                          accessibilityLabel={`${DAY_LABEL(d.day)} open`}
                        />
                        {d.isOpen ? (
                          <View style={styles.times}>
                            <TouchableOpacity
                              style={[styles.timeBtn, !!err && styles.timeBtnError]}
                              onPress={() => setPicker({ day: d.day, field: 'openTime' })}
                              accessibilityRole="button"
                              accessibilityLabel={`${DAY_LABEL(d.day)} opens at ${format12h(d.openTime)}`}
                            >
                              <Text style={styles.timeText}>{format12h(d.openTime)}</Text>
                            </TouchableOpacity>
                            <Text style={styles.dash}>–</Text>
                            <TouchableOpacity
                              style={[styles.timeBtn, !!err && styles.timeBtnError]}
                              onPress={() => setPicker({ day: d.day, field: 'closeTime' })}
                              accessibilityRole="button"
                              accessibilityLabel={`${DAY_LABEL(d.day)} closes at ${format12h(d.closeTime)}`}
                            >
                              <Text style={styles.timeText}>{format12h(d.closeTime)}</Text>
                            </TouchableOpacity>
                          </View>
                        ) : (
                          <Text style={styles.closed}>Closed</Text>
                        )}
                      </View>
                      {err ? (
                        <View style={styles.errRow}>
                          <CircleAlert size={12} color={Colors.danger} />
                          <Text style={styles.errText}>{err}</Text>
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>

              {isCustom && (
                <View style={styles.actions}>
                  <PrimaryButton label="Copy Monday to all days" icon={Copy} tone="secondary" onPress={copyMondayToAll} style={{ flex: 1 }} />
                  {channel !== 'store' && (
                    <PrimaryButton label="Match store hours" icon={RefreshCw} tone="secondary" onPress={copyStoreHours} style={{ flex: 1 }} />
                  )}
                </View>
              )}
            </FormSection>
          </FormFrame>
        </ScrollView>
      )}

      <SaveBar visible={dirty && !loading} saving={saving} errorCount={errorCount} onSave={save} onDiscard={() => setHours(saved)} />

      {/* Time picker */}
      <Modal visible={!!picker} transparent animationType={isTablet ? 'fade' : 'slide'} onRequestClose={() => setPicker(null)}>
        <View style={[styles.overlay, isTablet && styles.overlayTablet]}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setPicker(null)} accessibilityLabel="Close" />
          <View style={[styles.sheet, isTablet && styles.sheetTablet, { paddingBottom: isTablet ? 16 : Math.max(insets.bottom, 16) }]}>
            <View style={styles.sheetHead}>
              <View>
                <Text style={styles.sheetTitle}>{picker ? DAY_LABEL(picker.day) : ''}</Text>
                <Text style={styles.sheetSub}>{picker?.field === 'openTime' ? 'Opening time' : 'Closing time'}</Text>
              </View>
              <TouchableOpacity style={styles.closeBtn} onPress={() => setPicker(null)} accessibilityLabel="Close">
                <X size={16} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.slotGrid} showsVerticalScrollIndicator={false}>
              {TIME_SLOTS.map((slot) => {
                const active = pickerDay && picker ? pickerDay[picker.field] === slot : false;
                return (
                  <TouchableOpacity
                    key={slot}
                    style={[styles.slot, { width: isTablet ? '23%' : '31%' }, active && styles.slotActive]}
                    onPress={() => {
                      if (picker) updateDay(picker.day, { [picker.field]: slot });
                      setPicker(null);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: !!active }}
                  >
                    <Text style={[styles.slotText, active && styles.slotTextActive]}>{format12h(slot)}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  openCount: { fontSize: 12, fontWeight: '800', color: Colors.textMuted },
  days: { marginTop: 8 },
  daysReadOnly: { opacity: 0.55 },
  dayRow: { paddingVertical: 10 },
  dayDivider: { borderBottomWidth: 1, borderBottomColor: Colors.cardBorder },
  dayTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dayName: { width: 90, fontSize: 15, fontWeight: '700', color: Colors.text },
  times: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 },
  timeBtn: {
    minWidth: 86,
    height: 40,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.cardSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeBtnError: { borderColor: Colors.danger, backgroundColor: '#FFFBFB' },
  timeText: { fontSize: 14, fontWeight: '700', color: Colors.text },
  dash: { fontSize: 14, color: Colors.textSubtle },
  closed: { flex: 1, textAlign: 'right', fontSize: 14, fontWeight: '600', color: Colors.textSubtle },
  errRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 5, marginTop: 6 },
  errText: { flex: 1, fontSize: 12, fontWeight: '600', color: Colors.danger },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 },

  overlay: { flex: 1, backgroundColor: 'rgba(17, 24, 28, 0.45)', justifyContent: 'flex-end' },
  overlayTablet: { justifyContent: 'center', alignItems: 'center', padding: 24 },
  sheet: { backgroundColor: Colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '75%', paddingHorizontal: 16, paddingTop: 16 },
  sheetTablet: { width: '100%', maxWidth: 520, borderRadius: 20 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: Colors.text },
  sheetSub: { fontSize: 13, color: Colors.textMuted, marginTop: 1 },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.cardSurface, alignItems: 'center', justifyContent: 'center' },
  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 8 },
  slot: {
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  slotText: { fontSize: 13, fontWeight: '700', color: Colors.textMuted },
  slotTextActive: { color: Colors.primaryDark },
});

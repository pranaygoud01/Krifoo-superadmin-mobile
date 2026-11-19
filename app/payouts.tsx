/**
 * Payouts (Super Admin) — what each restaurant is owed and what has been settled.
 *
 * Card orders: Krifoo collected the money → it is owed to the restaurant ("To pay out").
 * Cash orders: the restaurant already has the money ("Collected by restaurant").
 * Settling records that the payout happened (with an optional bank reference).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Wallet, Check, ChevronDown, Store, CalendarDays, Undo2 } from 'lucide-react-native';
import { Colors } from '../constants/colors';
import { useToast } from '../context/ToastContext';
import { ScreenHeader } from '../components/ScreenHeader';
import { BottomSheet } from '../components/ui/BottomSheet';
import { Field, PrimaryButton, Notice } from '../components/settings/FormKit';
import { SearchBar, FilterChips, Badge, EmptyState, LoadError, formatGBP, listStyles } from '../components/ui/ListKit';
import {
  payoutService,
  getOrderItemsCost,
  type PayoutFilters,
  type PayoutOrder,
  type PayoutPaymentFilter,
  type PayoutRestaurant,
  type PayoutStatusFilter,
  type PayoutSummary,
} from '../services/payout.service';

type PeriodKey = 'this_week' | 'this_month' | 'last_month' | 'all';

const PERIODS: { value: PeriodKey; label: string }[] = [
  { value: 'this_week', label: 'This week' },
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'all', label: 'All time' },
];

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function periodRange(p: PeriodKey): { startDate?: string; endDate?: string } {
  const now = new Date();
  if (p === 'this_week') {
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    return { startDate: ymd(monday), endDate: ymd(now) };
  }
  if (p === 'this_month') return { startDate: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), endDate: ymd(now) };
  if (p === 'last_month') {
    return {
      startDate: ymd(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      endDate: ymd(new Date(now.getFullYear(), now.getMonth(), 0)),
    };
  }
  return {};
}

const restaurantNameOf = (o: PayoutOrder) =>
  (typeof o.restaurantId === 'object' && (o.restaurantId as any)?.restaurantName) || 'Restaurant';

const formatDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

/** What the settle sheet is about to do. */
type SettleTarget =
  | { mode: 'selected'; ids: string[]; count: number; amount: number }
  | { mode: 'filter'; count: number; amount: number }
  | { mode: 'single'; order: PayoutOrder };

export default function PayoutsScreen() {
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  // Filters
  const [status, setStatus] = useState<PayoutStatusFilter>('unsettled');
  const [paymentType, setPaymentType] = useState<PayoutPaymentFilter>('all');
  const [period, setPeriod] = useState<PeriodKey>('this_month');
  const [restaurant, setRestaurant] = useState<PayoutRestaurant | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  // Data
  const [orders, setOrders] = useState<PayoutOrder[]>([]);
  const [summary, setSummary] = useState<PayoutSummary | null>(null);
  const [restaurants, setRestaurants] = useState<PayoutRestaurant[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // UI
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [restaurantSheet, setRestaurantSheet] = useState(false);
  const [restaurantQuery, setRestaurantQuery] = useState('');
  const [periodSheet, setPeriodSheet] = useState(false);
  const [detail, setDetail] = useState<PayoutOrder | null>(null);
  const [settleTarget, setSettleTarget] = useState<SettleTarget | null>(null);
  const [reference, setReference] = useState('');
  const [saving, setSaving] = useState(false);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const filters: PayoutFilters = useMemo(
    () => ({
      restaurantId: restaurant?._id || 'all',
      payoutStatus: status,
      paymentType,
      search,
      ...periodRange(period),
    }),
    [restaurant, status, paymentType, search, period]
  );

  const requestId = useRef(0);
  const load = useCallback(
    async (nextPage = 1) => {
      const id = ++requestId.current;
      if (nextPage > 1) setLoadingMore(true);
      try {
        const res = await payoutService.list(filters, nextPage);
        if (id !== requestId.current) return; // a newer filter change won
        if (!res.success) throw new Error(res.message || 'Could not load payouts.');
        setOrders((prev) => (nextPage === 1 ? res.data || [] : [...prev, ...(res.data || [])]));
        setSummary(res.summary || null);
        if (res.restaurants) setRestaurants(res.restaurants);
        setPage(res.pagination?.page || nextPage);
        setTotalPages(res.pagination?.totalPages || 1);
        setLoadError(null);
      } catch (err: any) {
        if (id === requestId.current) setLoadError(err?.message || 'Could not load payouts.');
      } finally {
        if (id === requestId.current) {
          setLoading(false);
          setRefreshing(false);
          setLoadingMore(false);
        }
      }
    },
    [filters]
  );

  useEffect(() => {
    setLoading(true);
    setSelected(new Set());
    load(1);
  }, [load]);

  const reload = () => {
    setSelected(new Set());
    return load(1);
  };

  // Selection (unsettled orders only)
  const toggleSelect = (o: PayoutOrder) => {
    if (o.payoutStatus === 'settled') return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(o._id)) next.delete(o._id);
      else next.add(o._id);
      return next;
    });
  };
  const selectedOrders = orders.filter((o) => selected.has(o._id));
  const selectedAmount = selectedOrders.reduce((sum, o) => sum + getOrderItemsCost(o), 0);
  const selectableOnScreen = orders.filter((o) => o.payoutStatus !== 'settled');
  const allOnScreenSelected = selectableOnScreen.length > 0 && selectableOnScreen.every((o) => selected.has(o._id));

  // Settling
  const openSettle = (target: SettleTarget) => {
    setReference('');
    setSettleTarget(target);
  };

  const confirmSettle = async () => {
    if (!settleTarget) return;
    setSaving(true);
    try {
      let res: { success: boolean; message?: string };
      if (settleTarget.mode === 'selected') res = await payoutService.settleOrders(settleTarget.ids, 'settle', reference.trim());
      else if (settleTarget.mode === 'filter') res = await payoutService.settleByFilter(filters, reference.trim());
      else res = await payoutService.toggle(settleTarget.order._id, reference.trim());

      if (!res.success) throw new Error(res.message || 'Could not settle.');
      showToast({ title: 'Settled', message: res.message || 'Orders marked as settled.', type: 'success' });
      setSettleTarget(null);
      setDetail(null);
      await reload();
    } catch (err: any) {
      showToast({ title: 'Not settled', message: err?.message || 'Could not settle.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const unsettle = async (o: PayoutOrder) => {
    setSaving(true);
    try {
      const res = await payoutService.toggle(o._id);
      if (!res.success) throw new Error(res.message || 'Could not update.');
      showToast({ title: 'Marked unsettled', message: res.message || '', type: 'success' });
      setDetail(null);
      await reload();
    } catch (err: any) {
      showToast({ title: 'Not updated', message: err?.message || 'Could not update.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const visibleRestaurants = restaurants.filter((r) =>
    r.restaurantName?.toLowerCase().includes(restaurantQuery.trim().toLowerCase())
  );
  const periodLabel = PERIODS.find((p) => p.value === period)?.label || 'All time';

  const s = summary;
  const canSettleAll = status === 'unsettled' && !search && (s?.unsettledOrdersCount || 0) > 0;

  /* ── Rendering ───────────────────────────────────────────────────────── */

  const renderOrder = ({ item: o }: { item: PayoutOrder }) => {
    const settled = o.payoutStatus === 'settled';
    const isSelected = selected.has(o._id);
    const pay = String(o.paymentType || '').toLowerCase();
    return (
      <TouchableOpacity
        style={[styles.row, isSelected && styles.rowSelected]}
        onPress={() => setDetail(o)}
        onLongPress={() => toggleSelect(o)}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={`Order ${o.orderNumber}, ${restaurantNameOf(o)}, ${formatGBP(getOrderItemsCost(o))}, ${settled ? 'settled' : 'unsettled'}`}
      >
        {settled ? (
          <View style={[styles.checkbox, styles.checkboxDone]}>
            <Check size={14} color="#047857" strokeWidth={3} />
          </View>
        ) : (
          <TouchableOpacity
            onPress={() => toggleSelect(o)}
            style={[styles.checkbox, isSelected && styles.checkboxOn]}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: isSelected }}
            accessibilityLabel={`Select order ${o.orderNumber}`}
          >
            {isSelected ? <Check size={14} color="#FFFFFF" strokeWidth={3} /> : null}
          </TouchableOpacity>
        )}
        <View style={listStyles.flex}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            #{o.orderNumber} · {restaurantNameOf(o)}
          </Text>
          <Text style={styles.rowSub} numberOfLines={1}>
            {formatDate(o.createdAt)} · {pay === 'card' ? 'Card' : pay === 'cash' ? 'Cash' : pay || '—'}
            {settled && o.settlementReference ? ` · ${o.settlementReference}` : ''}
          </Text>
        </View>
        <View style={styles.rowRight}>
          <Text style={styles.rowAmount}>{formatGBP(getOrderItemsCost(o))}</Text>
          <Badge label={settled ? 'Settled' : 'Unsettled'} tone={settled ? 'success' : 'warning'} />
        </View>
      </TouchableOpacity>
    );
  };

  const header = (
    <View>
      <FilterChips<PayoutStatusFilter>
        options={[
          { value: 'unsettled', label: 'Unsettled' },
          { value: 'settled', label: 'Settled' },
          { value: 'all', label: 'All' },
        ]}
        value={status}
        onChange={setStatus}
      />

      <View style={styles.filterRow}>
        <TouchableOpacity style={styles.pickerBtn} onPress={() => setRestaurantSheet(true)} activeOpacity={0.7}>
          <Store size={16} color={Colors.textMuted} />
          <Text style={styles.pickerText} numberOfLines={1}>{restaurant?.restaurantName || 'All restaurants'}</Text>
          <ChevronDown size={16} color={Colors.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.pickerBtn} onPress={() => setPeriodSheet(true)} activeOpacity={0.7}>
          <CalendarDays size={16} color={Colors.textMuted} />
          <Text style={styles.pickerText} numberOfLines={1}>{periodLabel}</Text>
          <ChevronDown size={16} color={Colors.textMuted} />
        </TouchableOpacity>
      </View>

      <FilterChips<PayoutPaymentFilter>
        options={[
          { value: 'all', label: 'All payments' },
          { value: 'card', label: 'Card' },
          { value: 'cash', label: 'Cash' },
        ]}
        value={paymentType}
        onChange={setPaymentType}
      />
      <SearchBar value={searchInput} onChangeText={setSearchInput} placeholder="Order number, customer or reference" />

      {s ? (
        <View style={[styles.summaryGrid, isTablet && styles.summaryGridTablet]}>
          <View style={[styles.summaryCard, styles.summaryPrimary]}>
            <Text style={styles.summaryLabel}>To pay out (card)</Text>
            <Text style={styles.summaryValue}>{formatGBP(s.unsettledCardItemsCost ?? 0)}</Text>
            <Text style={styles.summarySub}>{s.unsettledCardOrdersCount ?? 0} unsettled card orders</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Collected by restaurant (cash)</Text>
            <Text style={styles.summaryValue}>{formatGBP(s.unsettledCashItemsCost ?? 0)}</Text>
            <Text style={styles.summarySub}>{s.unsettledCashOrdersCount ?? 0} unsettled cash orders</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Settled</Text>
            <Text style={styles.summaryValue}>{formatGBP(s.settledItemsCost)}</Text>
            <Text style={styles.summarySub}>{s.settledOrdersCount} orders</Text>
          </View>
        </View>
      ) : null}
      <Text style={styles.footnote}>Amounts are the food total (before delivery fees and discounts). Cancelled orders are excluded.</Text>

      {canSettleAll ? (
        <TouchableOpacity
          style={styles.settleAllBtn}
          onPress={() => openSettle({ mode: 'filter', count: s!.unsettledOrdersCount, amount: s!.unsettledItemsCost })}
          activeOpacity={0.8}
        >
          <Wallet size={16} color={Colors.primary} />
          <Text style={styles.settleAllText}>
            Settle all {s!.unsettledOrdersCount} unsettled · {formatGBP(s!.unsettledItemsCost)}
          </Text>
        </TouchableOpacity>
      ) : null}

      <View style={styles.listHeader}>
        <Text style={listStyles.sectionHeader}>Orders{s ? ` (${s.totalOrders})` : ''}</Text>
        {selectableOnScreen.length > 0 ? (
          <TouchableOpacity
            onPress={() => setSelected(allOnScreenSelected ? new Set() : new Set(selectableOnScreen.map((o) => o._id)))}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.selectAll}>{allOnScreenSelected ? 'Clear selection' : 'Select all shown'}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Payouts" subtitle="What restaurants are owed and what's settled" />

      {loading && orders.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      ) : loadError && orders.length === 0 ? (
        <LoadError message={loadError} onRetry={() => { setLoading(true); load(1); }} />
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(o) => o._id}
          renderItem={renderOrder}
          ListHeaderComponent={header}
          ListEmptyComponent={
            <EmptyState
              icon={Wallet}
              title={status === 'unsettled' ? 'Nothing to settle' : 'No orders'}
              message="Try another restaurant, period or payment type."
            />
          }
          ListFooterComponent={loadingMore ? <ActivityIndicator style={{ marginVertical: 16 }} color={Colors.primary} /> : null}
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (!loadingMore && !loading && page < totalPages) load(page + 1);
          }}
          contentContainerStyle={[styles.list, listStyles.frame, { paddingBottom: selected.size > 0 ? 120 : 32 }]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); reload(); }} tintColor={Colors.primary} colors={[Colors.primary]} />
          }
        />
      )}

      {/* Sticky bar while orders are selected */}
      {selected.size > 0 && (
        <View style={[styles.selectionBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <View style={[styles.selectionInner, listStyles.frame]}>
            <TouchableOpacity onPress={() => setSelected(new Set())} style={styles.clearBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.clearText}>Clear</Text>
            </TouchableOpacity>
            <PrimaryButton
              label={`Settle ${selected.size} ${selected.size === 1 ? 'order' : 'orders'} · ${formatGBP(selectedAmount)}`}
              icon={Wallet}
              onPress={() => openSettle({ mode: 'selected', ids: Array.from(selected), count: selected.size, amount: selectedAmount })}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      )}

      {/* Restaurant picker */}
      <BottomSheet visible={restaurantSheet} title="Restaurant" onClose={() => setRestaurantSheet(false)}>
        <SearchBar value={restaurantQuery} onChangeText={setRestaurantQuery} placeholder="Search restaurants" />
        {[{ _id: '', restaurantName: 'All restaurants' } as PayoutRestaurant, ...visibleRestaurants].map((r) => {
          const active = (restaurant?._id || '') === r._id;
          return (
            <TouchableOpacity
              key={r._id || 'all'}
              style={[styles.option, active && styles.optionActive]}
              onPress={() => {
                setRestaurant(r._id ? r : null);
                setRestaurantSheet(false);
              }}
            >
              <Text style={[styles.optionText, active && styles.optionTextActive]} numberOfLines={1}>{r.restaurantName}</Text>
              {active ? <Check size={18} color={Colors.primary} /> : null}
            </TouchableOpacity>
          );
        })}
      </BottomSheet>

      {/* Period picker */}
      <BottomSheet visible={periodSheet} title="Period" onClose={() => setPeriodSheet(false)}>
        {PERIODS.map((p) => {
          const active = p.value === period;
          return (
            <TouchableOpacity
              key={p.value}
              style={[styles.option, active && styles.optionActive]}
              onPress={() => {
                setPeriod(p.value);
                setPeriodSheet(false);
              }}
            >
              <Text style={[styles.optionText, active && styles.optionTextActive]}>{p.label}</Text>
              {active ? <Check size={18} color={Colors.primary} /> : null}
            </TouchableOpacity>
          );
        })}
      </BottomSheet>

      {/* Order detail */}
      <BottomSheet
        visible={!!detail && !settleTarget}
        title={detail ? `Order #${detail.orderNumber}` : ''}
        subtitle={detail ? restaurantNameOf(detail) : undefined}
        onClose={() => setDetail(null)}
        footer={
          detail ? (
            detail.payoutStatus === 'settled' ? (
              <PrimaryButton label="Mark as unsettled" icon={Undo2} tone="secondary" loading={saving} onPress={() => unsettle(detail)} />
            ) : (
              <PrimaryButton label="Settle this order" icon={Wallet} onPress={() => openSettle({ mode: 'single', order: detail })} />
            )
          ) : null
        }
      >
        {detail ? (
          <View style={styles.detailList}>
            <DetailRow label="Placed" value={formatDate(detail.createdAt)} />
            <DetailRow label="Customer" value={(detail as any).customerDetails?.name || (detail.customerId as any)?.fullName || '—'} />
            <DetailRow label="Payment" value={`${String(detail.paymentType || '—')} · ${String(detail.paymentStatus || 'pending')}`} />
            <DetailRow label="Order status" value={String(detail.status).replace(/_/g, ' ')} />
            <DetailRow label="Food total" value={formatGBP(getOrderItemsCost(detail))} strong />
            <DetailRow label="Customer paid" value={formatGBP((detail as any).pricing?.totalAmount ?? 0)} />
            {detail.payoutStatus === 'settled' ? (
              <>
                <DetailRow label="Settled" value={formatDate(detail.settledAt)} />
                <DetailRow label="Reference" value={detail.settlementReference || '—'} />
                <DetailRow
                  label="Settled by"
                  value={typeof detail.settledBy === 'object' && detail.settledBy ? detail.settledBy.fullName || detail.settledBy.email || '—' : '—'}
                />
              </>
            ) : null}
          </View>
        ) : null}
      </BottomSheet>

      {/* Settle confirmation */}
      <BottomSheet
        visible={!!settleTarget}
        title="Mark as settled"
        subtitle={
          settleTarget
            ? settleTarget.mode === 'single'
              ? `Order #${settleTarget.order.orderNumber} · ${formatGBP(getOrderItemsCost(settleTarget.order))}`
              : `${settleTarget.count} ${settleTarget.count === 1 ? 'order' : 'orders'} · ${formatGBP(settleTarget.amount)}`
            : undefined
        }
        onClose={() => !saving && setSettleTarget(null)}
        footer={<PrimaryButton label="Confirm settled" icon={Check} loading={saving} onPress={confirmSettle} />}
      >
        {settleTarget?.mode === 'filter' ? (
          <Notice tone="warning" title="This settles every matching order">
            All {settleTarget.count} unsettled orders for {restaurant?.restaurantName || 'all restaurants'} ({periodLabel.toLowerCase()}
            {paymentType !== 'all' ? `, ${paymentType} only` : ''}) will be marked as settled — not just the ones on screen.
          </Notice>
        ) : null}
        <Field
          label="Reference (optional)"
          placeholder="e.g. BACS 0042 or Stripe payout ID"
          value={reference}
          onChangeText={setReference}
          maxLength={200}
          hint="Shown on each order so you can match it to the bank transfer."
        />
      </BottomSheet>
    </View>
  );
}

function DetailRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, strong && styles.detailValueStrong]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: 16, paddingTop: 4 },

  filterRow: { flexDirection: 'row', gap: 8, marginTop: 2 },
  pickerBtn: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: '#FFFFFF',
  },
  pickerText: { flex: 1, minWidth: 0, fontSize: 14, fontWeight: '600', color: Colors.text },

  summaryGrid: { gap: 10, marginTop: 14 },
  summaryGridTablet: { flexDirection: 'row' },
  summaryCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  summaryPrimary: { borderColor: '#FDBA74', backgroundColor: '#FFF7ED' },
  summaryLabel: { fontSize: 13, fontWeight: '600', color: Colors.textMuted },
  summaryValue: { fontSize: 22, fontWeight: '800', color: Colors.text, marginTop: 4, fontVariant: ['tabular-nums'] },
  summarySub: { fontSize: 12.5, color: Colors.textMuted, marginTop: 2 },
  footnote: { fontSize: 12, color: Colors.textMuted, marginTop: 8 },

  settleAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 44,
    marginTop: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FDBA74',
    backgroundColor: '#FFFFFF',
  },
  settleAllText: { fontSize: 14, fontWeight: '700', color: Colors.primary },

  listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
  selectAll: { fontSize: 13.5, fontWeight: '700', color: Colors.primary },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 8,
  },
  rowSelected: { borderColor: Colors.primary, backgroundColor: '#FFF7ED' },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  checkboxOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  checkboxDone: { borderColor: '#A7F3D0', backgroundColor: '#ECFDF5' },
  rowTitle: { fontSize: 15, fontWeight: '700', color: Colors.text },
  rowSub: { fontSize: 13, color: Colors.textMuted, marginTop: 2 },
  rowRight: { alignItems: 'flex-end', gap: 4 },
  rowAmount: { fontSize: 15, fontWeight: '800', color: Colors.text, fontVariant: ['tabular-nums'] },

  selectionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: Colors.cardBorder,
    paddingTop: 12,
    paddingHorizontal: 16,
  },
  selectionInner: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  clearBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  clearText: { fontSize: 14, fontWeight: '700', color: Colors.textMuted },

  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginTop: 4,
  },
  optionActive: { backgroundColor: '#FFF7ED' },
  optionText: { flex: 1, fontSize: 15, color: Colors.text, fontWeight: '500' },
  optionTextActive: { fontWeight: '700', color: Colors.primary },

  detailList: { gap: 2 },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F3F5',
  },
  detailLabel: { fontSize: 14, color: Colors.textMuted },
  detailValue: { flexShrink: 1, fontSize: 14, fontWeight: '600', color: Colors.text, textAlign: 'right', textTransform: 'capitalize' },
  detailValueStrong: { fontWeight: '800' },
});

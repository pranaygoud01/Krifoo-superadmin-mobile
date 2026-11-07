/**
 * Super Admin overview — designed to answer, at a glance:
 *   1. How is the business doing?   (sales, earnings, growth vs the previous period)
 *   2. What needs me right now?     (late orders, approvals, payout setup, quiet stores)
 *   3. Where does growth come from? (trend, order types, channels, stores)
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, useWindowDimensions } from 'react-native';
import {
  CalendarRange,
  Clock,
  Store,
  CreditCard,
  Moon,
  ChevronRight,
  ShoppingBag,
  ChefHat,
  Bike,
  CircleCheck,
  Plus,
  Megaphone,
  Users,
  ListOrdered,
  Info,
} from 'lucide-react-native';
import { Colors } from '../../constants/colors';
import { Delta } from './Delta';
import { StoreSalesSection } from './StoreSalesSection';
import { Order, Restaurant } from '../../types';
import {
  PeriodPreset,
  Period,
  getPeriod,
  summarise,
  change,
  orderTypeMix,
  channelMix,
  paymentMix,
  storeRows,
  liveCounts,
  firstOrderIndex,
  needsPayoutSetup,
  formatMoneyCompact,
  formatPercent,
  formatCount,
  MixSlice,
} from '../../services/admin-metrics';

/** Categorical slots 1–4 of the validated reference palette (fixed order, never cycled). */
const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100'];
const DOWN = Colors.statusRejected.text;

interface Props {
  orders: Order[];
  restaurants: Restaurant[];
  ridersCount: number;
  preset: PeriodPreset;
  onPresetChange: (p: PeriodPreset) => void;
  customRange: { start: Date; end: Date };
  onOpenCustomRange: () => void;
  onOpenStore: (restaurantId: string) => void;
  onNavigate: (route: 'orders' | 'restaurants' | 'riders' | 'marketing') => void;
  lastUpdated?: Date | null;
}

export function SuperAdminDashboard({
  orders,
  restaurants,
  ridersCount,
  preset,
  onPresetChange,
  customRange,
  onOpenCustomRange,
  onOpenStore,
  onNavigate,
  lastUpdated,
}: Props) {
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  const period = useMemo(() => getPeriod(preset, customRange), [preset, customRange]);
  const firstOrders = useMemo(() => firstOrderIndex(orders), [orders]);
  const now = useMemo(() => summarise(orders, restaurants, period.start, period.end, firstOrders), [orders, restaurants, period, firstOrders]);
  const prev = useMemo(() => summarise(orders, restaurants, period.prevStart, period.prevEnd, firstOrders), [orders, restaurants, period, firstOrders]);
  const types = useMemo(() => orderTypeMix(orders, period), [orders, period]);
  const channels = useMemo(() => channelMix(orders, period), [orders, period]);
  const payments = useMemo(() => paymentMix(orders, period), [orders, period]);
  const stores = useMemo(() => storeRows(orders, restaurants, period), [orders, restaurants, period]);
  const live = useMemo(() => liveCounts(orders), [orders]);

  const liveStores = restaurants.filter((r) => r.isActive && r.verificationStatus === 'approved').length;
  const pendingApprovals = restaurants.filter((r) => r.verificationStatus === 'pending').length;
  const payoutSetup = restaurants.filter(needsPayoutSetup).length;
  const dormant = stores.filter((s) => s.flags.includes('dormant')).length;
  const salesChange = change(now.sales, prev.sales);

  const attention = [
    live.waitingLate > 0 && { icon: Clock, tone: 'danger' as const, title: `${live.waitingLate} order${live.waitingLate === 1 ? '' : 's'} waiting over 5 min`, sub: 'Not yet accepted by the restaurant', go: 'orders' as const },
    pendingApprovals > 0 && { icon: Store, tone: 'warning' as const, title: `${pendingApprovals} store${pendingApprovals === 1 ? '' : 's'} waiting for approval`, sub: 'Review documents to let them start selling', go: 'restaurants' as const },
    payoutSetup > 0 && { icon: CreditCard, tone: 'warning' as const, title: `${payoutSetup} store${payoutSetup === 1 ? '' : 's'} can’t be paid yet`, sub: 'Stripe payout setup not finished', go: 'restaurants' as const },
    dormant > 0 && { icon: Moon, tone: 'info' as const, title: `${dormant} live store${dormant === 1 ? '' : 's'} with no orders in 7 days`, sub: 'May need help with menu, hours or marketing', go: 'restaurants' as const },
  ].filter(Boolean) as { icon: any; tone: 'danger' | 'warning' | 'info'; title: string; sub: string; go: 'orders' | 'restaurants' }[];

  return (
    <View style={styles.root}>
      {/* ── Period ──────────────────────────────────────────────────── */}
      <PeriodPicker preset={preset} period={period} onChange={onPresetChange} onCustom={onOpenCustomRange} />

      {/* ── 1. Headline ─────────────────────────────────────────────── */}
      
      {/* ── 2. Needs attention ──────────────────────────────────────── */}
      {attention.length > 0 && (
        <Section title="Needs your attention">
          {attention.map((a, i) => (
            <TouchableOpacity
              key={a.title}
              style={[styles.attnRow, i < attention.length - 1 && styles.rowDivider]}
              onPress={() => onNavigate(a.go)}
              activeOpacity={0.7}
              accessibilityRole="button"
            >
              <View style={[styles.attnIcon, { backgroundColor: TONE_BG[a.tone] }]}>
                <a.icon size={17} color={TONE_FG[a.tone]} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.rowTitle}>{a.title}</Text>
                <Text style={styles.rowSub}>{a.sub}</Text>
              </View>
              <ChevronRight size={18} color={Colors.textSubtle} />
            </TouchableOpacity>
          ))}
        </Section>
      )}

      {/* ── 3. Live now ─────────────────────────────────────────────── */}
      <Section title="Live now" right={<Text style={styles.sectionMeta}>{lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : ''}</Text>}>
        <View style={styles.pipeline}>
          <Stage icon={ShoppingBag} label="Waiting to accept" value={live.waiting} alert={live.waitingLate > 0} onPress={() => onNavigate('orders')} />
          <Stage icon={ChefHat} label="Preparing" value={live.preparing} onPress={() => onNavigate('orders')} />
          <Stage icon={Bike} label="Ready / on the way" value={live.onTheWay} onPress={() => onNavigate('orders')} />
          <Stage icon={CircleCheck} label="Completed today" value={live.completedToday} onPress={() => onNavigate('orders')} />
        </View>
      </Section>

      <View style={isTablet ? styles.twoCol : undefined}>
        <View style={isTablet ? styles.col : undefined}>
          {/* ── 4. Key numbers ───────────────────────────────────────── */}
          <Section title="Key numbers" right={<Text style={styles.sectionMeta}>{period.compareLabel}</Text>}>
            <View style={styles.kpiGrid}>
              <Kpi label="Sales" value={formatMoneyCompact(now.sales)} delta={change(now.sales, prev.sales)} prev={formatMoneyCompact(prev.sales)} />
              <Kpi label="Krifoo earnings" value={formatMoneyCompact(now.earnings)} delta={change(now.earnings, prev.earnings)} prev={formatMoneyCompact(prev.earnings)} />
              <Kpi label="Orders" value={formatCount(now.orders)} delta={change(now.orders, prev.orders)} prev={formatCount(prev.orders)} />
              <Kpi label="Average order" value={formatMoneyCompact(now.avgOrder)} delta={change(now.avgOrder, prev.avgOrder)} prev={formatMoneyCompact(prev.avgOrder)} />
              <Kpi
                label="Cancelled"
                value={formatPercent(now.cancelRate)}
                delta={now.placed || prev.placed ? now.cancelRate - prev.cancelRate : 0}
                prev={formatPercent(prev.cancelRate)}
                lowerIsBetter
                absolute
              />
              <Kpi
                label="Customers"
                value={formatCount(now.customers)}
                delta={change(now.customers, prev.customers)}
                prev={formatCount(prev.customers)}
                hint={now.customers ? `${now.newCustomers} new` : undefined}
              />
            </View>
          </Section>

        </View>

        <View style={isTablet ? styles.col : undefined}>
          {/* ── 6. Where sales come from ─────────────────────────────── */}
          <Section title="Where sales come from">
            <MixBar title="Order type" slices={types} />
            <MixBar title="Channel" slices={channels} />
            <MixBar title="Payment" slices={payments} last />
          </Section>
        </View>
      </View>

      {/* ── 7. Store sales — every store, full width ──────────────── */}
      <StoreSalesSection rows={stores} periodLabel={period.label} onOpenStore={onOpenStore} />

      {/* ── Quick actions ───────────────────────────────────────────── */}
      <View style={styles.actions}>
        <QuickAction icon={Plus} label="Stores" onPress={() => onNavigate('restaurants')} />
        <QuickAction icon={ListOrdered} label="All orders" onPress={() => onNavigate('orders')} />
        <QuickAction icon={Users} label={`Riders${ridersCount ? ` (${ridersCount})` : ''}`} onPress={() => onNavigate('riders')} />
        <QuickAction icon={Megaphone} label="Broadcast" onPress={() => onNavigate('marketing')} />
      </View>

      <View style={styles.footnote}>
        <Info size={13} color={Colors.textSubtle} />
        <Text style={styles.footnoteText}>
          Sales = completed orders including fees. Krifoo earnings are estimated from each store’s commission rate plus platform fees. Cancelled
          = cancelled ÷ all orders placed.
        </Text>
      </View>
    </View>
  );
}

/* ── Copy ──────────────────────────────────────────────────────────────── */

function headline(now: ReturnType<typeof summarise>, prev: ReturnType<typeof summarise>, salesChange: number | null, period: Period): string {
  if (now.orders === 0 && prev.orders === 0) return 'No completed orders yet in this period.';
  if (salesChange === null) return `First sales in this period — ${now.orders} completed order${now.orders === 1 ? '' : 's'}.`;
  const dir = salesChange > 0.005 ? 'up' : salesChange < -0.005 ? 'down' : 'flat';
  const ordersDelta = now.orders - prev.orders;
  const driver =
    dir === 'flat'
      ? ''
      : Math.abs(change(now.orders, prev.orders) || 0) >= Math.abs(change(now.avgOrder, prev.avgOrder) || 0)
      ? ` — ${Math.abs(ordersDelta)} ${ordersDelta >= 0 ? 'more' : 'fewer'} orders`
      : ` — average order ${now.avgOrder >= prev.avgOrder ? 'up' : 'down'} to ${formatMoneyCompact(now.avgOrder)}`;
  return dir === 'flat'
    ? `Sales are level ${period.compareLabel.replace('vs', 'with')}.`
    : `Sales are ${dir} ${formatPercent(Math.abs(salesChange), 0)} ${period.compareLabel}${driver}.`;
}

/* ── Pieces ────────────────────────────────────────────────────────────── */

const TONE_BG = { danger: Colors.statusRejected.bg, warning: Colors.statusPending.bg, info: Colors.statusActive.bg };
const TONE_FG = { danger: Colors.statusRejected.text, warning: Colors.statusPending.text, info: Colors.statusActive.text };

function PeriodPicker({ preset, period, onChange, onCustom }: { preset: PeriodPreset; period: Period; onChange: (p: PeriodPreset) => void; onCustom: () => void }) {
  const options: { value: PeriodPreset; label: string }[] = [
    { value: 'today', label: 'Today' },
    { value: 'yesterday', label: 'Yesterday' },
    { value: '7d', label: '7 days' },
    { value: '30d', label: '30 days' },
    { value: 'month', label: 'This month' },
  ];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.periods}>
      {options.map((o) => {
        const active = preset === o.value;
        return (
          <TouchableOpacity
            key={o.value}
            style={[styles.period, active && styles.periodActive]}
            onPress={() => onChange(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.periodText, active && styles.periodTextActive]}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
      <TouchableOpacity
        style={[styles.period, preset === 'custom' && styles.periodActive]}
        onPress={onCustom}
        accessibilityRole="button"
        accessibilityState={{ selected: preset === 'custom' }}
      >
        <CalendarRange size={14} color={preset === 'custom' ? '#FFFFFF' : Colors.textMuted} />
        <Text style={[styles.periodText, preset === 'custom' && styles.periodTextActive]}>{preset === 'custom' ? period.label : 'Custom'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {right}
      </View>
      {children}
    </View>
  );
}

function HeroStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <View style={styles.heroStat}>
      <Text style={styles.heroStatValue}>{value}</Text>
      <Text style={styles.heroStatLabel}>{label}</Text>
      {hint ? <Text style={styles.heroStatHint}>{hint}</Text> : null}
    </View>
  );
}

function Stage({ icon: Icon, label, value, alert, onPress }: { icon: any; label: string; value: number; alert?: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.stage, alert && styles.stageAlert]} onPress={onPress} activeOpacity={0.75} accessibilityRole="button" accessibilityLabel={`${label}: ${value}`}>
      <Icon size={16} color={alert ? DOWN : Colors.textMuted} />
      <Text style={[styles.stageValue, alert && { color: DOWN }]}>{value}</Text>
      <Text style={styles.stageLabel} numberOfLines={2}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function Kpi({
  label,
  value,
  delta,
  prev,
  hint,
  lowerIsBetter,
  absolute,
}: {
  label: string;
  value: string;
  delta: number | null;
  prev: string;
  hint?: string;
  lowerIsBetter?: boolean;
  absolute?: boolean;
}) {
  return (
    <View style={styles.kpi}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={styles.kpiValue}>{value}</Text>
      <Delta value={delta} lowerIsBetter={lowerIsBetter} absolute={absolute} small />
      <Text style={styles.kpiPrev}>
        Before: {prev}
        {hint ? ` · ${hint}` : ''}
      </Text>
    </View>
  );
}

function MixBar({ title, slices, last }: { title: string; slices: MixSlice[]; last?: boolean }) {
  const total = slices.reduce((s, x) => s + x.sales, 0);
  const visible = slices.map((s, i) => ({ ...s, color: SERIES[i] })).filter((s) => s.sales > 0 || total === 0);
  return (
    <View style={[styles.mix, !last && styles.rowDivider]}>
      <Text style={styles.mixTitle}>{title}</Text>
      {total === 0 ? (
        <Text style={styles.empty}>No sales yet.</Text>
      ) : (
        <>
          <View style={styles.stack} accessibilityLabel={`${title}: ${visible.map((s) => `${s.label} ${formatPercent(s.sales / total, 0)}`).join(', ')}`}>
            {visible.map((s) => (
              <View key={s.key} style={[styles.stackSeg, { flex: s.sales, backgroundColor: s.color }]} />
            ))}
          </View>
          {visible.map((s) => (
            <View key={s.key} style={styles.legendRow}>
              <View style={[styles.legendDot, { backgroundColor: s.color }]} />
              <Text style={styles.legendLabel}>{s.label}</Text>
              <Text style={styles.legendValue}>{formatMoneyCompact(s.sales)}</Text>
              <Text style={styles.legendPct}>{formatPercent(s.sales / total, 0)}</Text>
            </View>
          ))}
        </>
      )}
    </View>
  );
}

function QuickAction({ icon: Icon, label, onPress }: { icon: any; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.action} onPress={onPress} activeOpacity={0.75} accessibilityRole="button">
      <Icon size={18} color={Colors.primary} />
      <Text style={styles.actionText} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

/* ── Styles ────────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  root: { gap: 14 },
  flex: { flex: 1, minWidth: 0 },
  twoCol: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  col: { flex: 1, minWidth: 0, gap: 14 },

  periods: { gap: 8, paddingVertical: 2 },
  period: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: Colors.cardBorder, backgroundColor: Colors.background },
  periodActive: { backgroundColor: Colors.text, borderColor: Colors.text },
  periodText: { fontSize: 13, fontWeight: '700', color: Colors.textMuted },
  periodTextActive: { color: '#FFFFFF' },

  hero: { backgroundColor: Colors.background, borderRadius: 20, borderWidth: 1, borderColor: Colors.cardBorder, padding: 18 },
  heroLabel: { fontSize: 13, fontWeight: '700', color: Colors.textMuted },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4, flexWrap: 'wrap' },
  heroValue: { fontSize: 36, fontWeight: '900', color: Colors.text, letterSpacing: -1 },
  heroSentence: { fontSize: 14, color: Colors.textMuted, marginTop: 6, lineHeight: 20 },
  heroStats: { flexDirection: 'row', marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: Colors.cardBorder },
  heroStat: { flex: 1, minWidth: 0 },
  heroDivider: { width: 1, backgroundColor: Colors.cardBorder, marginHorizontal: 12 },
  heroStatValue: { fontSize: 18, fontWeight: '900', color: Colors.text },
  heroStatLabel: { fontSize: 12, fontWeight: '700', color: Colors.textMuted, marginTop: 2 },
  heroStatHint: { fontSize: 11.5, color: Colors.textSubtle, marginTop: 1 },

  section: { backgroundColor: Colors.background, borderRadius: 18, borderWidth: 1, borderColor: Colors.cardBorder, padding: 16 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionTitle: { flex: 1, fontSize: 16, fontWeight: '800', color: Colors.text, letterSpacing: -0.2 },
  sectionMeta: { fontSize: 12, color: Colors.textSubtle, fontWeight: '600' },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: Colors.cardBorder },
  rowTitle: { fontSize: 14.5, fontWeight: '700', color: Colors.text },
  rowSub: { fontSize: 12.5, color: Colors.textMuted, marginTop: 2 },
  empty: { fontSize: 13.5, color: Colors.textMuted, paddingVertical: 8 },


  attnRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  attnIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },

  pipeline: { flexDirection: 'row', gap: 8 },
  stage: { flex: 1, minWidth: 0, padding: 10, borderRadius: 12, backgroundColor: Colors.cardSurface, gap: 4 },
  stageAlert: { backgroundColor: Colors.statusRejected.bg },
  stageValue: { fontSize: 22, fontWeight: '900', color: Colors.text },
  stageLabel: { fontSize: 11.5, fontWeight: '600', color: Colors.textMuted, lineHeight: 15 },

  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5 },
  kpi: { width: '50%', paddingHorizontal: 5, paddingVertical: 8, gap: 4 },
  kpiLabel: { fontSize: 12.5, fontWeight: '700', color: Colors.textMuted },
  kpiValue: { fontSize: 21, fontWeight: '900', color: Colors.text },
  kpiPrev: { fontSize: 11.5, color: Colors.textSubtle },

  mix: { paddingVertical: 10 },
  mixTitle: { fontSize: 13, fontWeight: '800', color: Colors.text, marginBottom: 8 },
  stack: { flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', gap: 2, marginBottom: 8 },
  stackSeg: { height: '100%', borderRadius: 2 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 },
  legendDot: { width: 10, height: 10, borderRadius: 3 },
  legendLabel: { flex: 1, fontSize: 13, color: Colors.text },
  legendValue: { fontSize: 13, fontWeight: '700', color: Colors.text },
  legendPct: { width: 42, textAlign: 'right', fontSize: 12.5, color: Colors.textMuted },


  actions: { flexDirection: 'row', gap: 8 },
  action: { flex: 1, minWidth: 0, alignItems: 'center', gap: 6, paddingVertical: 12, borderRadius: 14, borderWidth: 1, borderColor: Colors.cardBorder, backgroundColor: Colors.background },
  actionText: { fontSize: 12, fontWeight: '700', color: Colors.text },

  footnote: { flexDirection: 'row', gap: 6, paddingHorizontal: 4 },
  footnoteText: { flex: 1, fontSize: 11.5, color: Colors.textSubtle, lineHeight: 16 },
});

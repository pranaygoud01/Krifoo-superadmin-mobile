/**
 * Platform metrics for the Super Admin dashboard.
 *
 * ONE definition per number, used everywhere on the screen:
 *  - Sales (GMV)        = total value of COMPLETED (delivered) orders, incl. fees
 *  - Krifoo earnings    = Σ food subtotal × store commission % + platform fees (completed orders)
 *  - Orders             = completed orders
 *  - Average order      = Sales ÷ orders
 *  - Cancellation rate  = cancelled ÷ all orders placed in the period
 *  - Periods are calendar days in local (UK) time; "previous period" is the same
 *    number of days immediately before.
 */
import { Order, Restaurant } from '../types';
import { getOrderFulfillmentLabel } from './printer/receipt-document';

export type PeriodPreset = 'today' | 'yesterday' | '7d' | '30d' | 'month' | 'custom';

export interface Period {
  start: Date;
  end: Date;
  prevStart: Date;
  prevEnd: Date;
  /** Number of calendar days in the period */
  days: number;
  label: string;
  compareLabel: string;
  /** Hourly buckets for single-day periods, daily otherwise */
  bucket: 'hour' | 'day';
}

const DAY = 24 * 60 * 60 * 1000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const fmtDay = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

export function getPeriod(preset: PeriodPreset, custom?: { start: Date; end: Date }, now = new Date()): Period {
  let start: Date;
  let end: Date;
  let label: string;
  switch (preset) {
    case 'yesterday':
      start = startOfDay(addDays(now, -1));
      end = endOfDay(start);
      label = 'Yesterday';
      break;
    case '7d':
      start = startOfDay(addDays(now, -6));
      end = endOfDay(now);
      label = 'Last 7 days';
      break;
    case '30d':
      start = startOfDay(addDays(now, -29));
      end = endOfDay(now);
      label = 'Last 30 days';
      break;
    case 'month':
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = endOfDay(now);
      label = now.toLocaleDateString('en-GB', { month: 'long' });
      break;
    case 'custom':
      start = startOfDay(custom?.start || now);
      end = endOfDay(custom?.end || custom?.start || now);
      label = start.getTime() === startOfDay(end).getTime() ? fmtDay(start) : `${fmtDay(start)} – ${fmtDay(end)}`;
      break;
    case 'today':
    default:
      start = startOfDay(now);
      end = endOfDay(now);
      label = 'Today';
  }
  const days = Math.max(1, Math.round((startOfDay(end).getTime() - start.getTime()) / DAY) + 1);
  const prevStart = addDays(start, -days);
  const prevEnd = endOfDay(addDays(start, -1));
  const compareLabel =
    preset === 'today'
      ? 'vs yesterday'
      : preset === 'yesterday'
      ? 'vs the day before'
      : days === 1
      ? `vs ${fmtDay(prevStart)}`
      : `vs ${fmtDay(prevStart)} – ${fmtDay(prevEnd)}`;
  return { start, end, prevStart, prevEnd, days, label, compareLabel, bucket: days === 1 ? 'hour' : 'day' };
}

/* ── Order helpers ─────────────────────────────────────────────────────── */

const num = (v: unknown) => {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
};

export const orderTotal = (o: any) =>
  num(o?.pricing?.total ?? o?.pricing?.totalAmount ?? o?.totalAmount ?? o?.totalPrice ?? 0);

export const orderSubtotal = (o: any) => {
  if (o?.pricing?.subtotal != null) return num(o.pricing.subtotal);
  const items = o?.orderedItems || o?.items || [];
  const sum = items.reduce((s: number, it: any) => s + num(it.price) * num(it.quantity || 1), 0);
  return sum > 0 ? sum : orderTotal(o);
};

export const orderTime = (o: any) => new Date(o?.createdAt).getTime();
export const restaurantIdOf = (o: any): string =>
  String(o?.restaurantId?._id || o?.restaurantId?.id || (typeof o?.restaurantId === 'string' ? o.restaurantId : '') || o?.restaurant?._id || 'unknown');
export const customerKeyOf = (o: any): string =>
  String(
    (typeof o?.customerId === 'object' ? o.customerId?._id : o?.customerId) ||
      o?.customerDetails?.phoneNumber ||
      o?.customerDetails?.email ||
      ''
  );

const isCompleted = (o: any) => o?.status === 'delivered';
const isCancelled = (o: any) => o?.status === 'cancelled';
const inRange = (o: any, start: Date, end: Date) => {
  const t = orderTime(o);
  return !isNaN(t) && t >= start.getTime() && t <= end.getTime();
};

/** Commission % for a store (stored as 0–100). Stores without a rate use the platform default. */
export const DEFAULT_COMMISSION_PERCENT = 10;
const commissionPercent = (r?: Restaurant) => (r && typeof r.commissionRate === 'number' ? r.commissionRate : DEFAULT_COMMISSION_PERCENT);

export const platformEarning = (o: any, r?: Restaurant) => orderSubtotal(o) * (commissionPercent(r) / 100) + num(o?.pricing?.platformFee);

/* ── Period summary ────────────────────────────────────────────────────── */

export interface Summary {
  sales: number;
  earnings: number;
  orders: number;
  placed: number;
  cancelled: number;
  avgOrder: number;
  cancelRate: number; // 0–1
  takeRate: number; // earnings ÷ sales, 0–1
  customers: number;
  newCustomers: number;
  activeStores: number;
}

export function summarise(orders: Order[], restaurants: Restaurant[], start: Date, end: Date, firstOrderByCustomer: Map<string, number>): Summary {
  const byId = new Map(restaurants.map((r) => [String(r._id), r]));
  const inPeriod = orders.filter((o) => inRange(o, start, end));
  const completed = inPeriod.filter(isCompleted);
  const sales = completed.reduce((s, o) => s + orderTotal(o), 0);
  const earnings = completed.reduce((s, o) => s + platformEarning(o, byId.get(restaurantIdOf(o))), 0);
  const cancelled = inPeriod.filter(isCancelled).length;
  const customers = new Set(completed.map(customerKeyOf).filter(Boolean));
  let newCustomers = 0;
  customers.forEach((c) => {
    const first = firstOrderByCustomer.get(c);
    if (first !== undefined && first >= start.getTime()) newCustomers++;
  });
  return {
    sales,
    earnings,
    orders: completed.length,
    placed: inPeriod.length,
    cancelled,
    avgOrder: completed.length ? sales / completed.length : 0,
    cancelRate: inPeriod.length ? cancelled / inPeriod.length : 0,
    takeRate: sales ? earnings / sales : 0,
    customers: customers.size,
    newCustomers,
    activeStores: new Set(completed.map(restaurantIdOf)).size,
  };
}

/** Relative change, or null when there is no baseline to compare with. */
export const change = (current: number, previous: number): number | null => (previous > 0 ? (current - previous) / previous : current > 0 ? null : 0);

/* ── Trend series ──────────────────────────────────────────────────────── */

export interface TrendPoint {
  key: string;
  label: string;
  sales: number;
  orders: number;
}

export function trend(orders: Order[], period: Period): TrendPoint[] {
  const points: TrendPoint[] = [];
  if (period.bucket === 'hour') {
    for (let h = 0; h < 24; h++) points.push({ key: String(h), label: `${String(h).padStart(2, '0')}:00`, sales: 0, orders: 0 });
    orders.forEach((o) => {
      if (!isCompleted(o) || !inRange(o, period.start, period.end)) return;
      const p = points[new Date(orderTime(o)).getHours()];
      p.sales += orderTotal(o);
      p.orders++;
    });
    return points;
  }
  const index = new Map<string, TrendPoint>();
  for (let i = 0; i < period.days; i++) {
    const d = addDays(period.start, i);
    const key = d.toDateString();
    const point = { key, label: period.days <= 7 ? d.toLocaleDateString('en-GB', { weekday: 'short' }) : fmtDay(d), sales: 0, orders: 0 };
    points.push(point);
    index.set(key, point);
  }
  orders.forEach((o) => {
    if (!isCompleted(o) || !inRange(o, period.start, period.end)) return;
    const p = index.get(new Date(orderTime(o)).toDateString());
    if (p) {
      p.sales += orderTotal(o);
      p.orders++;
    }
  });
  return points;
}

/* ── Mix (where sales come from) ───────────────────────────────────────── */

export interface MixSlice {
  key: string;
  label: string;
  sales: number;
  orders: number;
}

function mixBy(orders: Order[], period: Period, keyOf: (o: any) => string, labels: Record<string, string>): MixSlice[] {
  const slices = new Map<string, MixSlice>(Object.entries(labels).map(([key, label]) => [key, { key, label, sales: 0, orders: 0 }]));
  orders.forEach((o) => {
    if (!isCompleted(o) || !inRange(o, period.start, period.end)) return;
    const s = slices.get(keyOf(o));
    if (s) {
      s.sales += orderTotal(o);
      s.orders++;
    }
  });
  return Array.from(slices.values());
}

export const orderTypeMix = (orders: Order[], period: Period) =>
  mixBy(
    orders,
    period,
    (o) => {
      const label = getOrderFulfillmentLabel(o);
      if (label.startsWith('DINE')) return 'dine_in';
      if (label === 'TAKEAWAY') return 'takeaway';
      if (label === 'PICKUP') return 'pickup';
      return 'delivery';
    },
    { delivery: 'Delivery', pickup: 'Collection', takeaway: 'Takeaway', dine_in: 'Dine-in' }
  );

export const channelMix = (orders: Order[], period: Period) =>
  mixBy(
    orders,
    period,
    (o) => {
      const domain = String(o?.sourceDomain || '').toLowerCase();
      return o?.orderSource === 'external' || (domain && !domain.includes('krifoo')) ? 'website' : 'marketplace';
    },
    { marketplace: 'Krifoo app', website: 'Store websites' }
  );

export const paymentMix = (orders: Order[], period: Period) =>
  mixBy(orders, period, (o) => (String(o?.paymentType || '').toLowerCase().includes('cash') ? 'cash' : 'card'), { card: 'Card / online', cash: 'Cash' });

/* ── Stores ────────────────────────────────────────────────────────────── */

export type StoreFlag = 'declining' | 'high_cancel' | 'dormant' | 'growing';

export interface StoreRow {
  id: string;
  name: string;
  isLive: boolean;
  sales: number;
  prevSales: number;
  change: number | null;
  orders: number;
  placed: number;
  cancelRate: number;
  earnings: number;
  lastOrderAt: number | null;
  flags: StoreFlag[];
}

export function storeRows(orders: Order[], restaurants: Restaurant[], period: Period, now = Date.now()): StoreRow[] {
  const rows = new Map<string, StoreRow>();
  const ensure = (id: string, name: string, r?: Restaurant) => {
    if (!rows.has(id)) {
      rows.set(id, {
        id,
        name,
        isLive: r ? r.isActive && r.verificationStatus === 'approved' : true,
        sales: 0,
        prevSales: 0,
        change: 0,
        orders: 0,
        placed: 0,
        cancelRate: 0,
        earnings: 0,
        lastOrderAt: null,
        flags: [],
      });
    }
    return rows.get(id)!;
  };
  const byId = new Map(restaurants.map((r) => [String(r._id), r]));
  restaurants.forEach((r) => ensure(String(r._id), r.restaurantName || 'Unnamed store', r));

  const cancelledBy = new Map<string, number>();
  orders.forEach((o) => {
    const id = restaurantIdOf(o);
    const row = ensure(id, (o as any)?.restaurantId?.restaurantName || (o as any)?.restaurantName || 'Store', byId.get(id));
    const t = orderTime(o);
    if (!isNaN(t) && (row.lastOrderAt === null || t > row.lastOrderAt)) row.lastOrderAt = t;
    if (inRange(o, period.start, period.end)) {
      row.placed++;
      if (isCancelled(o)) cancelledBy.set(id, (cancelledBy.get(id) || 0) + 1);
      if (isCompleted(o)) {
        row.orders++;
        row.sales += orderTotal(o);
        row.earnings += platformEarning(o, byId.get(id));
      }
    } else if (isCompleted(o) && inRange(o, period.prevStart, period.prevEnd)) {
      row.prevSales += orderTotal(o);
    }
  });

  rows.forEach((row) => {
    row.cancelRate = row.placed ? (cancelledBy.get(row.id) || 0) / row.placed : 0;
    row.change = change(row.sales, row.prevSales);
    if (row.change !== null && row.prevSales > 0 && row.change <= -0.3) row.flags.push('declining');
    if (row.change !== null && row.prevSales > 0 && row.change >= 0.3) row.flags.push('growing');
    if (row.placed >= 5 && row.cancelRate > 0.08) row.flags.push('high_cancel');
    if (row.isLive && (row.lastOrderAt === null || now - row.lastOrderAt > 7 * DAY)) row.flags.push('dormant');
  });
  return Array.from(rows.values()).filter((r) => r.id !== 'unknown');
}

/* ── Live & attention ──────────────────────────────────────────────────── */

export function liveCounts(orders: Order[], now = new Date()) {
  const todayStart = startOfDay(now).getTime();
  return {
    waiting: orders.filter((o) => o.status === 'placed').length,
    waitingLate: orders.filter((o) => o.status === 'placed' && now.getTime() - orderTime(o) > 5 * 60 * 1000).length,
    preparing: orders.filter((o) => o.status === 'confirmed' || o.status === 'preparing').length,
    onTheWay: orders.filter((o) => o.status === 'ready_for_pickup' || o.status === 'out_for_delivery').length,
    completedToday: orders.filter((o) => isCompleted(o) && orderTime(o) >= todayStart).length,
  };
}

export const firstOrderIndex = (orders: Order[]) => {
  const map = new Map<string, number>();
  orders.forEach((o) => {
    const k = customerKeyOf(o);
    const t = orderTime(o);
    if (!k || isNaN(t)) return;
    if (!map.has(k) || t < map.get(k)!) map.set(k, t);
  });
  return map;
};

const PAYOUT_READY = ['active', 'enabled', 'complete', 'completed', 'verified'];
export const needsPayoutSetup = (r: Restaurant) =>
  r.verificationStatus === 'approved' && !PAYOUT_READY.includes(String(r.stripeAccountStatus || '').toLowerCase());

/* ── Formatting ────────────────────────────────────────────────────────── */

export function formatMoneyCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `£${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}m`;
  if (abs >= 10_000) return `£${(n / 1000).toFixed(0)}k`;
  if (abs >= 1000) return `£${(n / 1000).toFixed(1)}k`;
  return `£${n.toFixed(abs >= 100 ? 0 : 2)}`;
}

export const formatPercent = (ratio: number, digits = 1) => `${(ratio * 100).toFixed(digits)}%`;
export const formatCount = (n: number) => (n >= 10_000 ? `${(n / 1000).toFixed(0)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

/**
 * Rules behind the Orders tab filters (date period, payment method, payment status).
 * Pure functions, shared by the list, the chip counts and the loading.
 */
import type { Order } from '../types';

export type DatePresetKey = 'today' | 'yesterday' | '7days' | '30days' | 'all' | 'custom';
export type PeriodRange = { from: Date; to: Date } | null;

/** "YYYY-MM-DD" → local midnight of that day (null if not a real date). */
function parseYMD(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '').trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getMonth() === Number(m[2]) - 1 ? d : null;
}

/** The chosen period on this device's clock; null = all time (or an unfinished custom range). */
export function getPeriodRange(preset: DatePresetKey, customFrom: string, customTo: string, now = new Date()): PeriodRange {
  const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const endOfDay = (d: Date) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
  const daysAgo = (n: number) => { const d = new Date(now); d.setDate(d.getDate() - n); return d; };
  switch (preset) {
    case 'today':
      return { from: startOfDay(now), to: endOfDay(now) };
    case 'yesterday':
      return { from: startOfDay(daysAgo(1)), to: endOfDay(daysAgo(1)) };
    case '7days': // today plus the 6 days before it
      return { from: startOfDay(daysAgo(6)), to: endOfDay(now) };
    case '30days':
      return { from: startOfDay(daysAgo(29)), to: endOfDay(now) };
    case 'custom': {
      const from = parseYMD(customFrom);
      const to = parseYMD(customTo);
      return from && to ? { from: startOfDay(from), to: endOfDay(to) } : null;
    }
    default:
      return null;
  }
}

/**
 * In the chosen period? Orders still in progress always are, so nothing placed before midnight
 * (or scheduled for later) drops off the board; finished orders count by when they were placed.
 */
export function isInPeriod(order: Order, range: PeriodRange, isStillInProgress: (o: Order) => boolean): boolean {
  if (!range || isStillInProgress(order)) return true;
  const created = order.createdAt ? new Date(order.createdAt).getTime() : NaN;
  return Number.isFinite(created) && created >= range.from.getTime() && created <= range.to.getTime();
}

/** 'cash' | 'card' (card, Stripe, online) | 'other' — the payment filter's groups. */
export function paymentKindOf(order: Order): 'cash' | 'card' | 'other' {
  const p = String(order.paymentType || (order as any).paymentMethod || '').toLowerCase();
  if (p.includes('cash') || p === 'cod') return 'cash';
  if (p.includes('card') || p.includes('stripe') || p.includes('online')) return 'card';
  return 'other';
}

export function isOrderPaid(order: Order): boolean {
  const s = String(order.paymentStatus || '').toLowerCase();
  return s === 'paid' || s === 'completed';
}

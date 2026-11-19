import { useSyncExternalStore } from 'react';
import type { Order } from '../types';
import { getOrderScheduleInfo } from '../services/printer/receipt-document';

/**
 * Order timing rules (owner app):
 *  - ASAP orders: once accepted, count down from `acceptedAt + expectedDeliveryTime` minutes.
 *    Orders without `acceptedAt` (accepted before the backend recorded it) get no countdown.
 *  - Scheduled orders: no countdown; they only become "action needed" once the scheduled time passes.
 *  - An order needs action when it is still active and its countdown / scheduled time has run out.
 */

const FINAL_STATUSES = ['delivered', 'cancelled'];
const MINUTE = 60_000;
const WARNING_MS = 5 * MINUTE;

export type OrderTiming =
  | { kind: 'none' }
  | { kind: 'countdown'; deadline: number; remainingMs: number; tone: 'normal' | 'warning' | 'overdue' }
  | { kind: 'scheduled'; deadline: number; overdue: boolean };

const isActive = (order: Order) => !!order && !FINAL_STATUSES.includes(order.status);

const toMs = (value: unknown): number | null => {
  if (!value) return null;
  const ms = new Date(value as any).getTime();
  return Number.isFinite(ms) ? ms : null;
};

/* ── Scheduled time parsing ─────────────────────────────────────────────── */

const TIME_RANGE = /(\d{1,2}):(\d{2})\s*(am|pm)?\s*(?:-|–|to)\s*(\d{1,2}):(\d{2})\s*(am|pm)?/i;
const SINGLE_TIME = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?$/i;

const to24h = (h: number, ampm?: string) => {
  if (!ampm) return h;
  const pm = ampm.toLowerCase() === 'pm';
  if (h === 12) return pm ? 12 : 0;
  return pm ? h + 12 : h;
};

/** Sets a clock time on `baseMs`'s day; rolls to the next day if that lands before `notBeforeMs`. */
const atTimeOfDay = (baseMs: number, h: number, m: number, notBeforeMs?: number) => {
  const d = new Date(baseMs);
  d.setHours(h, m, 0, 0);
  let ms = d.getTime();
  if (notBeforeMs !== undefined && ms < notBeforeMs) ms += 24 * 60 * MINUTE;
  return ms;
};

/**
 * Parses the raw schedule values the backend sends (ISO dates, "18:30", "Slot: 18:00 - 18:30",
 * "2026-11-12 18:00 - 18:30") into a timestamp. For a slot range the END of the slot is used.
 */
function parseScheduleRaw(raw: string, createdMs: number, slotDate?: string): number | null {
  let text = String(raw).trim().replace(/^(pickup|slot|delivery|target|scheduled)\s*:\s*/i, '');
  if (!text || text.toLowerCase() === 'asap') return null;

  const range = text.match(TIME_RANGE);
  if (range) {
    const h = to24h(parseInt(range[4], 10), range[6] || range[3]);
    const m = parseInt(range[5], 10);
    const datePart = (slotDate || text.slice(0, range.index)).trim();
    const dateMs = datePart ? toMs(datePart) : null;
    return dateMs !== null ? atTimeOfDay(dateMs, h, m) : atTimeOfDay(createdMs, h, m, createdMs);
  }

  const single = text.match(SINGLE_TIME);
  if (single) {
    const h = to24h(parseInt(single[1], 10), single[3]);
    const m = parseInt(single[2], 10);
    const dateMs = slotDate ? toMs(slotDate) : null;
    return dateMs !== null ? atTimeOfDay(dateMs, h, m) : atTimeOfDay(createdMs, h, m, createdMs);
  }

  if (/[-/T]/.test(text)) return toMs(text);
  return null;
}

/** Target timestamp of a scheduled order, or null if it can't be determined. */
export function getScheduledDeadline(order: any): number | null {
  const createdMs = toMs(order?.createdAt) ?? Date.now();
  const slotObj =
    (order?.deliverySlot && typeof order.deliverySlot === 'object' && order.deliverySlot) ||
    (order?.selectedDeliverySlotId && typeof order.selectedDeliverySlotId === 'object' && order.selectedDeliverySlotId) ||
    null;

  const candidates: (string | undefined)[] = [
    order?.deliverySlotTime,
    typeof order?.deliverySlot === 'string' ? order.deliverySlot : undefined,
    slotObj?.slotTime || slotObj?.time ||
      (slotObj?.startTime ? `${slotObj.startTime}${slotObj.endTime ? ` - ${slotObj.endTime}` : ''}` : undefined),
    order?.slotTime,
    order?.collectionTime,
    order?.scheduledDate && order?.scheduledTime ? `${order.scheduledDate} ${order.scheduledTime}` : undefined,
    order?.scheduleTimeDate,
    order?.scheduledFor,
    order?.scheduledTime,
    order?.targetDeliveryTime,
  ];

  for (const raw of candidates) {
    if (typeof raw !== 'string' || !raw.trim()) continue;
    const ms = parseScheduleRaw(raw, createdMs, slotObj?.date);
    if (ms !== null) return ms;
  }
  return null;
}

/* ── Public helpers ─────────────────────────────────────────────────────── */

export function getOrderTiming(order: Order, now: number): OrderTiming {
  if (!isActive(order)) return { kind: 'none' };

  if (getOrderScheduleInfo(order).isScheduled) {
    const deadline = getScheduledDeadline(order);
    return deadline === null ? { kind: 'none' } : { kind: 'scheduled', deadline, overdue: now >= deadline };
  }

  const acceptedMs = toMs(order.acceptedAt);
  if (order.status === 'placed' || acceptedMs === null) return { kind: 'none' };

  const minutes = Number(order.expectedDeliveryTime || order.deliveryTime || 30);
  const deadline = acceptedMs + minutes * MINUTE;
  const remainingMs = deadline - now;
  const tone = remainingMs <= 0 ? 'overdue' : remainingMs <= WARNING_MS ? 'warning' : 'normal';
  return { kind: 'countdown', deadline, remainingMs, tone };
}

export function isOrderActionNeeded(order: Order, now: number): boolean {
  const t = getOrderTiming(order, now);
  return (t.kind === 'countdown' && t.tone === 'overdue') || (t.kind === 'scheduled' && t.overdue);
}

/** 754_000 → "12:34", 4_000_000 → "1:06:40". */
export function formatDuration(ms: number): string {
  const total = Math.floor(Math.abs(ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** "Overdue by 12 min" style text for list rows. */
export function formatOverdue(ms: number): string {
  const mins = Math.floor(Math.abs(ms) / MINUTE);
  if (mins < 1) return '<1 min';
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  return `${h}h ${mins % 60}m`;
}

/* ── Shared 1-second clock ──────────────────────────────────────────────── */

let nowValue = Date.now();
let ticker: ReturnType<typeof setInterval> | null = null;
const subscribers = new Set<() => void>();

function subscribe(cb: () => void) {
  subscribers.add(cb);
  if (!ticker) {
    nowValue = Date.now();
    ticker = setInterval(() => {
      nowValue = Date.now();
      subscribers.forEach((s) => s());
    }, 1000);
  }
  return () => {
    subscribers.delete(cb);
    if (subscribers.size === 0 && ticker) {
      clearInterval(ticker);
      ticker = null;
    }
  };
}

/** Current time, re-rendering the caller once per second. One interval is shared app-wide. */
export function useNow(): number {
  return useSyncExternalStore(subscribe, () => nowValue, () => nowValue);
}

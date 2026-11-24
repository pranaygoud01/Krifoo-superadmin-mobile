/**
 * Pure helpers for the reservations day view and booking form.
 * Slot hours ("19:00") are the restaurant's UK clock times.
 */
import type { BookingDayEntry, BookingDayTable } from '../../services/restaurant-owner.service';

const TZ = 'Europe/London';

export const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;
export const hourOf = (slot: string) => parseInt(slot, 10);

/** Today in the UK as YYYY-MM-DD (device clocks may be in another zone). */
export function ukToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** The current hour on the UK clock (0–23). */
export function ukHour(now = new Date()): number {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }).format(now)) % 24;
}

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function dayLabel(iso: string, today: string): string {
  if (iso === today) return 'Today';
  if (iso === addDays(today, 1)) return 'Tomorrow';
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export const slotsFrom = (start: number, hours: number) => Array.from({ length: hours }, (_, i) => hh(start + i));

/** Bookings that hold their slots (cancelled ones aren't in the day payload; no-shows free them). */
export const blocksTable = (b: BookingDayEntry) => b.status === 'confirmed' || b.status === 'pending';

/** Slots of `table` already taken, ignoring `excludeId` (the booking being moved). */
export function takenSlots(tableId: string, bookings: BookingDayEntry[], excludeId?: string): Set<string> {
  const out = new Set<string>();
  for (const b of bookings) if (String(b.tableId) === String(tableId) && b._id !== excludeId && blocksTable(b)) b.slots.forEach((s) => out.add(s));
  return out;
}

/**
 * Start hours where a booking of `hours` fits on `table`: every slot within the table's hours,
 * none taken, and (today) not already over.
 */
export function freeStarts(
  table: BookingDayTable,
  bookings: BookingDayEntry[],
  { hours, excludeId, isToday, nowHour = ukHour() }: { hours: number; excludeId?: string; isToday: boolean; nowHour?: number }
): number[] {
  const open = new Set(table.availableHours);
  const taken = takenSlots(table._id, bookings, excludeId);
  const starts = [...open].map(hourOf).sort((a, b) => a - b);
  return starts.filter((start) => {
    if (isToday && start < nowHour) return false; // the current hour still works for a walk-in
    return slotsFrom(start, hours).every((s) => open.has(s) && !taken.has(s));
  });
}

/** First and last hour shown on the timeline (covers every table's hours). */
export function hourSpan(tables: BookingDayTable[]): [number, number] {
  const hrs = tables.flatMap((t) => t.availableHours.map(hourOf));
  if (!hrs.length) return [12, 23];
  return [Math.min(...hrs), Math.max(...hrs) + 1];
}

/** Guests expected in each hour (confirmed + paying), for the summary row. */
export function coversByHour(bookings: BookingDayEntry[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const b of bookings) if (blocksTable(b) || b.status === 'completed') b.slots.forEach((s) => (out[s] = (out[s] || 0) + b.guests));
  return out;
}

/** Tables sorted for a party: smallest that fits first, too-small last. */
export function bestFit(tables: BookingDayTable[], guests: number): BookingDayTable[] {
  const score = (t: BookingDayTable) => (t.capacity >= guests ? t.capacity - guests : 100 + guests - t.capacity);
  return [...tables].sort((a, b) => score(a) - score(b) || String(a.tableNumber).localeCompare(String(b.tableNumber), undefined, { numeric: true }));
}

export const timeRange = (slots: string[]) => {
  if (!slots.length) return '';
  const s = [...slots].sort();
  return `${s[0]}–${hh(hourOf(s[s.length - 1]) + 1)}`;
};

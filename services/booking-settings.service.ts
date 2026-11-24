import { apiRequest } from './api';

/**
 * Online table booking setup: weekly booking hours, rules, price, date exceptions, and the
 * one-tap import of old daily table posts. Backend: /api/bookings/restaurant/settings.
 */
export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type Weekday = (typeof WEEKDAYS)[number];
export type PriceModel = 'free' | 'per_booking' | 'per_hour';
export interface HourRange {
  start: string; // "12:00"
  end: string; // "15:00" (may be "24:00")
}
export interface BookingException {
  _id?: string;
  date: string; // YYYY-MM-DD
  closed: boolean;
  hours: HourRange[];
  blockedTableIds: string[];
  note?: string;
}
export interface BookingSettings {
  enabled: boolean;
  weekly: Record<Weekday, HourRange[]>;
  maxBookingHours: number;
  maxDaysAhead: number;
  minNoticeMinutes: number;
  /** Guests get a full refund if they cancel at least this many hours before */
  freeCancelHours: number;
  priceModel: PriceModel;
  price: number;
  exceptions: BookingException[];
  importedLegacyAt?: string | null;
}
export interface LegacySuggestion {
  tables: { label: string; seats: number; area: string }[];
  weekly: Record<Weekday, HourRange[]>;
  priceModel: PriceModel;
  price: number;
  maxBookingHours: number;
}
export interface BookingSetup {
  exists: boolean;
  settings: BookingSettings;
  legacy: { posts: number; upcoming: number; suggestion: LegacySuggestion } | null;
  floorTables: number;
}
export interface ImportSummary {
  floorsCreated: number;
  tablesCreated: number;
  tablesUpdated: number;
  bookingsMoved: number;
  postsRetired: number;
  settingsCreated: boolean;
}

type Res<T> = Promise<{ success: boolean; data?: T; message?: string; statusCode?: number }>;

export const bookingSettingsService = {
  getSetup(): Res<BookingSetup> {
    return apiRequest('/api/bookings/restaurant/settings');
  },
  save(body: Partial<BookingSettings>): Res<BookingSettings> {
    return apiRequest('/api/bookings/restaurant/settings', { method: 'PUT', body });
  },
  importLegacy(): Res<ImportSummary> {
    return apiRequest('/api/bookings/restaurant/settings/import-legacy', { method: 'POST' });
  },
};

/* ── Plain-English summaries ─────────────────────────────────────────── */

export const DAY_SHORT: Record<Weekday, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
export const DAY_LONG: Record<Weekday, string> = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };

const rangeText = (ranges: HourRange[]) => (ranges.length ? ranges.map((r) => `${r.start}–${r.end === '24:00' ? 'midnight' : r.end}`).join(', ') : 'closed');

/** "Mon–Fri 12:00–15:00, 18:00–22:00 · Sat–Sun 12:00–22:00" (runs of days with the same hours). */
export function hoursSummary(weekly: Record<Weekday, HourRange[]>): string {
  const groups: { from: Weekday; to: Weekday; text: string }[] = [];
  for (const d of WEEKDAYS) {
    const text = rangeText(weekly[d] || []);
    const last = groups[groups.length - 1];
    if (last && last.text === text) last.to = d;
    else groups.push({ from: d, to: d, text });
  }
  if (groups.length === 1) return groups[0].text === 'closed' ? 'No booking hours yet' : `Every day ${groups[0].text}`;
  return groups
    .filter((g) => g.text !== 'closed')
    .map((g) => `${g.from === g.to ? DAY_SHORT[g.from] : `${DAY_SHORT[g.from]}–${DAY_SHORT[g.to]}`} ${g.text}`)
    .join(' · ') || 'No booking hours yet';
}

const gbp = (n: number) => `£${(Number(n) || 0).toFixed(2).replace(/\.00$/, '')}`;

export function priceSummary(model: PriceModel, price: number): string {
  if (model === 'free' || !(price > 0)) return 'Free to book';
  return model === 'per_booking' ? `${gbp(price)} deposit per booking` : `${gbp(price)} per hour`;
}

/** The price a table charges, given the restaurant's rule and the table's own amount (if any). */
export function tablePriceSummary(settings: Pick<BookingSettings, 'priceModel' | 'price'>, own: number | null | undefined): string {
  if (own === null || own === undefined) return priceSummary(settings.priceModel, settings.price);
  const model: PriceModel = settings.priceModel === 'free' ? (own > 0 ? 'per_booking' : 'free') : settings.priceModel;
  return priceSummary(model, own);
}

export function cancelLabel(hours: number): string {
  if (!hours) return 'free cancellation until it starts';
  if (hours % 24 === 0) return `free cancellation up to ${hours / 24} day${hours === 24 ? '' : 's'} before`;
  return `free cancellation up to ${hours} h before`;
}

export function noticeLabel(min: number): string {
  if (!min) return 'no notice needed';
  if (min < 60) return `${min} min notice`;
  if (min % 1440 === 0) return `${min / 1440} day${min === 1440 ? '' : 's'} notice`;
  return `${Math.round(min / 60)} h notice`;
}

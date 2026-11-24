import { apiRequest } from './api';

/**
 * Table management (phase 1): floors, physical tables, live floor and table visits.
 * Backend: /api/floor/* (restaurant owner).
 */

export type TableShape = 'round' | 'square' | 'rectangle' | 'booth';
/** Display status — "ordered"/"served" are worked out by the server from the visit's orders. */
export type TableStatus = 'free' | 'seated' | 'ordered' | 'served' | 'bill_requested' | 'cleaning' | 'blocked';
export type PaymentMethod = 'cash' | 'card' | 'other';

export interface TableLayout {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LiveSession {
  _id: string;
  partySize: number;
  seatedAt: string;
  billRequestedAt?: string | null;
  notes?: string;
  orderCount: number;
  pendingCount: number;
  servedCount: number;
  total: number;
  /** Already paid in the app (QR card orders) / still to pay at the table */
  paidOnline?: number;
  due?: number;
  /** Reservation deposit counted toward the bill */
  depositCredit?: number;
  lastOrderAt?: string | null;
  /** When the longest-waiting unserved order was placed (wait alerts) */
  oldestPendingAt?: string | null;
  source?: 'staff' | 'qr';
  tableLabel?: string;
  extraTables?: { tableId: string; label: string }[];
  /** Seats of the main table plus joined tables */
  groupSeats?: number;
}

export interface LiveTable {
  _id: string;
  label: string;
  seats: number;
  shape: TableShape;
  layout: TableLayout;
  status: TableStatus;
  statusChangedAt?: string;
  /** Secret in the table's QR code */
  qrToken?: string;
  /** Online booking: guests can book it in the app (hours from booking settings) */
  bookable?: boolean;
  /** Own longest booking / price (null = the restaurant's) */
  maxBookingHours?: number | null;
  bookingPrice?: number | null;
  /** On a table pushed together with another: the main table's label */
  joinedTo?: string | null;
  /** Today's next un-seated reservation for this table */
  nextReservation?: { bookingId: string; time: string; name: string; guests: number; startsAt: string; late: boolean } | null;
  session: LiveSession | null;
}

export interface FloorSummary {
  tables: number;
  tablesFree: number;
  tablesOccupied: number;
  tablesBlocked: number;
  seats: number;
  seatsOccupied: number;
  seatsEmpty: number;
  guests: number;
}

export interface LiveFloor {
  _id: string;
  name: string;
  sortOrder: number;
  summary: FloorSummary;
  tables: LiveTable[];
}

export interface FloorStatus {
  floors: LiveFloor[];
  summary: FloorSummary;
  generatedAt: string;
}

export interface VisitOrder {
  _id: string;
  orderNumber: string;
  status: string;
  acceptanceStatus?: 'pending' | 'accepted' | 'rejected';
  paymentType?: string;
  createdAt: string;
  acceptedAt?: string | null;
  readyAt?: string | null;
  servedAt?: string | null;
  paymentStatus?: string;
  pricing?: { totalAmount?: number };
  orderedItems?: { itemName?: string; quantity?: number; itemTotal?: number }[];
}

export interface Visit {
  _id: string;
  tableId: string;
  tableLabel: string;
  floorName: string;
  partySize: number;
  status: 'open' | 'closed';
  seatedAt: string;
  billRequestedAt?: string | null;
  closedAt?: string | null;
  notes?: string;
  orders: VisitOrder[];
  total: number;
  paidOnline?: number;
  due?: number;
  depositCredit?: number;
  source?: 'staff' | 'qr';
  bookingId?: string | null;
  extraTables?: { tableId: string; label: string; seats?: number }[];
  moves?: { fromLabel: string; toLabel: string; at: string }[];
  payments?: PaymentPart[];
  payment?: { method?: PaymentMethod | 'split' | null; amount?: number | null };
}

export interface PaymentPart {
  method: PaymentMethod;
  amount: number;
}

export interface Reservation {
  _id: string;
  bookingNumber: string;
  guests: number;
  slots: string[];
  status: string;
  customerName: string;
  customerPhone: string;
  area: string;
  bookedTable: string;
  specialRequests: string;
  seating: { sessionId: string; diningTableId: string; tableLabel: string; seatedAt: string } | null;
  /** The Floor table it was booked on (online bookings) */
  bookedTableId?: string | null;
}

export interface ReportRow {
  visits: number;
  guests: number;
  revenue: number;
  avgTurnMins: number;
  spendPerGuest: number;
}

export interface FloorReport {
  range: { from: string; to: string };
  totals: {
    visits: number;
    guests: number;
    revenue: number;
    avgPartySize: number;
    spendPerGuest: number;
    spendPerVisit: number;
    avgTurnMins: number;
    medianTurnMins: number;
    avgServeMins: number;
    qrVisits: number;
    reservationVisits: number;
    peakHour: number | null;
  };
  paymentMix: Record<PaymentMethod | 'online', number>;
  byFloor: (ReportRow & { floorId: string; name: string })[];
  byTable: (ReportRow & { tableId: string; label: string; floorName: string })[];
  byHour: { hour: number; visits: number; guests: number }[];
  byWeekday: { day: string; visits: number; guests: number; revenue: number }[];
  truncated?: boolean;
}

type Res<T> = Promise<{ success: boolean; data?: T; message?: string; statusCode?: number }>;

export const floorService = {
  getStatus(): Res<FloorStatus> {
    return apiRequest('/api/floor/status');
  },

  // ── Setup ──
  createFloor(name: string): Res<{ _id: string; name: string }> {
    return apiRequest('/api/floor/floors', { method: 'POST', body: { name } });
  },
  updateFloor(floorId: string, body: { name?: string; sortOrder?: number }): Res<any> {
    return apiRequest(`/api/floor/floors/${floorId}`, { method: 'PUT', body });
  },
  deleteFloor(floorId: string): Res<any> {
    return apiRequest(`/api/floor/floors/${floorId}`, { method: 'DELETE' });
  },
  createTable(
    floorId: string,
    body: { label: string; seats: number; shape: TableShape; layout?: TableLayout; bookable?: boolean; maxBookingHours?: number | null; bookingPrice?: number | null }
  ): Res<any> {
    return apiRequest(`/api/floor/floors/${floorId}/tables`, { method: 'POST', body });
  },
  updateTable(
    tableId: string,
    body: Partial<{ label: string; seats: number; shape: TableShape; layout: TableLayout; floorId: string; bookable: boolean; maxBookingHours: number | null; bookingPrice: number | null }>
  ): Res<any> {
    return apiRequest(`/api/floor/tables/${tableId}`, { method: 'PUT', body });
  },
  deleteTable(tableId: string): Res<any> {
    return apiRequest(`/api/floor/tables/${tableId}`, { method: 'DELETE' });
  },
  saveLayout(floorId: string, tables: { _id: string; layout: TableLayout }[]): Res<any> {
    return apiRequest(`/api/floor/floors/${floorId}/layout`, { method: 'PUT', body: { tables } });
  },

  // ── Service ──
  /** Seat a walk-in party, or a reservation (`bookingId`; party size defaults to the booking's). */
  seat(tableId: string, partySize?: number, opts: { notes?: string; bookingId?: string } = {}): Res<{ _id: string }> {
    return apiRequest(`/api/floor/tables/${tableId}/seat`, { method: 'POST', body: { partySize, ...opts } });
  },
  rotateQr(tableId: string): Res<{ _id: string; qrToken: string }> {
    return apiRequest(`/api/floor/tables/${tableId}/qr`, { method: 'POST' });
  },
  listReservations(date?: string): Res<Reservation[]> {
    return apiRequest(`/api/floor/reservations${date ? `?date=${date}` : ''}`);
  },
  getReport(days: number): Res<FloorReport> {
    return apiRequest(`/api/floor/reports?days=${days}`);
  },
  moveVisit(sessionId: string, toTableId: string): Res<Visit> {
    return apiRequest(`/api/floor/sessions/${sessionId}/move`, { method: 'POST', body: { toTableId } });
  },
  joinTable(sessionId: string, tableId: string): Res<Visit> {
    return apiRequest(`/api/floor/sessions/${sessionId}/join`, { method: 'POST', body: { tableId } });
  },
  releaseTable(sessionId: string, tableId: string): Res<Visit> {
    return apiRequest(`/api/floor/sessions/${sessionId}/release`, { method: 'POST', body: { tableId } });
  },
  serveOrder(sessionId: string, orderId: string): Res<any> {
    return apiRequest(`/api/floor/sessions/${sessionId}/orders/${orderId}/serve`, { method: 'POST' });
  },
  setTableStatus(tableId: string, status: 'free' | 'blocked'): Res<any> {
    return apiRequest(`/api/floor/tables/${tableId}/status`, { method: 'PATCH', body: { status } });
  },
  getVisit(sessionId: string): Res<Visit> {
    return apiRequest(`/api/floor/sessions/${sessionId}`);
  },
  updateVisit(sessionId: string, body: { partySize?: number; notes?: string }): Res<any> {
    return apiRequest(`/api/floor/sessions/${sessionId}`, { method: 'PATCH', body });
  },
  requestBill(sessionId: string): Res<any> {
    return apiRequest(`/api/floor/sessions/${sessionId}/request-bill`, { method: 'POST' });
  },
  /**
   * Close with one or more payments (several = split bill). `force` closes even with unserved
   * orders (the server refuses with 409 otherwise).
   */
  closeVisit(sessionId: string, payments: PaymentPart[], force = false): Res<Visit & { total: number }> {
    return apiRequest(`/api/floor/sessions/${sessionId}/close`, { method: 'POST', body: { payments, ...(force ? { force: true } : {}) } });
  },
};

/** Visual meaning of each table status (shared by floor screens). */
export const TABLE_STATUS_META: Record<TableStatus, { label: string; color: string; bg: string; border: string }> = {
  free: { label: 'Free', color: '#047857', bg: '#ECFDF5', border: '#A7F3D0' },
  seated: { label: 'Seated', color: '#1D4ED8', bg: '#EFF6FF', border: '#BFDBFE' },
  ordered: { label: 'Ordered', color: '#B45309', bg: '#FFFBEB', border: '#FDE68A' },
  served: { label: 'Served', color: '#6D28D9', bg: '#F5F3FF', border: '#DDD6FE' },
  bill_requested: { label: 'Bill asked', color: '#BE123C', bg: '#FFF1F2', border: '#FECDD3' },
  cleaning: { label: 'Cleaning', color: '#475569', bg: '#F1F5F9', border: '#CBD5E1' },
  blocked: { label: 'Blocked', color: '#64748B', bg: '#F8FAFC', border: '#E2E8F0' },
};

/** "42m" / "1h 05m" since an ISO time. */
export function sinceLabel(iso?: string | null, now = Date.now()): string {
  if (!iso) return '';
  const mins = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;
}

/** First free spot for a w×h table on a grid `cols` wide (row by row), avoiding `taken` tables. */
export function findFreeSpot(taken: TableLayout[], w: number, h: number, cols = 8): { x: number; y: number } {
  const hit = (x: number, y: number) =>
    taken.some((l) => x < l.x + (l.w || 1) && x + w > l.x && y < l.y + (l.h || 1) && y + h > l.y);
  for (let y = 0; y < 50 - h; y++) for (let x = 0; x + w <= cols; x++) if (!hit(x, y)) return { x, y };
  return { x: 0, y: 0 };
}

/** Default footprint per shape (grid cells). */
export const SHAPE_SIZE: Record<TableShape, { w: number; h: number }> = {
  round: { w: 1, h: 1 },
  square: { w: 1, h: 1 },
  rectangle: { w: 2, h: 1 },
  booth: { w: 2, h: 1 },
};

/** What the customer app's camera opens for a table (its URL scheme + the table's secret). */
export const tableQrLink = (qrToken: string) => `krifoomobile://table/${qrToken}`;

/** Minutes after which a table gets an alert on the floor. */
export const ALERT_MINUTES = { noOrder: 10, waiting: 20, bill: 8 };

/** The most urgent thing about a table right now, if anything ("Waiting 24m"). */
export function tableAlert(t: LiveTable, now = Date.now()): string | null {
  const s = t.session;
  if (!s || t.joinedTo) return null;
  const mins = (iso?: string | null) => (iso ? (now - new Date(iso).getTime()) / 60000 : 0);
  if (t.status === 'bill_requested' && mins(s.billRequestedAt) >= ALERT_MINUTES.bill) return `Bill ${sinceLabel(s.billRequestedAt, now)}`;
  if (s.pendingCount > 0 && mins(s.oldestPendingAt) >= ALERT_MINUTES.waiting) return `Waiting ${sinceLabel(s.oldestPendingAt, now)}`;
  if (s.orderCount === 0 && mins(s.seatedAt) >= ALERT_MINUTES.noOrder) return `No order ${sinceLabel(s.seatedAt, now)}`;
  return null;
}

/** Split `total` into `n` parts that add up exactly (pennies go to the first parts). */
export function splitEvenly(total: number, n: number): number[] {
  const pence = Math.round(total * 100);
  const parts = Math.max(1, Math.floor(n));
  const base = Math.floor(pence / parts);
  return Array.from({ length: parts }, (_, i) => (base + (i < pence - base * parts ? 1 : 0)) / 100);
}

export function clockLabel(iso?: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

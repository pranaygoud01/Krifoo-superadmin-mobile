/**
 * Choosing a real table for a POS dine-in order (from the live floor).
 *  - A free table: the order seats it (starts a visit) and goes onto that visit
 *  - A table with guests: the order is added to their visit (timeline and bill)
 *  - Cleaning / blocked / joined-to-another tables can't be picked
 */
import type { LiveFloor, LiveTable } from '../services/floor.service';

export type PosTableKind = 'free' | 'occupied' | 'unavailable';

export interface PosTableOption {
  kind: PosTableKind;
  selectable: boolean;
  /** One short line under the label: "4 seats", "3 guests · £24.50", "Joined to T3" */
  hint: string;
}

const money = (n: number) => `£${(Number(n) || 0).toFixed(2)}`;

export function posTableOption(t: LiveTable): PosTableOption {
  if (t.joinedTo) return { kind: 'unavailable', selectable: false, hint: `Joined to ${t.joinedTo}` };
  if (t.status === 'blocked') return { kind: 'unavailable', selectable: false, hint: 'Blocked' };
  if (t.status === 'cleaning') return { kind: 'unavailable', selectable: false, hint: 'Being cleaned' };
  if (t.session) {
    const s = t.session;
    const guests = `${s.partySize} guest${s.partySize === 1 ? '' : 's'}`;
    return { kind: 'occupied', selectable: true, hint: s.total > 0 ? `${guests} · ${money(s.total)}` : guests };
  }
  const booked = t.nextReservation ? ` · booked ${t.nextReservation.time}` : '';
  return { kind: 'free', selectable: true, hint: `${t.seats} seat${t.seats === 1 ? '' : 's'}${booked}` };
}

/** The table chosen for the order. `sessionId` is null for a free table until the order seats it. */
export interface PosTablePick {
  tableId: string;
  label: string;
  floorName: string;
  seats: number;
  sessionId: string | null;
  partySize: number | null;
}

export function toPick(t: LiveTable, floor: Pick<LiveFloor, 'name'>): PosTablePick {
  return {
    tableId: t._id,
    label: t.label,
    floorName: floor.name,
    seats: t.seats,
    sessionId: t.session?._id ?? null,
    partySize: t.session?.partySize ?? null,
  };
}

/** Counts for the picker header: "6 free · 4 with guests". */
export function floorCounts(floors: LiveFloor[]): { free: number; occupied: number; total: number } {
  let free = 0;
  let occupied = 0;
  let total = 0;
  for (const f of floors) {
    for (const t of f.tables) {
      total++;
      const k = posTableOption(t).kind;
      if (k === 'free') free++;
      else if (k === 'occupied') occupied++;
    }
  }
  return { free, occupied, total };
}

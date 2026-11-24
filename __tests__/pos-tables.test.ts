import { floorCounts, posTableOption, toPick } from '../utils/pos-tables';
import type { LiveFloor, LiveTable } from '../services/floor.service';

const table = (over: Partial<LiveTable> = {}): LiveTable => ({
  _id: 't1',
  label: 'T1',
  seats: 4,
  shape: 'square',
  layout: { x: 0, y: 0, w: 1, h: 1 },
  status: 'free',
  session: null,
  ...over,
});

const session = (over: any = {}) => ({ _id: 's1', partySize: 3, seatedAt: '', orderCount: 1, pendingCount: 0, servedCount: 1, total: 24.5, ...over });

describe('posTableOption', () => {
  it('free table can be picked and shows seats', () => {
    expect(posTableOption(table())).toEqual({ kind: 'free', selectable: true, hint: '4 seats' });
  });
  it('free table mentions the next booking', () => {
    const t = table({ nextReservation: { bookingId: 'b', time: '19:00', name: 'A', guests: 2, startsAt: '', late: false } });
    expect(posTableOption(t).hint).toBe('4 seats · booked 19:00');
  });
  it('table with guests can be picked and shows party and bill', () => {
    expect(posTableOption(table({ status: 'ordered', session: session() }))).toEqual({ kind: 'occupied', selectable: true, hint: '3 guests · £24.50' });
  });
  it('just-seated table without orders shows guests only', () => {
    expect(posTableOption(table({ status: 'seated', session: session({ partySize: 1, total: 0 }) })).hint).toBe('1 guest');
  });
  it('blocked, cleaning and joined tables cannot be picked', () => {
    expect(posTableOption(table({ status: 'blocked' })).selectable).toBe(false);
    expect(posTableOption(table({ status: 'cleaning' })).selectable).toBe(false);
    expect(posTableOption(table({ joinedTo: 'T3' }))).toEqual({ kind: 'unavailable', selectable: false, hint: 'Joined to T3' });
  });
});

describe('toPick', () => {
  it('free table has no visit yet', () => {
    expect(toPick(table(), { name: 'Ground' })).toEqual({ tableId: 't1', label: 'T1', floorName: 'Ground', seats: 4, sessionId: null, partySize: null });
  });
  it('occupied table carries its visit', () => {
    const p = toPick(table({ status: 'seated', session: session() }), { name: 'Patio' });
    expect(p.sessionId).toBe('s1');
    expect(p.partySize).toBe(3);
  });
});

describe('floorCounts', () => {
  it('counts free and occupied tables across floors', () => {
    const floors = [
      { _id: 'f1', name: 'A', sortOrder: 0, summary: {} as any, tables: [table(), table({ _id: 't2', status: 'seated', session: session() })] },
      { _id: 'f2', name: 'B', sortOrder: 1, summary: {} as any, tables: [table({ _id: 't3', status: 'blocked' })] },
    ] as LiveFloor[];
    expect(floorCounts(floors)).toEqual({ free: 1, occupied: 1, total: 3 });
  });
});

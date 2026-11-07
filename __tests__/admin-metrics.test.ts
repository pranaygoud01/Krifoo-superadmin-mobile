import {
  getPeriod,
  summarise,
  change,
  trend,
  storeRows,
  liveCounts,
  firstOrderIndex,
  orderTypeMix,
  formatMoneyCompact,
} from '../services/admin-metrics';

const NOW = new Date(2026, 10, 7, 14, 0, 0); // 7 Nov 2026, 14:00 local
const at = (dayOffset: number, hour = 12) => new Date(2026, 10, 7 + dayOffset, hour, 0, 0).toISOString();

const restaurants: any[] = [
  { _id: 'r1', restaurantName: 'Curry House', commissionRate: 15, isActive: true, verificationStatus: 'approved' },
  { _id: 'r2', restaurantName: 'Pizza Place', isActive: true, verificationStatus: 'approved' }, // no rate → default 10%
];

const order = (id: string, r: string, status: string, createdAt: string, subtotal: number, total: number, extra: any = {}) => ({
  _id: id,
  restaurantId: r,
  status,
  createdAt,
  customerId: extra.customer || `c_${id}`,
  orderType: extra.orderType || 'delivery',
  pricing: { subtotal, total, platformFee: extra.platformFee || 0 },
});

const orders: any[] = [
  order('a', 'r1', 'delivered', at(0, 10), 20, 25, { customer: 'c1' }),
  order('b', 'r2', 'delivered', at(0, 11), 10, 12, { customer: 'c2', platformFee: 0.5, orderType: 'pickup' }),
  order('c', 'r1', 'cancelled', at(0, 12), 30, 35),
  order('d', 'r1', 'placed', at(0, 13), 15, 18),
  order('e', 'r1', 'delivered', at(-1, 18), 40, 50, { customer: 'c1' }), // yesterday
];

describe('admin metrics', () => {
  it('uses calendar days and an equal-length previous period', () => {
    const p = getPeriod('7d', undefined, NOW);
    expect(p.start).toEqual(new Date(2026, 10, 1));
    expect(p.days).toBe(7);
    expect(p.prevStart).toEqual(new Date(2026, 9, 25));
    expect(p.prevEnd.getDate()).toBe(31);
    expect(getPeriod('today', undefined, NOW).bucket).toBe('hour');
  });

  it('counts only completed orders as sales, using each store’s own commission', () => {
    const p = getPeriod('today', undefined, NOW);
    const s = summarise(orders as any, restaurants, p.start, p.end, firstOrderIndex(orders as any));
    expect(s.sales).toBe(37); // 25 + 12 (cancelled and still-placed orders excluded)
    expect(s.orders).toBe(2);
    expect(s.earnings).toBeCloseTo(20 * 0.15 + (10 * 0.1 + 0.5)); // 3 + 1.5
    expect(s.cancelRate).toBeCloseTo(1 / 4); // 1 cancelled of 4 placed today
    expect(s.avgOrder).toBe(18.5);
    expect(s.newCustomers).toBe(1); // c2 is new; c1 ordered yesterday
  });

  it('reports change vs the previous period, and "new" when there is no baseline', () => {
    expect(change(150, 100)).toBeCloseTo(0.5);
    expect(change(50, 0)).toBeNull();
    expect(change(0, 0)).toBe(0);
  });

  it('buckets the trend by hour for a single day', () => {
    const points = trend(orders as any, getPeriod('today', undefined, NOW));
    expect(points).toHaveLength(24);
    expect(points[10].sales).toBe(25);
    expect(points[11].orders).toBe(1);
  });

  it('flags stores and compares them with the previous period', () => {
    const rows = storeRows(orders as any, restaurants, getPeriod('today', undefined, NOW), NOW.getTime());
    const curry = rows.find((r) => r.id === 'r1')!;
    expect(curry.sales).toBe(25);
    expect(curry.prevSales).toBe(50);
    expect(curry.change).toBeCloseTo(-0.5);
    expect(curry.flags).toContain('declining');
  });

  it('counts live orders including those waiting to be accepted', () => {
    const live = liveCounts(orders as any, NOW);
    expect(live.waiting).toBe(1);
    expect(live.waitingLate).toBe(1); // placed at 13:00, now 14:00
    expect(live.completedToday).toBe(2);
  });

  it('splits sales by order type', () => {
    const mix = orderTypeMix(orders as any, getPeriod('today', undefined, NOW));
    expect(mix.find((m) => m.key === 'delivery')!.sales).toBe(25);
    expect(mix.find((m) => m.key === 'pickup')!.sales).toBe(12);
  });

  it('formats money compactly', () => {
    expect(formatMoneyCompact(12.5)).toBe('£12.50');
    expect(formatMoneyCompact(1234)).toBe('£1.2k');
    expect(formatMoneyCompact(45678)).toBe('£46k');
  });
});

/**
 * Orders tab filters: honest chip counts (facetedFilter) and the period / payment rules.
 */
import { facetedFilter } from '../utils/faceted-filter';
import { getPeriodRange, isInPeriod, isOrderPaid, paymentKindOf } from '../utils/order-filters';

type O = { id: string; type: string; day: 'today' | 'old'; pay: 'cash' | 'card' };

describe('facetedFilter — chip counts match the list you get by tapping', () => {
  // 3 orders today, 3 older ones (the situation in the screenshot: counts ignored the date)
  const orders: O[] = [
    { id: '1', type: 'dine_in', day: 'today', pay: 'cash' },
    { id: '2', type: 'dine_in', day: 'today', pay: 'card' },
    { id: '3', type: 'delivery', day: 'today', pay: 'cash' },
    { id: '4', type: 'dine_in', day: 'old', pay: 'cash' },
    { id: '5', type: 'dine_in', day: 'old', pay: 'card' },
    { id: '6', type: 'pickup', day: 'old', pay: 'cash' },
  ];
  const run = (type: string, pay: string) =>
    facetedFilter(orders, {
      date: (o) => o.day === 'today',
      type: (o) => type === 'all' || o.type === type,
      pay: (o) => pay === 'all' || o.pay === pay,
    });

  it('type counts respect the date (and every other filter), not all loaded orders', () => {
    const f = run('all', 'all');
    const byType = f.except('type');
    expect(byType.filter((o) => o.type === 'dine_in')).toHaveLength(2); // was 4 when counting everything
    expect(byType).toHaveLength(3); // the section's "All"
  });

  it('every chip number equals the list after tapping it', () => {
    const before = run('all', 'cash');
    const dineInChip = before.except('type').filter((o) => o.type === 'dine_in').length;
    const after = run('dine_in', 'cash');
    expect(after.filtered).toHaveLength(dineInChip);
  });

  it("a section's own selection doesn't shrink its other chips", () => {
    const f = run('dine_in', 'all');
    expect(f.filtered).toHaveLength(2);
    // Delivery is still offered with its real count, so you can switch to it
    expect(f.except('type').filter((o) => o.type === 'delivery')).toHaveLength(1);
  });
});

describe('getPeriodRange / isInPeriod', () => {
  const now = new Date(2026, 10, 28, 15, 0); // 28 Nov 2026, 15:00 local
  const at = (d: number, h = 12) => new Date(2026, 10, d, h).toISOString();
  const never = () => false;

  it('Today is local midnight to 23:59:59.999', () => {
    const r = getPeriodRange('today', '', '', now)!;
    expect(r.from.getHours()).toBe(0);
    expect(r.to.getDate()).toBe(28);
    expect(r.to.getHours()).toBe(23);
  });

  it('7 days = today plus the 6 days before', () => {
    const r = getPeriodRange('7days', '', '', now)!;
    expect(r.from.getDate()).toBe(22);
  });

  it('custom needs both dates; All time has no range', () => {
    expect(getPeriodRange('custom', '2026-11-01', '', now)).toBeNull();
    expect(getPeriodRange('custom', '2026-11-01', '2026-11-03', now)!.to.getDate()).toBe(3);
    expect(getPeriodRange('custom', '2026-02-30', '2026-03-01', now)).toBeNull(); // not a real date
    expect(getPeriodRange('all', '', '', now)).toBeNull();
  });

  it('finished orders count by when they were placed; in-progress orders always show', () => {
    const today = getPeriodRange('today', '', '', now);
    expect(isInPeriod({ createdAt: at(28) } as any, today, never)).toBe(true);
    expect(isInPeriod({ createdAt: at(27) } as any, today, never)).toBe(false);
    expect(isInPeriod({ createdAt: at(27), status: 'preparing' } as any, today, (o: any) => o.status === 'preparing')).toBe(true);
    expect(isInPeriod({ createdAt: at(1) } as any, null, never)).toBe(true);
  });
});

describe('payment rules', () => {
  it('groups payment types', () => {
    expect(paymentKindOf({ paymentType: 'cash' } as any)).toBe('cash');
    expect(paymentKindOf({ paymentMethod: 'COD' } as any)).toBe('cash');
    expect(paymentKindOf({ paymentType: 'card' } as any)).toBe('card');
    expect(paymentKindOf({ paymentType: 'stripe' } as any)).toBe('card');
    expect(paymentKindOf({ paymentType: 'wallet' } as any)).toBe('other');
  });

  it('paid means paid or completed', () => {
    expect(isOrderPaid({ paymentStatus: 'paid' } as any)).toBe(true);
    expect(isOrderPaid({ paymentStatus: 'Completed' } as any)).toBe(true);
    expect(isOrderPaid({ paymentStatus: 'pending' } as any)).toBe(false);
    expect(isOrderPaid({} as any)).toBe(false);
  });
});

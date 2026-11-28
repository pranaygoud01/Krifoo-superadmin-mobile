/**
 * The counting rules behind Restaurant Analytics (computeDashboardAnalytics) and the
 * page-by-page order fetch it relies on.
 */
import { computeDashboardAnalytics, channelOf } from '../components/RestaurantAnalytics';

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).toISOString();
const order = (o: Record<string, any>) =>
  ({ status: 'delivered', paymentType: 'cash', orderType: 'delivery', createdAt: at(2026, 11, 20), pricing: { totalAmount: 10 }, ...o }) as any;

describe('Restaurant analytics rules', () => {
  it('leaves cancelled, rejected and unpaid card orders out of sales', () => {
    const a = computeDashboardAnalytics([
      order({ _id: 'cash' }), // £10 sale
      order({ _id: 'card-paid', paymentType: 'card', paymentStatus: 'paid', pricing: { totalAmount: 20 } }), // £20 sale
      order({ _id: 'card-pending', paymentType: 'card', paymentStatus: 'pending', pricing: { totalAmount: 30 } }),
      order({ _id: 'card-refunded', paymentType: 'card', paymentStatus: 'refunded', pricing: { totalAmount: 40 } }),
      order({ _id: 'cancelled', status: 'cancelled', pricing: { totalAmount: 50 } }),
      order({ _id: 'rejected', status: 'placed', acceptanceStatus: 'rejected', pricing: { totalAmount: 60 } }),
    ]);
    expect(a.totalRevenue).toBe(30);
    expect(a.salesCount).toBe(2);
    expect(a.averageOrderValue).toBe(15);
    expect(a.unpaidOrders).toBe(2); // pending + refunded card orders
    expect(a.cancelledOrders).toBe(2); // cancelled + rejected
    expect(a.totalOrders).toBe(6);
  });

  it('ignores card checkouts that were never paid (awaiting_payment)', () => {
    const a = computeDashboardAnalytics([order({}), order({ status: 'awaiting_payment', paymentType: 'card' })]);
    expect(a.totalOrders).toBe(1);
    expect(a.statusReport.reduce((n, s) => n + s.count, 0)).toBe(1);
  });

  it('puts a rejected order under Cancelled in the status breakdown, not Placed', () => {
    const a = computeDashboardAnalytics([order({ status: 'placed', acceptanceStatus: 'rejected' })]);
    const byId = Object.fromEntries(a.statusReport.map((s) => [s.id, s.count]));
    expect(byId.cancelled).toBe(1);
    expect(byId.placed).toBe(0);
  });

  it('counts takeaway with pickup, never as delivery', () => {
    expect(channelOf(order({ orderType: 'takeaway' }))).toBe('pickup');
    expect(channelOf(order({ orderType: 'pickup' }))).toBe('pickup');
    expect(channelOf(order({ orderType: 'dine_in' }))).toBe('dine_in');
    expect(channelOf(order({ orderType: 'delivery' }))).toBe('delivery');
    const a = computeDashboardAnalytics([order({ orderType: 'takeaway' })]);
    expect(a.orderTypeBreakdown.find((c) => c.id === 'pickup')!.count).toBe(1);
    expect(a.orderTypeBreakdown.find((c) => c.id === 'delivery')!.count).toBe(0);
  });

  it('keeps the same day in different years apart in the daily chart', () => {
    const a = computeDashboardAnalytics([
      order({ createdAt: at(2025, 3, 5) }),
      order({ createdAt: at(2026, 3, 5) }),
    ]);
    expect(a.dailyBreakdown).toHaveLength(2);
    expect(a.dailyBreakdown[0].rawDate.getFullYear()).toBe(2025);
  });

  it('builds payment and channel shares from sales only', () => {
    const a = computeDashboardAnalytics([
      order({ paymentType: 'cash' }),
      order({ paymentType: 'card', paymentStatus: 'paid' }),
      order({ paymentType: 'card', paymentStatus: 'failed' }), // not a sale
      order({ status: 'cancelled', paymentType: 'cash' }), // not a sale
    ]);
    expect(a.cashOrdersCount).toBe(1);
    expect(a.onlineOrdersCount).toBe(1);
    expect(a.orderTypeBreakdown.find((c) => c.id === 'delivery')!.percentage).toBe(100);
  });
});

describe('fetchAllOrders({ allPages })', () => {
  const page = (n: number, size: number) =>
    Array.from({ length: size }, (_, i) => ({ _id: `p${n}-${i}`, createdAt: at(2026, 11, 20) }));

  function loadService(pages: Record<number, any>) {
    jest.resetModules();
    jest.doMock('../services/api', () => ({
      apiRequest: jest.fn(async (url: string) => {
        const p = Number(new URL(`http://x${url}`).searchParams.get('page'));
        return pages[p];
      }),
    }));
    let svc: any;
    jest.isolateModules(() => {
      svc = require('../services/order.service').orderService;
    });
    return svc;
  }

  afterEach(() => jest.dontMock('../services/api'));

  it('fetches every page and drops duplicates caused by new orders arriving while paging', async () => {
    const p1 = page(1, 200);
    const p2 = [p1[199], ...page(2, 199)]; // one order shifted onto page 2
    const svc = loadService({
      1: { success: true, data: p1, pagination: { total: 450, pages: 3 } },
      2: { success: true, data: p2 },
      3: { success: true, data: page(3, 50) },
    });
    const res = await svc.fetchAllOrders({ allPages: true });
    expect(res.success).toBe(true);
    expect(res.data).toHaveLength(449); // 200 + 199 + 50, the duplicate removed
  });

  it('reports a failure instead of partial totals if any page fails', async () => {
    const svc = loadService({
      1: { success: true, data: page(1, 200), pagination: { total: 400, pages: 2 } },
      2: { success: false, message: 'Server error' },
    });
    const res = await svc.fetchAllOrders({ allPages: true });
    expect(res.success).toBe(false);
    expect(res.data).toHaveLength(0);
  });

  it('still returns only the first page by default (live screens poll this)', async () => {
    const svc = loadService({
      1: { success: true, data: page(1, 150), pagination: { total: 400, pages: 3 } },
    });
    const res = await svc.fetchAllOrders();
    expect(res.data).toHaveLength(150);
  });
});

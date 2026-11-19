import { formatDuration, getOrderTiming, getScheduledDeadline, isOrderActionNeeded } from '../utils/order-timing';

const MIN = 60_000;
const base = new Date('2026-11-12T12:00:00').getTime();

const order = (overrides: Record<string, any> = {}): any => ({
  _id: 'o1',
  status: 'preparing',
  acceptanceStatus: 'accepted',
  createdAt: new Date(base - 2 * MIN).toISOString(),
  acceptedAt: new Date(base).toISOString(),
  expectedDeliveryTime: 30,
  orderedItems: [],
  restaurantId: 'r1',
  ...overrides,
});

describe('order countdown', () => {
  it('counts down from acceptedAt + expected minutes', () => {
    const t = getOrderTiming(order(), base + 10 * MIN);
    expect(t).toMatchObject({ kind: 'countdown', remainingMs: 20 * MIN, tone: 'normal' });
  });

  it('turns warning in the last 5 minutes and overdue at 0', () => {
    expect(getOrderTiming(order(), base + 26 * MIN)).toMatchObject({ tone: 'warning' });
    expect(getOrderTiming(order(), base + 30 * MIN)).toMatchObject({ tone: 'overdue' });
    expect(isOrderActionNeeded(order(), base + 31 * MIN)).toBe(true);
  });

  it('follows an edited expected time', () => {
    expect(isOrderActionNeeded(order({ expectedDeliveryTime: 45 }), base + 31 * MIN)).toBe(false);
  });

  it('has no countdown for new, finished, or legacy orders without acceptedAt', () => {
    expect(getOrderTiming(order({ status: 'placed', acceptanceStatus: 'pending', acceptedAt: null }), base).kind).toBe('none');
    expect(getOrderTiming(order({ status: 'delivered' }), base + 60 * MIN).kind).toBe('none');
    expect(getOrderTiming(order({ acceptedAt: undefined }), base + 60 * MIN).kind).toBe('none');
    expect(isOrderActionNeeded(order({ acceptedAt: undefined }), base + 60 * MIN)).toBe(false);
  });
});

describe('scheduled orders', () => {
  it('never count down, but need action once the scheduled time passes', () => {
    const o = order({ scheduleTimeDate: new Date(base + 60 * MIN).toISOString() });
    expect(getOrderTiming(o, base + 10 * MIN)).toMatchObject({ kind: 'scheduled', overdue: false });
    expect(isOrderActionNeeded(o, base + 10 * MIN)).toBe(false);
    expect(isOrderActionNeeded(o, base + 61 * MIN)).toBe(true);
  });

  it('includes scheduled orders that were never accepted', () => {
    const o = order({ status: 'placed', acceptanceStatus: 'pending', acceptedAt: null, collectionTime: '11:30' });
    // 11:30 is before the 11:58 creation time, so it means 11:30 tomorrow.
    expect(isOrderActionNeeded(o, base + 60 * MIN)).toBe(false);
    const later = order({ status: 'placed', acceptedAt: null, collectionTime: '12:30' });
    expect(isOrderActionNeeded(later, base + 31 * MIN)).toBe(true);
  });

  it('uses the end of a slot range', () => {
    const o = order({ deliverySlotTime: 'Slot: 13:00 - 13:30' });
    expect(getScheduledDeadline(o)).toBe(base + 90 * MIN);
  });
});

it('formats durations', () => {
  expect(formatDuration(754_000)).toBe('12:34');
  expect(formatDuration(-200_000)).toBe('03:20');
  expect(formatDuration(4_000_000)).toBe('1:06:40');
});

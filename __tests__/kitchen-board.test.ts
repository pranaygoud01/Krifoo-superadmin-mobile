import { buildKitchenBoard, getKitchenAction, getKitchenItems, getReadyLabel } from '../utils/kitchen-board';

const MIN = 60_000;
const now = new Date('2026-11-12T12:00:00').getTime();

let seq = 0;
const order = (overrides: Record<string, any> = {}): any => ({
  _id: `o${++seq}`,
  status: 'preparing',
  acceptanceStatus: 'accepted',
  orderType: 'pickup',
  createdAt: new Date(now - 20 * MIN).toISOString(),
  acceptedAt: new Date(now - 10 * MIN).toISOString(),
  expectedDeliveryTime: 30,
  orderedItems: [{ name: 'Biryani', quantity: 2 }],
  restaurantId: 'r1',
  ...overrides,
});

const ids = (list: any[]) => list.map((o) => o._id);

describe('buildKitchenBoard', () => {
  it('sorts orders into New / Cooking / Ready and drops finished ones', () => {
    const placed = order({ status: 'placed', acceptanceStatus: 'pending', acceptedAt: null });
    const cooking = order({ status: 'confirmed' });
    const ready = order({ status: 'ready_for_pickup' });
    const gone = [order({ status: 'out_for_delivery' }), order({ status: 'delivered' }), order({ status: 'cancelled' })];

    const board = buildKitchenBoard([placed, cooking, ready, ...gone], now, new Set());
    expect(ids(board.new)).toEqual([placed._id]);
    expect(ids(board.cooking)).toEqual([cooking._id]);
    expect(ids(board.ready)).toEqual([ready._id]);
  });

  it('shows delivery orders marked ready on this device in Ready', () => {
    const delivery = order({ orderType: 'delivery' });
    const board = buildKitchenBoard([delivery], now, new Set([delivery._id]));
    expect(ids(board.ready)).toEqual([delivery._id]);
    expect(board.cooking).toHaveLength(0);
    expect(getReadyLabel(delivery)).toBe('Waiting for rider');
  });

  it('puts overdue tickets first, then the oldest', () => {
    const newer = order({ acceptedAt: new Date(now - 5 * MIN).toISOString() });
    const older = order({ acceptedAt: new Date(now - 15 * MIN).toISOString() });
    const overdue = order({ acceptedAt: new Date(now - 2 * MIN).toISOString(), expectedDeliveryTime: 1 });
    const board = buildKitchenBoard([newer, older, overdue], now, new Set());
    expect(ids(board.cooking)).toEqual([overdue._id, older._id, newer._id]);
  });

  it('holds scheduled orders in Upcoming until 15 minutes before', () => {
    const later = order({ status: 'placed', scheduleTimeDate: new Date(now + 60 * MIN).toISOString() });
    const soon = order({ status: 'placed', scheduleTimeDate: new Date(now + 10 * MIN).toISOString() });
    const board = buildKitchenBoard([later, soon], now, new Set());
    expect(ids(board.upcoming)).toEqual([later._id]);
    expect(ids(board.new)).toEqual([soon._id]);
  });
});

describe('getKitchenAction', () => {
  it('new orders: Start cooking accepts them', () => {
    expect(getKitchenAction(order({ status: 'placed' }), 'new')).toEqual({ kind: 'status', status: 'preparing', label: 'Start cooking' });
  });

  it('cooking: matches the Orders board flow per fulfilment type', () => {
    expect(getKitchenAction(order({ orderType: 'pickup' }), 'cooking')).toMatchObject({ status: 'ready_for_pickup' });
    expect(getKitchenAction(order({ orderType: 'takeaway' }), 'cooking')).toMatchObject({ status: 'ready_for_pickup' });
    expect(getKitchenAction(order({ orderType: 'dine_in', tableNumber: 5 }), 'cooking')).toMatchObject({ status: 'delivered', label: 'Served' });
    expect(getKitchenAction(order({ orderType: 'delivery' }), 'cooking')).toEqual({ kind: 'local_ready', label: 'Ready' });
  });

  it('ready tickets have no button', () => {
    expect(getKitchenAction(order({ status: 'ready_for_pickup' }), 'ready')).toBeNull();
  });
});

it('reads item names and quantities from the different item shapes', () => {
  const items = getKitchenItems(order({
    orderedItems: [],
    items: [{ menuItemId: { name: 'Naan' }, qty: 3, instructions: ' extra butter ' }],
  }));
  expect(items[0]).toMatchObject({ name: 'Naan', quantity: 3, instructions: 'extra butter' });
});

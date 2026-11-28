/**
 * Home screen channel cards ("Dine-in · N active now", Pickup, Delivery):
 * only orders still being worked on are counted.
 */
import { countActiveOrdersByChannel, matchesOrderTypeFilter } from '../utils/order-fulfillment';
import { isActiveOrder, ACTIVE_ORDER_STATUSES } from '../utils/order-status';

const o = (fields: Record<string, any>) => ({ _id: Math.random().toString(36).slice(2), status: 'placed', ...fields }) as any;

describe('isActiveOrder', () => {
  it.each(ACTIVE_ORDER_STATUSES)('%s is active', (status) => {
    expect(isActiveOrder({ status })).toBe(true);
  });

  it.each(['delivered', 'cancelled', 'awaiting_payment'])('%s is not active', (status) => {
    expect(isActiveOrder({ status })).toBe(false);
  });

  it('a rejected order is not active, whatever its status says', () => {
    expect(isActiveOrder({ status: 'placed', acceptanceStatus: 'rejected' })).toBe(false);
  });
});

describe('countActiveOrdersByChannel', () => {
  it('leaves delivered, cancelled and rejected orders out of every card', () => {
    const counts = countActiveOrdersByChannel([
      o({ orderType: 'delivery', status: 'preparing' }), // counted
      o({ orderType: 'delivery', status: 'delivered' }),
      o({ orderType: 'delivery', status: 'cancelled' }),
      o({ orderType: 'pickup', status: 'ready_for_pickup' }), // counted
      o({ orderType: 'pickup', status: 'delivered' }),
      o({ orderType: 'dine_in', status: 'placed' }), // counted
      o({ orderType: 'dine_in', status: 'placed', acceptanceStatus: 'rejected' }),
    ]);
    expect(counts).toEqual({ inStore: 1, pickup: 1, delivery: 1 });
  });

  it('counts takeaway on the "Dine-in & Takeaway" card; Pickup is pickup only', () => {
    expect(countActiveOrdersByChannel([o({ orderType: 'takeaway' })])).toEqual({ inStore: 1, pickup: 0, delivery: 0 });
    expect(countActiveOrdersByChannel([o({ orderType: 'dine_in' })])).toEqual({ inStore: 1, pickup: 0, delivery: 0 });
    expect(countActiveOrdersByChannel([o({ orderType: 'pickup' })])).toEqual({ inStore: 0, pickup: 1, delivery: 0 });
  });

  it('uses the order type, not words in the notes', () => {
    // Previously a delivery whose note mentioned "pickup" or "table" moved to another card
    const counts = countActiveOrdersByChannel([
      o({ orderType: 'delivery', notes: 'Rider: please pickup the drinks too', deliveryAddress: { addressLine1: '1 High St' } }),
      o({ orderType: 'delivery', notes: 'Leave it on the vegetable box', deliveryAddress: { addressLine1: '2 High St' } }),
    ]);
    expect(counts).toEqual({ inStore: 0, pickup: 0, delivery: 2 });
  });

  it('counts an order once even if it appears twice in the list', () => {
    const same = o({ _id: 'x', orderType: 'pickup' });
    expect(countActiveOrdersByChannel([same, { ...same }]).pickup).toBe(1);
  });
});

describe('Orders tab type filter (what the home cards open)', () => {
  const pickup = o({ orderType: 'pickup' });
  const takeaway = o({ orderType: 'takeaway' });
  const dineIn = o({ orderType: 'dine_in' });
  const delivery = o({ orderType: 'delivery', deliveryAddress: { addressLine1: '1 High St' } });
  const all = [pickup, takeaway, dineIn, delivery];
  const shown = (filter: string) => all.filter((x) => matchesOrderTypeFilter(x, filter));

  it('the "Dine-in & Takeaway" card list ("in_store") shows exactly what the card counts', () => {
    expect(shown('in_store')).toEqual([takeaway, dineIn]);
    expect(shown('in_store')).toHaveLength(countActiveOrdersByChannel(all).inStore);
  });

  it('the Pickup card list shows pickup only, matching its count', () => {
    expect(shown('pickup')).toEqual([pickup]);
    expect(shown('pickup')).toHaveLength(countActiveOrdersByChannel(all).pickup);
  });

  it('the single-type filters in the filter sheet still work on their own', () => {
    expect(shown('pickup')).toEqual([pickup]);
    expect(shown('takeaway')).toEqual([takeaway]);
    expect(shown('delivery')).toEqual([delivery]);
    expect(shown('all')).toEqual(all);
  });
});

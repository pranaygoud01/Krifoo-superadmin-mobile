import { isBroadcastNotification, isNewOrderNotification } from '../utils/notification-kind';

describe('notification kind', () => {
  it('treats real new-order pushes as orders', () => {
    expect(isNewOrderNotification({ type: 'NEW_ORDER', orderId: 'x' })).toBe(true);
    expect(isNewOrderNotification({ isNew: true, status: 'placed' })).toBe(true);
  });

  it('never treats a Krifoo broadcast as an order (no buzz, no auto-print)', () => {
    const data = { type: 'KRIFOO_BROADCAST', broadcastId: 'b1', category: 'important' };
    expect(isBroadcastNotification(data)).toBe(true);
    expect(isNewOrderNotification(data)).toBe(false);
  });

  it('ignores status updates and text-only messages', () => {
    expect(isNewOrderNotification({ type: 'NEW_ORDER', status: 'preparing' })).toBe(false);
    // Previously "new order" in the title alone triggered the buzz + auto-print.
    expect(isNewOrderNotification({})).toBe(false);
    expect(isNewOrderNotification(undefined)).toBe(false);
  });
});

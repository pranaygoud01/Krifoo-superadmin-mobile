/**
 * Classifies incoming push notifications. Pure (no native modules) so it can be unit-tested.
 *
 * The backend tags every push with `data.type`:
 *   NEW_ORDER          → new order (buzz + auto-print)
 *   KRIFOO_BROADCAST   → service update from Krifoo (never an order)
 */

export const BROADCAST_TYPE = 'KRIFOO_BROADCAST';

/** DeviceEventEmitter event fired when a Krifoo service update arrives (refreshes the bell badge). */
export const KRIFOO_UPDATE_EVENT = 'krifoo_update_received';

const NEW_ORDER_TYPES = new Set(['NEW_ORDER', 'ORDER_CREATED', 'ORDER_PLACED']);
const NOT_NEW_STATUSES = new Set(['preparing', 'ready_for_pickup', 'out_for_delivery', 'delivered', 'cancelled']);

export function isBroadcastNotification(data: any): boolean {
  return data?.type === BROADCAST_TYPE;
}

/**
 * True only for genuine new-order pushes. Decided from the data payload — not from the
 * title/body text, which previously made any message mentioning "new order" buzz and print.
 */
export function isNewOrderNotification(data: any): boolean {
  if (!data || isBroadcastNotification(data)) return false;
  const status = data.status || data.order?.status || '';
  if (NOT_NEW_STATUSES.has(status)) return false;
  return NEW_ORDER_TYPES.has(data.type) || (data.isNew === true && status === 'placed');
}

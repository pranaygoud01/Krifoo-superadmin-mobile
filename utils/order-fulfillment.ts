import type { Order } from '../types';
import { isActiveOrder } from './order-status';

/** Works out how an order is fulfilled. Shared by the Orders board and Kitchen Mode. */
export function getOrderFulfillmentType(order: Order): 'delivery' | 'pickup' | 'takeaway' | 'dine_in' {
  const oType = ((order.orderType || (order as any).deliveryType || '') as string).toLowerCase();
  const domain = ((order.sourceDomain || '') as string).toLowerCase();
  const notes = typeof order.notes === 'string' ? order.notes.toLowerCase() : '';
  const addr1 = typeof (order.deliveryAddress as any)?.addressLine1 === 'string' ? (order.deliveryAddress as any).addressLine1.toLowerCase() : '';
  const app = ((order as any).appName || '').toLowerCase();

  if (
    oType === 'dine_in' ||
    oType === 'dinein' ||
    oType === 'eatin' ||
    oType === 'eat_in' ||
    (order as any).tableNumber ||
    notes.includes('eat-in') ||
    notes.includes('dine-in') ||
    notes.includes('dine in') ||
    // Whole-word match only: "vegetable" / "comfortable" must not flag an order as dine-in.
    /\btable\b/.test(notes) ||
    addr1.startsWith('table')
  ) {
    return 'dine_in';
  }

  const custName = (order.customerDetails?.name || (order.customerId as any)?.fullName || '').toLowerCase();
  const phone = (order.customerDetails?.phoneNumber || (order.customerId as any)?.phoneNumber || '').replace(/\D/g, '');

  const isTakeawayApp =
    oType === 'takeaway' ||
    app.includes('takeaway') ||
    notes.includes('takeaway') ||
    custName.includes('takeaway');

  if (oType === 'takeaway' || ((oType === 'pickup' || !oType) && isTakeawayApp)) {
    return 'takeaway';
  }

  if (oType === 'pickup' || oType === 'collection') {
    return 'pickup';
  }
  if (oType === 'delivery') {
    return 'delivery';
  }
  const addr = order.deliveryAddress;
  if (!addr) return isTakeawayApp ? 'takeaway' : 'pickup';
  if (typeof addr === 'string') return addr.trim() ? 'delivery' : (isTakeawayApp ? 'takeaway' : 'pickup');
  const hasAddrField = Boolean(
    addr.formattedAddress ||
    addr.addressLine1 ||
    (addr as any).fullAddress ||
    (addr as any).address ||
    addr.street ||
    addr.area ||
    addr.city ||
    addr.postalCode ||
    addr.postcode
  );
  if (hasAddrField) {
    const text = (addr.formattedAddress || addr.addressLine1 || (addr as any).fullAddress || '').toLowerCase();
    if (text.includes('pickup') || text.includes('collection')) return 'pickup';
    if (text.includes('takeaway')) return 'takeaway';
    if (/\b(dine|dine-in|table)\b/.test(text)) return 'dine_in';
    return 'delivery';
  }
  return isTakeawayApp ? 'takeaway' : 'pickup';
}

/**
 * Orders tab "Order type" filter values: 'all', a single type, or 'in_store' — dine-in and
 * takeaway together, which the home "Dine-in & Takeaway" card opens.
 */
export type OrderTypeFilter = 'all' | 'in_store' | ReturnType<typeof getOrderFulfillmentType>;

export const ORDER_TYPE_FILTER_VALUES: readonly OrderTypeFilter[] = ['all', 'in_store', 'delivery', 'pickup', 'takeaway', 'dine_in'];

export function matchesOrderTypeFilter(order: Order, filter: string): boolean {
  if (!filter || filter === 'all') return true;
  const type = getOrderFulfillmentType(order);
  if (filter === 'in_store') return type === 'dine_in' || type === 'takeaway';
  return type === filter;
}

/**
 * Active orders per home channel card. Only orders still being worked on are counted
 * (see isActiveOrder): delivered/collected, cancelled and rejected ones are left out.
 * The type comes from getOrderFulfillmentType, the same rule as the Orders tab.
 * Takeaway is counted on the "Dine-in & Takeaway" card, which opens the Orders tab with the
 * 'in_store' filter so its list shows exactly what it counts. Pickup is pickup only.
 */
export function countActiveOrdersByChannel(orders: Order[]): { inStore: number; pickup: number; delivery: number } {
  const counts = { inStore: 0, pickup: 0, delivery: 0 };
  const seen = new Set<string>();
  for (const order of orders) {
    if (!isActiveOrder(order as any)) continue;
    const id = String(order._id || '');
    if (id) {
      if (seen.has(id)) continue;
      seen.add(id);
    }
    const type = getOrderFulfillmentType(order);
    if (type === 'dine_in' || type === 'takeaway') counts.inStore += 1;
    else if (type === 'pickup') counts.pickup += 1;
    else counts.delivery += 1;
  }
  return counts;
}

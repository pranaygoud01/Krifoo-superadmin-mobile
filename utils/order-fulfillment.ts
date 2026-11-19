import type { Order } from '../types';

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

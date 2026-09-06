import { Order } from '../../types';
import { PosPrinterConfig } from '../pos-config.service';

export type ReceiptCommand =
  | { type: 'text'; value: string; bold?: boolean; align?: 'left' | 'center' | 'right'; size?: 'normal' | 'double' }
  | { type: 'line' }
  | { type: 'feed'; lines: number }
  | { type: 'cut'; mode?: 'full' | 'partial' }
  | { type: 'drawer'; pin?: 1 | 2 }
  | { type: 'barcode'; symbology: string; data: string }
  | { type: 'qr'; data: string };

function formatMoney(amount?: number): string {
  if (amount === undefined || amount === null || isNaN(amount)) return '£0.00';
  return `£${Number(amount).toFixed(2)}`;
}

function getItemPrice(item: any): number {
  if (!item) return 0;
  const qty = Number(item.quantity || item.qty || 1);

  // 1. Direct line total
  const lineTotal = item.itemTotal ?? item.totalPrice ?? item.total;
  if (lineTotal !== undefined && lineTotal !== null && !isNaN(Number(lineTotal)) && Number(lineTotal) > 0) {
    return Number(lineTotal);
  }

  // 2. Unit price
  const unitPrice =
    item.price ??
    item.basePrice ??
    item.unitPrice ??
    item.cost ??
    item.rate ??
    (typeof item.menuItemId === 'object' ? item.menuItemId?.price ?? item.menuItemId?.basePrice : undefined) ??
    (typeof item.itemId === 'object' ? item.itemId?.price ?? item.itemId?.basePrice : undefined);

  if (unitPrice !== undefined && unitPrice !== null && !isNaN(Number(unitPrice)) && Number(unitPrice) > 0) {
    return Number(unitPrice) * qty;
  }

  // 3. Customization price
  if (item.customization) {
    const customPrice = item.customization.price ?? item.customization.totalPrice;
    if (customPrice !== undefined && customPrice !== null && !isNaN(Number(customPrice)) && Number(customPrice) > 0) {
      return Number(customPrice) * qty;
    }
  }

  return 0;
}

function getItemName(item: any): string {
  if (!item) return 'Item';
  return (
    item.name ||
    item.itemName ||
    item.title ||
    item.dishName ||
    item.productName ||
    (typeof item.menuItemId === 'object' ? item.menuItemId?.name || item.menuItemId?.itemName : undefined) ||
    (typeof item.itemId === 'object' ? item.itemId?.name || item.itemId?.itemName : undefined) ||
    'Item'
  );
}

function getOrderItems(order: any): any[] {
  if (Array.isArray(order.orderedItems) && order.orderedItems.length > 0) return order.orderedItems;
  if (Array.isArray(order.items) && order.items.length > 0) return order.items;
  return [];
}

/**
 * Builds a protocol-neutral receipt document representation from an order
 */
export function buildReceiptDocument(order: Partial<Order> & any, config?: Partial<PosPrinterConfig>): ReceiptCommand[] {
  const commands: ReceiptCommand[] = [];
  const is58mm = config?.paperWidth === '58mm';
  const cols = is58mm ? 32 : 48;

  const orderNum = order.orderNumber || (order._id ? `#${order._id.slice(-5).toUpperCase()}` : '#00000');

  // Restaurant details
  const restaurantName =
    typeof order.restaurantId === 'object'
      ? order.restaurantId?.restaurantName || 'KRIFOO PARTNER'
      : 'KRIFOO PARTNER';

  const restaurantPhone =
    typeof order.restaurantId === 'object'
      ? order.restaurantId?.phoneNumber || ''
      : '';

  // Customer details
  const customerName =
    order.customerDetails?.name ||
    order.customerId?.fullName ||
    order.userId?.fullName ||
    order.customerName ||
    'Customer';

  const customerPhone =
    order.customerDetails?.phoneNumber ||
    order.customerId?.phoneNumber ||
    order.userId?.phoneNumber ||
    order.deliveryAddress?.phoneNumber ||
    '';

  // Fulfillment type
  const fulfillmentType = (
    order.orderType ||
    order.deliveryType ||
    (order.deliveryAddress ? 'delivery' : 'pickup')
  ).toString().toUpperCase();

  const isDineIn =
    fulfillmentType.includes('DINE') ||
    fulfillmentType.includes('EAT') ||
    Boolean(order.tableNumber) ||
    Boolean(order.notes?.toLowerCase().includes('table'));

  const tableInfo = order.tableNumber ? `TABLE ${order.tableNumber}` : '';

  // 1. Header & Restaurant Name
  commands.push({ type: 'text', value: restaurantName.toUpperCase(), bold: true, align: 'center', size: 'double' });
  if (restaurantPhone) {
    commands.push({ type: 'text', value: `Tel: ${restaurantPhone}`, align: 'center' });
  }
  commands.push({ type: 'line' });

  // 2. Order Number & Status
  commands.push({ type: 'text', value: `ORDER ${orderNum}`, bold: true, align: 'center', size: 'double' });

  const placedDate = order.createdAt ? new Date(order.createdAt).toLocaleString('en-GB') : new Date().toLocaleString('en-GB');
  commands.push({ type: 'text', value: `Placed: ${placedDate}`, align: 'center' });

  // 3. Fulfillment Badge
  let badgeText = isDineIn ? `[ EAT-IN / DINE-IN ${tableInfo} ]` : `[ ${fulfillmentType} ORDER ]`;
  commands.push({ type: 'text', value: badgeText, bold: true, align: 'center', size: 'normal' });
  commands.push({ type: 'line' });

  // 4. Customer & Delivery Address Details
  commands.push({ type: 'text', value: `Customer: ${customerName}`, bold: true, align: 'left' });
  if (customerPhone) {
    commands.push({ type: 'text', value: `Phone:    ${customerPhone}`, align: 'left' });
  }

  const rawAddress =
    order.deliveryAddress?.formattedAddress ||
    order.deliveryAddress?.addressLine1 ||
    (typeof order.deliveryAddress === 'string' ? order.deliveryAddress : null);

  if (rawAddress && !isDineIn) {
    commands.push({ type: 'text', value: `Address:  ${rawAddress}`, bold: true, align: 'left' });
    if (order.deliveryAddress?.postalCode || order.deliveryAddress?.postcode) {
      const pc = (order.deliveryAddress?.postalCode || order.deliveryAddress?.postcode).toUpperCase();
      commands.push({ type: 'text', value: `Postcode: ${pc}`, bold: true, align: 'left' });
    }
  }

  commands.push({ type: 'line' });

  // 5. Items Header & Rows
  const items = getOrderItems(order);
  const leftColWidth = cols === 32 ? 4 : 5;
  const rightColWidth = cols === 32 ? 8 : 9;
  const midColWidth = cols - leftColWidth - rightColWidth;

  const headerRow = 'QTY'.padEnd(leftColWidth) + 'ITEM'.padEnd(midColWidth) + 'PRICE'.padStart(rightColWidth);
  commands.push({ type: 'text', value: headerRow, bold: true, align: 'left' });
  commands.push({ type: 'line' });

  for (const item of items) {
    const qtyStr = `${item.quantity || item.qty || 1}x`.padEnd(leftColWidth);
    const itemName = getItemName(item);
    const itemTotalStr = formatMoney(getItemPrice(item)).padStart(rightColWidth);

    // Truncate or wrap item name if longer than mid column width
    if (itemName.length <= midColWidth) {
      const line = qtyStr + itemName.padEnd(midColWidth) + itemTotalStr;
      commands.push({ type: 'text', value: line, bold: true, align: 'left' });
    } else {
      const firstLine = qtyStr + itemName.substring(0, midColWidth) + itemTotalStr;
      commands.push({ type: 'text', value: firstLine, bold: true, align: 'left' });
      const remainingName = itemName.substring(midColWidth).trim();
      if (remainingName) {
        commands.push({ type: 'text', value: ' '.repeat(leftColWidth) + remainingName, bold: true, align: 'left' });
      }
    }

    // Customization details (size, add-ons)
    if (item.customization?.size) {
      commands.push({ type: 'text', value: `   * Size: ${item.customization.size}`, align: 'left' });
    }
    if (Array.isArray(item.customization?.addOns) && item.customization.addOns.length > 0) {
      commands.push({ type: 'text', value: `   + ${item.customization.addOns.join(', ')}`, align: 'left' });
    }
  }

  commands.push({ type: 'line' });

  // 6. Pricing Totals
  const subtotal = Number(order.pricing?.subtotal ?? (order as any).subtotal ?? order.totalAmount ?? 0);
  const deliveryFee = Number(order.pricing?.deliveryFee ?? (order as any).deliveryFee ?? 0);
  const onlinePaymentFee = Number(order.pricing?.onlinePaymentFee ?? (order as any).onlinePaymentFee ?? (order.pricing as any)?.cardFee ?? (order.pricing as any)?.paymentFee ?? 0);
  const handlingCharge = Number(order.pricing?.handlingCharge ?? (order as any).handlingCharge ?? 0);
  const platformFee = Number(order.pricing?.platformFee ?? (order as any).platformFee ?? (order.pricing as any)?.serviceFee ?? (order as any).serviceFee ?? 0);
  const tax = Number(order.pricing?.tax ?? order.pricing?.vat ?? (order as any).tax ?? (order as any).vat ?? 0);
  const tip = Number(order.pricing?.tip ?? (order as any).tip ?? 0);
  const discount = Number(order.pricing?.discount ?? order.pricing?.discountAmount ?? (order as any).discountAmount ?? 0);
  const total = Number(order.pricing?.total ?? order.pricing?.totalAmount ?? order.totalAmount ?? (subtotal + deliveryFee + onlinePaymentFee + handlingCharge + platformFee + tax + tip - discount));

  const formatSummaryRow = (label: string, value: string) => {
    const spaces = Math.max(1, cols - label.length - value.length);
    return label + ' '.repeat(spaces) + value;
  };

  if (subtotal > 0) {
    commands.push({ type: 'text', value: formatSummaryRow('Subtotal:', formatMoney(subtotal)), align: 'left' });
  }
  if (deliveryFee > 0) {
    commands.push({ type: 'text', value: formatSummaryRow('Delivery Fee:', formatMoney(deliveryFee)), align: 'left' });
  }
  if (onlinePaymentFee > 0) {
    commands.push({ type: 'text', value: formatSummaryRow('Online Payment Fee:', formatMoney(onlinePaymentFee)), align: 'left' });
  }
  if (handlingCharge > 0) {
    commands.push({ type: 'text', value: formatSummaryRow('Handling Charge:', formatMoney(handlingCharge)), align: 'left' });
  }
  if (platformFee > 0) {
    commands.push({ type: 'text', value: formatSummaryRow('Service / Platform Fee:', formatMoney(platformFee)), align: 'left' });
  }
  if (tax > 0) {
    commands.push({ type: 'text', value: formatSummaryRow('Tax / VAT:', formatMoney(tax)), align: 'left' });
  }
  if (tip > 0) {
    commands.push({ type: 'text', value: formatSummaryRow('Driver Tip:', formatMoney(tip)), align: 'left' });
  }
  if (discount > 0) {
    commands.push({ type: 'text', value: formatSummaryRow('Discount:', `-${formatMoney(discount)}`), align: 'left' });
  }

  commands.push({ type: 'line' });
  commands.push({ type: 'text', value: formatSummaryRow('TOTAL:', formatMoney(total)), bold: true, align: 'left', size: 'double' });
  commands.push({ type: 'line' });

  // 7. Payment Information
  const pType = (order.paymentType || '').toLowerCase();
  const paymentText = pType === 'cash' ? 'PAYMENT: CASH (COLLECT ON DELIVERY)' : 'PAYMENT: ONLINE (PAID)';
  commands.push({ type: 'text', value: paymentText, bold: true, align: 'center' });

  // 8. Order Notes
  if (order.notes && order.notes.trim()) {
    commands.push({ type: 'line' });
    commands.push({ type: 'text', value: `NOTE: ${order.notes.trim()}`, bold: true, align: 'left' });
  }

  // 9. Footer & Cut / Drawer
  commands.push({ type: 'feed', lines: 1 });
  commands.push({ type: 'text', value: 'Thank you for your order!', bold: true, align: 'center' });
  commands.push({ type: 'feed', lines: 3 });

  if (config?.autoCut !== false) {
    commands.push({ type: 'cut', mode: 'partial' });
  }

  if (config?.openCashDrawer && (pType === 'cash' || order.status === 'placed')) {
    commands.push({ type: 'drawer', pin: 1 });
  }

  return commands;
}

/**
 * Protocol-neutral document to pulse the cash drawer kick without an order
 */
export function buildDrawerKickDocument(pin: 1 | 2 = 1): ReceiptCommand[] {
  return [{ type: 'drawer', pin }];
}

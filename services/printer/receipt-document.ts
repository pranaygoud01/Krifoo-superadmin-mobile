import { Order } from '../../types';
import { PosPrinterConfig } from '../pos-config.service';
import { ReceiptTemplate, getCachedStoreProfile, formatRestaurantAddress } from '../receipt-customization.service';

export type ReceiptCommand =
  | {
      type: 'text';
      value: string;
      bold?: boolean;
      italic?: boolean;
      align?: 'left' | 'center' | 'right';
      size?: 'normal' | 'double' | 'small';
      font?: 'fontA' | 'fontB';
    }
  | { type: 'line'; char?: string }
  | { type: 'feed'; lines: number }
  | { type: 'cut'; mode?: 'full' | 'partial' }
  | { type: 'drawer'; pin?: 1 | 2 }
  | { type: 'barcode'; symbology: string; data: string }
  | { type: 'qr'; data: string; label?: string }
  | { type: 'spacing'; mode: 'compact' | 'normal' | 'relaxed' };

/**
 * Formats a raw schedule timestamp (ISO string, date string, or custom slot)
 * into a clear, human-readable format with date and time.
 * Examples:
 *   "2026-10-01T18:30:00.000Z" -> "Thu, 01 Oct 2026, 06:30 PM"
 *   "Pickup: 18:30" -> "Today, 18:30"
 *   "Slot: 18:00 - 18:30" -> "18:00 - 18:30"
 */
export function formatScheduleDisplay(raw: string | null | undefined): string {
  if (!raw) return '';
  const trimmed = String(raw).trim();
  if (!trimmed) return '';

  if (trimmed.toLowerCase() === 'asap') {
    return 'ASAP';
  }

  // Strip prefixes like "Pickup: ", "Slot: ", "Delivery: ", "Target: ", "Scheduled: "
  const prefixMatch = trimmed.match(/^(pickup|slot|delivery|target|scheduled)\s*:\s*/i);
  let cleanTime = trimmed;
  if (prefixMatch) {
    cleanTime = trimmed.slice(prefixMatch[0].length).trim();
  }

  // If already a time range like "14:00 - 14:30" or "14:00 to 14:30"
  if (/^\d{1,2}:\d{2}\s*(-|to)\s*\d{1,2}:\d{2}/i.test(cleanTime)) {
    return cleanTime;
  }

  // If plain time like "18:30" or "18:30:00"
  if (/^\d{1,2}:\d{2}(:\d{2})?$/i.test(cleanTime)) {
    const parts = cleanTime.split(':');
    const h = parseInt(parts[0], 10);
    const m = parts[1] || '00';
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `Today, ${String(h12).padStart(2, '0')}:${m} ${ampm} (${cleanTime.slice(0, 5)})`;
  }

  // Check if it's an ISO or date format
  const dateObj = new Date(cleanTime);
  if (!isNaN(dateObj.getTime()) && (cleanTime.includes('-') || cleanTime.includes('/') || cleanTime.includes('T'))) {
    try {
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

      const dayName = days[dateObj.getDay()];
      const day = String(dateObj.getDate()).padStart(2, '0');
      const month = months[dateObj.getMonth()];
      const year = dateObj.getFullYear();

      let hours = dateObj.getHours();
      const minutes = String(dateObj.getMinutes()).padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12;
      const formattedHour = String(hours).padStart(2, '0');

      return `${dayName}, ${day} ${month} ${year}, ${formattedHour}:${minutes} ${ampm}`;
    } catch {
      return cleanTime;
    }
  }

  return cleanTime;
}

/**
 * Resolves whether an order is scheduled and extracts its target delivery/pickup slot or time.
 */
export function getOrderScheduleInfo(order: any): {
  isScheduled: boolean;
  scheduleTimeText: string | null;
  scheduledLabel: string;
} {
  if (!order) return { isScheduled: false, scheduleTimeText: null, scheduledLabel: 'ASAP' };

  // 1. Delivery slot extraction (string or object)
  let slotTime: string | null = null;
  if (order.deliverySlotTime && typeof order.deliverySlotTime === 'string') {
    slotTime = order.deliverySlotTime;
  } else if (order.deliverySlot) {
    if (typeof order.deliverySlot === 'string') {
      slotTime = order.deliverySlot;
    } else if (typeof order.deliverySlot === 'object') {
      slotTime = order.deliverySlot.slotTime || order.deliverySlot.time ||
        (order.deliverySlot.startTime ? `${order.deliverySlot.startTime}${order.deliverySlot.endTime ? ` - ${order.deliverySlot.endTime}` : ''}` : null);
      if (order.deliverySlot.date && slotTime) {
        slotTime = `${order.deliverySlot.date} ${slotTime}`;
      }
    }
  }
  if (!slotTime && order.selectedDeliverySlotId && typeof order.selectedDeliverySlotId === 'object') {
    slotTime = order.selectedDeliverySlotId.slotTime || order.selectedDeliverySlotId.time ||
      (order.selectedDeliverySlotId.startTime ? `${order.selectedDeliverySlotId.startTime}${order.selectedDeliverySlotId.endTime ? ` - ${order.selectedDeliverySlotId.endTime}` : ''}` : null);
  }
  if (!slotTime && order.slotTime && typeof order.slotTime === 'string') {
    slotTime = order.slotTime;
  }

  // 2. Collection Time (pickup / takeaway)
  let collectionTime: string | null = null;
  if (typeof order.collectionTime === 'string' && order.collectionTime.trim().toLowerCase() !== 'asap') {
    collectionTime = order.collectionTime.trim();
  }

  // 3. General schedule timestamp/date
  let scheduleTimeDate: string | null = null;
  if (order.scheduleTimeDate && typeof order.scheduleTimeDate === 'string' && order.scheduleTimeDate.trim().toLowerCase() !== 'asap') {
    scheduleTimeDate = order.scheduleTimeDate.trim();
  } else if (order.scheduledFor && typeof order.scheduledFor === 'string') {
    scheduleTimeDate = order.scheduledFor.trim();
  } else if (order.scheduledTime && typeof order.scheduledTime === 'string') {
    scheduleTimeDate = order.scheduledTime.trim();
  } else if (order.targetDeliveryTime && typeof order.targetDeliveryTime === 'string') {
    scheduleTimeDate = order.targetDeliveryTime.trim();
  } else if (order.targetTime && typeof order.targetTime === 'string' && !order.targetTime.toLowerCase().includes('today by')) {
    scheduleTimeDate = order.targetTime.trim();
  }

  if (order.scheduledDate && order.scheduledTime && typeof order.scheduledDate === 'string' && typeof order.scheduledTime === 'string') {
    scheduleTimeDate = `${order.scheduledDate} ${order.scheduledTime}`;
  }

  if (slotTime && slotTime.trim() && slotTime.trim().toLowerCase() !== 'asap') {
    const formatted = formatScheduleDisplay(slotTime.trim());
    return { isScheduled: true, scheduleTimeText: formatted, scheduledLabel: `SLOT: ${formatted}` };
  }

  if (collectionTime && collectionTime.trim()) {
    const formatted = formatScheduleDisplay(collectionTime.trim());
    return { isScheduled: true, scheduleTimeText: formatted, scheduledLabel: `PICKUP: ${formatted}` };
  }

  if (scheduleTimeDate && scheduleTimeDate.trim()) {
    const formatted = formatScheduleDisplay(scheduleTimeDate.trim());
    return { isScheduled: true, scheduleTimeText: formatted, scheduledLabel: `SCHEDULED: ${formatted}` };
  }

  if (order.isScheduled) {
    const fallback = order.scheduledTime || order.scheduleTime || order.collectionTime || order.deliverySlotTime;
    const formatted = fallback ? formatScheduleDisplay(fallback) : 'Scheduled Order';
    return { isScheduled: true, scheduleTimeText: formatted, scheduledLabel: 'SCHEDULED' };
  }

  return { isScheduled: false, scheduleTimeText: null, scheduledLabel: 'ASAP' };
}

export function getOrderFulfillmentLabel(order: any): string {
  if (!order) return 'DELIVERY';

  const rawFType = (
    order.orderType ||
    order.deliveryType ||
    (order.deliveryAddress ? 'delivery' : 'pickup')
  ).toString().toUpperCase();

  const domain = String(order.sourceDomain || '').toLowerCase();
  const notes = typeof order.notes === 'string' ? order.notes.toLowerCase() : '';
  const custName = (order.customerDetails?.name || (order.customerId as any)?.fullName || '').toLowerCase();
  const phone = (order.customerDetails?.phoneNumber || (order.customerId as any)?.phoneNumber || '').replace(/\D/g, '');

  const isDineIn =
    rawFType.includes('DINE') ||
    rawFType.includes('EAT') ||
    Boolean(order.tableNumber) ||
    Boolean(order.notes?.toLowerCase().includes('table'));

  if (isDineIn) {
    const tableNum = order.tableNumber || (order.notes?.match(/table\s*([0-9a-zA-Z]+)/i)?.[1]) || '';
    return tableNum ? `DINE-IN (TABLE ${tableNum})` : 'DINE-IN';
  }

  const isTakeaway =
    rawFType.includes('TAKEAWAY') ||
    domain.includes('swaad-takeaway') ||
    domain.includes('swaadtakeaway') ||
    notes.includes('takeaway') ||
    custName.includes('takeaway') ||
    custName.includes('swaad takeaway') ||
    phone.includes('7783448291') ||
    (order as any).appName === 'swaad-takeaway';

  if (isTakeaway) return 'TAKEAWAY';
  if (rawFType.includes('PICKUP') || rawFType.includes('COLLECT')) return 'PICKUP';
  if (rawFType.includes('DELIV')) return 'DELIVERY';

  return rawFType || 'DELIVERY';
}

export function getSanitizedOrderNotes(notes?: string): string {
  if (!notes || typeof notes !== 'string') return '';
  const cleaned = notes
    .split('•')
    .map((s) => s.trim())
    .filter((s) => {
      const lower = s.toLowerCase();
      return (
        !lower.includes('dine-in order') &&
        !lower.includes('dine in order') &&
        !lower.includes('dine in (takeaway)') &&
        !lower.includes('takeaway order') &&
        !lower.includes('eat-in order') &&
        !lower.includes('eat in order') &&
        lower !== 'dine in' &&
        lower !== 'dine-in' &&
        lower !== 'takeaway' &&
        lower !== 'eat-in' &&
        lower !== 'eat in'
      );
    })
    .join(' • ')
    .trim();
  return cleaned;
}

function formatMoney(amount?: number): string {
  if (amount === undefined || amount === null || isNaN(amount)) return '£0.00';
  return `£${Number(amount).toFixed(2)}`;
}

export function getItemPrice(item: any): number {
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
    (typeof order.restaurantId === 'object' ? order.restaurantId?.restaurantName : '') ||
    order.restaurantName ||
    order.restaurantTitle ||
    (typeof order.restaurant === 'object' ? order.restaurant?.restaurantName || order.restaurant?.name : '') ||
    getCachedStoreProfile()?.restaurantName ||
    'Restaurant';

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
  const rawFType = (
    order.orderType ||
    order.deliveryType ||
    (order.deliveryAddress ? 'delivery' : 'pickup')
  ).toString().toUpperCase();

  const domain = String(order.sourceDomain || '').toLowerCase();
  const notes = typeof order.notes === 'string' ? order.notes.toLowerCase() : '';
  const custName = (order.customerDetails?.name || (order.customerId as any)?.fullName || '').toLowerCase();
  const phone = (order.customerDetails?.phoneNumber || (order.customerId as any)?.phoneNumber || '').replace(/\D/g, '');
  const isTakeaway =
    rawFType.includes('TAKEAWAY') ||
    domain.includes('swaad-takeaway') ||
    domain.includes('swaadtakeaway') ||
    notes.includes('takeaway') ||
    custName.includes('takeaway') ||
    custName.includes('swaad takeaway') ||
    phone.includes('7783448291') ||
    (order as any).appName === 'swaad-takeaway';

  const isDineIn =
    rawFType.includes('DINE') ||
    rawFType.includes('EAT') ||
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

  // 3. Fulfillment Badge & Scheduled Notice
  let badgeText = isDineIn ? `[ DINE IN (TAKEAWAY) ${tableInfo} ]` : isTakeaway ? `[ TAKEAWAY ORDER ]` : `[ ${rawFType} ORDER ]`;
  commands.push({ type: 'text', value: badgeText, bold: true, align: 'center', size: 'normal' });

  const scheduleInfo = getOrderScheduleInfo(order);
  const fulfillmentLabel = getOrderFulfillmentLabel(order);
  if (scheduleInfo.isScheduled && scheduleInfo.scheduleTimeText) {
    commands.push({ type: 'line', char: '=' });
    commands.push({ type: 'text', value: `*** SCHEDULED ${fulfillmentLabel} ***`, bold: true, align: 'center', size: 'double' });
    commands.push({ type: 'text', value: `ORDER TYPE: ${fulfillmentLabel}`, bold: true, align: 'center', size: 'normal' });
    commands.push({ type: 'text', value: `TARGET: ${scheduleInfo.scheduleTimeText.toUpperCase()}`, bold: true, align: 'center', size: 'normal' });
    commands.push({ type: 'line', char: '=' });
  } else {
    commands.push({ type: 'line' });
  }

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
  const displayNotes = getSanitizedOrderNotes(order.notes);
  if (displayNotes) {
    commands.push({ type: 'line' });
    commands.push({ type: 'text', value: `NOTE: ${displayNotes}`, bold: true, align: 'left' });
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

/**
 * Builds a customizable receipt document representation based on a restaurant owner's template settings
 */
export function buildCustomizedReceiptDocument(
  order: Partial<Order> & any,
  config?: Partial<PosPrinterConfig>,
  template?: ReceiptTemplate
): ReceiptCommand[] {
  // If no customization template provided, fallback to standard document
  if (!template) {
    return buildReceiptDocument(order, config);
  }

  const commands: ReceiptCommand[] = [];
  const layout = template.layout;
  const content = template.content;

  const is58mm = layout.paperWidth === '58mm' || config?.paperWidth === '58mm';
  const cols = is58mm ? 32 : 48;
  const font = layout.fontFamily;
  const headerAlign = layout.alignment.header;
  const itemsAlign = layout.alignment.items;
  const totalsAlign = layout.alignment.totals;
  const footerAlign = layout.alignment.footer;

  // 0. Line spacing control
  commands.push({ type: 'spacing', mode: layout.lineSpacing });

  const orderNum = order.orderNumber || (order._id ? `#${order._id.slice(-5).toUpperCase()}` : '#00000');

  // Restaurant details - fetched directly from order backend data (not editable)
  const restaurantName =
    (typeof order.restaurantId === 'object' ? order.restaurantId?.restaurantName : '') ||
    order.restaurantName ||
    order.restaurantTitle ||
    (typeof order.restaurant === 'object' ? order.restaurant?.restaurantName || order.restaurant?.name : '') ||
    getCachedStoreProfile()?.restaurantName ||
    'Restaurant';

  const restaurantPhone =
    (typeof order.restaurantId === 'object' ? order.restaurantId?.phoneNumber : '') ||
    order.restaurantPhone ||
    '';

  const rawRestAddr =
    (typeof order.restaurantId === 'object'
      ? order.restaurantId?.address || order.restaurantId?.formattedAddress
      : '') ||
    order.restaurantAddress ||
    (typeof order.restaurant === 'object'
      ? order.restaurant?.address || order.restaurant?.formattedAddress
      : '') ||
    getCachedStoreProfile()?.address;

  const restaurantAddress = formatRestaurantAddress(rawRestAddr);

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

  const tableNum = order.tableNumber || (isDineIn && order.notes?.match(/table\s*([0-9a-zA-Z]+)/i)?.[1]) || '';

  // 1. Header Section
  if (content.showLogo && content.logoUrl) {
    commands.push({ type: 'text', value: '[ *** LOGO *** ]', align: headerAlign, font });
  }

  if (content.customHeaderTitle && content.customHeaderTitle.trim()) {
    commands.push({
      type: 'text',
      value: content.customHeaderTitle.trim().toUpperCase(),
      bold: true,
      align: headerAlign,
      size: 'normal',
      font,
    });
  }

  if (content.showRestaurantName) {
    commands.push({
      type: 'text',
      value: restaurantName.toUpperCase(),
      bold: layout.boldElements.restaurantName,
      align: headerAlign,
      size: layout.fontSize === 'large' ? 'double' : 'normal',
      font,
    });
  }

  if (content.headerMessage && content.headerMessage.trim()) {
    commands.push({
      type: 'text',
      value: content.headerMessage.trim(),
      italic: layout.italicElements.tagline,
      align: headerAlign,
      font,
    });
  }

  if (content.showAddress && restaurantAddress) {
    commands.push({ type: 'text', value: restaurantAddress, align: headerAlign, font });
  }

  if (content.showPhone && restaurantPhone) {
    commands.push({ type: 'text', value: `Tel: ${restaurantPhone}`, align: headerAlign, font });
  }

  if (content.showTaxId && content.taxIdValue) {
    const label = content.taxIdLabel || 'Tax ID:';
    commands.push({ type: 'text', value: `${label} ${content.taxIdValue}`.trim(), align: headerAlign, font });
  }

  commands.push({ type: 'line' });

  // 2. Order Metadata & Badges
  if (content.showOrderNumber) {
    commands.push({
      type: 'text',
      value: `ORDER ${orderNum}`,
      bold: layout.boldElements.orderNumber,
      align: headerAlign,
      size: 'double',
      font,
    });
  }

  if (content.showDateTime) {
    const now = order.createdAt ? new Date(order.createdAt) : new Date();
    let dateStr = '';
    if (content.dateTimeFormat === 'time_only') {
      dateStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    } else if (content.dateTimeFormat === 'short') {
      dateStr = `${now.getDate()}/${now.getMonth() + 1} ${now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
    } else {
      dateStr = now.toLocaleString('en-GB');
    }
    commands.push({ type: 'text', value: `Placed: ${dateStr}`, align: headerAlign, font });
  }

  // Fulfillment badge
  const customDomain = String(order.sourceDomain || '').toLowerCase();
  const customNotes = typeof order.notes === 'string' ? order.notes.toLowerCase() : '';
  const customCustName = (order.customerDetails?.name || (order.customerId as any)?.fullName || '').toLowerCase();
  const customPhone = (order.customerDetails?.phoneNumber || (order.customerId as any)?.phoneNumber || '').replace(/\D/g, '');
  const isCustomTakeaway =
    fulfillmentType.includes('TAKEAWAY') ||
    customDomain.includes('swaad-takeaway') ||
    customDomain.includes('swaadtakeaway') ||
    customNotes.includes('takeaway') ||
    customCustName.includes('takeaway') ||
    customCustName.includes('swaad takeaway') ||
    customPhone.includes('7783448291') ||
    (order as any).appName === 'swaad-takeaway';

  const badgeText = isDineIn
    ? `[ DINE IN (TAKEAWAY) ${tableNum ? `TABLE ${tableNum}` : ''} ]`
    : isCustomTakeaway
    ? `[ TAKEAWAY ORDER ]`
    : `[ ${fulfillmentType} ORDER ]`;
  commands.push({ type: 'text', value: badgeText, bold: true, align: 'center', font });

  const customScheduleInfo = getOrderScheduleInfo(order);
  const customFulfillmentLabel = getOrderFulfillmentLabel(order);
  const showSched = content.showScheduledTime !== false && customScheduleInfo.isScheduled && customScheduleInfo.scheduleTimeText;
  if (showSched) {
    commands.push({ type: 'line', char: '=' });
    commands.push({ type: 'text', value: `*** SCHEDULED ${customFulfillmentLabel} ***`, bold: true, align: 'center', size: 'double', font });
    commands.push({ type: 'text', value: `ORDER TYPE: ${customFulfillmentLabel}`, bold: true, align: 'center', size: 'normal', font });
    commands.push({ type: 'text', value: `TARGET: ${(customScheduleInfo.scheduleTimeText || '').toUpperCase()}`, bold: true, align: 'center', size: 'normal', font });
    commands.push({ type: 'line', char: '=' });
  } else {
    commands.push({ type: 'line' });
  }

  if (content.showTableNumber && tableNum) {
    commands.push({ type: 'text', value: `TABLE: ${tableNum.toUpperCase()}`, bold: true, align: 'center', font });
  }

  if (content.showServerWaiterName && (order.waiterName || content.serverWaiterName)) {
    const waiter = order.waiterName || content.serverWaiterName;
    commands.push({ type: 'text', value: `Server: ${waiter}`, align: 'center', font });
  }

  commands.push({ type: 'line' });

  // 3. Customer & Delivery Address Details
  if (content.showCustomerInfo) {
    commands.push({
      type: 'text',
      value: `Customer: ${customerName}`,
      bold: layout.boldElements.customerDetails,
      align: 'left',
      font,
    });

    if (customerPhone) {
      commands.push({ type: 'text', value: `Phone:    ${customerPhone}`, align: 'left', font });
    }

    const rawAddress =
      order.deliveryAddress?.formattedAddress ||
      order.deliveryAddress?.addressLine1 ||
      (typeof order.deliveryAddress === 'string' ? order.deliveryAddress : null);

    const isPickupOrder = isCustomTakeaway || fulfillmentType.includes('PICKUP') || fulfillmentType.includes('COLLECT') || fulfillmentType.includes('TAKEAWAY');

    if (rawAddress && !isDineIn && !isPickupOrder && !rawAddress.toLowerCase().includes('pickup')) {
      commands.push({ type: 'text', value: `Address:  ${rawAddress}`, bold: true, align: 'left', font });
      if (order.deliveryAddress?.postalCode || order.deliveryAddress?.postcode) {
        const pc = (order.deliveryAddress?.postalCode || order.deliveryAddress?.postcode).toUpperCase();
        commands.push({ type: 'text', value: `Postcode: ${pc}`, bold: true, align: 'left', font });
      }
    }
    commands.push({ type: 'line' });
  }

  // 4. Items Table
  const items = getOrderItems(order);
  const leftColWidth = cols === 32 ? 4 : 5;
  const rightColWidth = cols === 32 ? 8 : 9;
  const midColWidth = cols - leftColWidth - rightColWidth;

  const headerRow = 'QTY'.padEnd(leftColWidth) + 'ITEM'.padEnd(midColWidth) + 'PRICE'.padStart(rightColWidth);
  commands.push({ type: 'text', value: headerRow, bold: true, align: itemsAlign, font });
  commands.push({ type: 'line' });

  for (const item of items) {
    const qtyStr = `${item.quantity || item.qty || 1}x`.padEnd(leftColWidth);
    const itemName = getItemName(item);
    const itemTotalStr = formatMoney(getItemPrice(item)).padStart(rightColWidth);

    if (itemName.length <= midColWidth) {
      const line = qtyStr + itemName.padEnd(midColWidth) + itemTotalStr;
      commands.push({ type: 'text', value: line, bold: layout.boldElements.itemNames, align: itemsAlign, font });
    } else {
      const firstLine = qtyStr + itemName.substring(0, midColWidth) + itemTotalStr;
      commands.push({ type: 'text', value: firstLine, bold: layout.boldElements.itemNames, align: itemsAlign, font });
      const remainingName = itemName.substring(midColWidth).trim();
      if (remainingName) {
        commands.push({ type: 'text', value: ' '.repeat(leftColWidth) + remainingName, bold: layout.boldElements.itemNames, align: itemsAlign, font });
      }
    }

    // Modifiers & Add-ons
    if (content.showItemNotes) {
      if (item.customization?.size) {
        commands.push({ type: 'text', value: `   * Size: ${item.customization.size}`, align: 'left', font });
      }
      if (Array.isArray(item.customization?.addOns) && item.customization.addOns.length > 0) {
        commands.push({ type: 'text', value: `   + ${item.customization.addOns.join(', ')}`, align: 'left', font });
      }
    }
  }

  commands.push({ type: 'line' });

  // 5. Pricing & Totals
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
    commands.push({ type: 'text', value: formatSummaryRow('Subtotal:', formatMoney(subtotal)), align: totalsAlign, font });
  }
  if (deliveryFee > 0) {
    commands.push({ type: 'text', value: formatSummaryRow('Delivery Fee:', formatMoney(deliveryFee)), align: totalsAlign, font });
  }
  if (onlinePaymentFee > 0) {
    commands.push({ type: 'text', value: formatSummaryRow('Online Payment Fee:', formatMoney(onlinePaymentFee)), align: totalsAlign, font });
  }
  if (handlingCharge > 0) {
    commands.push({ type: 'text', value: formatSummaryRow('Handling Charge:', formatMoney(handlingCharge)), align: totalsAlign, font });
  }
  if (platformFee > 0) {
    commands.push({ type: 'text', value: formatSummaryRow('Platform Fee:', formatMoney(platformFee)), align: totalsAlign, font });
  }
  if (tax > 0 || content.showItemTaxBreakdown) {
    const taxRate = content.taxPercentage || 20;
    const taxLabel = content.showItemTaxBreakdown ? `Tax / VAT (${taxRate}%):` : 'Tax / VAT:';
    commands.push({ type: 'text', value: formatSummaryRow(taxLabel, formatMoney(tax || (subtotal * (taxRate / 100)))), align: totalsAlign, font });
  }
  if (tip > 0) {
    commands.push({ type: 'text', value: formatSummaryRow('Driver Tip:', formatMoney(tip)), align: totalsAlign, font });
  }
  if (content.showDiscountLine && discount > 0) {
    commands.push({ type: 'text', value: formatSummaryRow('Discount:', `-${formatMoney(discount)}`), align: totalsAlign, font });
  }

  commands.push({ type: 'line' });
  commands.push({
    type: 'text',
    value: formatSummaryRow('TOTAL:', formatMoney(total)),
    bold: layout.boldElements.totalAmount,
    align: totalsAlign,
    size: layout.fontSize === 'small' ? 'normal' : 'double',
    font,
  });
  commands.push({ type: 'line' });

  // 6. Payment Information
  if (content.showPaymentMethod) {
    const pType = (order.paymentType || '').toLowerCase();
    const paymentText = pType === 'cash' ? 'PAYMENT: CASH (COLLECT ON DELIVERY)' : 'PAYMENT: ONLINE (PAID)';
    commands.push({ type: 'text', value: paymentText, bold: true, align: 'center', font });
  }

  // 7. Order Notes / Special Instructions
  const customDisplayNotes = getSanitizedOrderNotes(order.notes);
  if (customDisplayNotes) {
    commands.push({ type: 'line' });
    commands.push({ type: 'text', value: `NOTE: ${customDisplayNotes}`, bold: true, align: 'left', font });
  }

  // 8. Footer Message & QR Code
  commands.push({ type: 'feed', lines: 1 });

  if (content.footerMessage && content.footerMessage.trim()) {
    commands.push({
      type: 'text',
      value: content.footerMessage.trim(),
      bold: true,
      italic: layout.italicElements.footerMessage,
      align: footerAlign,
      font,
    });
  }

  if (content.showQrCode && content.qrCodeData && content.qrCodeData.trim()) {
    commands.push({ type: 'feed', lines: 1 });
    commands.push({ type: 'qr', data: content.qrCodeData.trim(), label: content.qrCodeLabel });
    if (content.qrCodeLabel) {
      commands.push({ type: 'text', value: content.qrCodeLabel, align: 'center', font });
    }
  }

  commands.push({ type: 'feed', lines: 3 });

  if (config?.autoCut !== false) {
    commands.push({ type: 'cut', mode: 'partial' });
  }

  const pType = (order.paymentType || '').toLowerCase();
  if (config?.openCashDrawer && (pType === 'cash' || order.status === 'placed')) {
    commands.push({ type: 'drawer', pin: 1 });
  }

  return commands;
}


import { Order } from '../../types';
import { PosPrinterConfig } from '../pos-config.service';
import {
  ReceiptTemplate,
  DEFAULT_RECEIPT_TEMPLATE,
  getCachedStoreProfile,
  formatRestaurantAddress,
  isDummyCustomerPhone,
  getItemOptionsList,
} from '../receipt-customization.service';

/**
 * Text sizes:
 *  - normal: 1×1
 *  - tall:   1× wide, 2× high (keeps the column count — safe for tables)
 *  - double: 2× wide, 2× high (half the characters per line)
 *  - small:  condensed Font B
 */
export type ReceiptTextSize = 'normal' | 'double' | 'small' | 'tall';

export type ReceiptCommand =
  | {
      type: 'text';
      value: string;
      bold?: boolean;
      italic?: boolean;
      align?: 'left' | 'center' | 'right';
      size?: ReceiptTextSize;
      font?: 'fontA' | 'fontB';
    }
  | { type: 'image'; data: string; align?: 'left' | 'center' | 'right' }
  | { type: 'line'; char?: string; font?: 'fontA' | 'fontB' }
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

// ─────────────────────────────────────────────────────────────────────────────
// Shared order helpers — used by EVERY renderer (ESC/POS, ePOS XML, HTML, Sunmi,
// on-screen preview) so all printers show the same content.
// ─────────────────────────────────────────────────────────────────────────────

/** Matches "table 5", "Table No. 12", "table #3" — but not words like "tablespoon" or "comfortable". */
const TABLE_IN_NOTES_RE = /\btable\s*(?:no\.?|number|#)?\s*([0-9]+[a-z]?)\b/i;

export function isDineInOrder(order: any): boolean {
  if (!order) return false;
  const rawType = String(order.orderType || order.deliveryType || '').toUpperCase();
  if (/DINE|EAT[\s_-]?IN/.test(rawType)) return true;
  if (order.tableNumber !== undefined && order.tableNumber !== null && String(order.tableNumber).trim() !== '') return true;
  return typeof order.notes === 'string' && TABLE_IN_NOTES_RE.test(order.notes);
}

/** Table number as a string ('' when none). Safe for numeric backend values. */
export function getTableNumber(order: any): string {
  if (!order) return '';
  if (order.tableNumber !== undefined && order.tableNumber !== null && String(order.tableNumber).trim() !== '') {
    return String(order.tableNumber).trim();
  }
  if (typeof order.notes === 'string') {
    const m = order.notes.match(TABLE_IN_NOTES_RE);
    if (m) return m[1];
  }
  return '';
}

export function isTakeawayOrder(order: any): boolean {
  if (!order) return false;
  const rawType = String(order.orderType || order.deliveryType || '').toUpperCase();
  const notes = typeof order.notes === 'string' ? order.notes.toLowerCase() : '';
  const custName = String(order.customerDetails?.name || order.customerId?.fullName || '').toLowerCase();
  return (
    rawType.includes('TAKEAWAY') ||
    /\btakeaway\b/.test(notes) ||
    custName.includes('takeaway') ||
    Boolean(order.appName && String(order.appName).toLowerCase().includes('takeaway'))
  );
}

export function getOrderFulfillmentLabel(order: any): string {
  if (!order) return 'DELIVERY';
  if (isDineInOrder(order)) {
    const tableNum = getTableNumber(order);
    return tableNum ? `DINE-IN (TABLE ${tableNum.toUpperCase()})` : 'DINE-IN';
  }
  if (isTakeawayOrder(order)) return 'TAKEAWAY';
  const rawType = String(order.orderType || order.deliveryType || (order.deliveryAddress ? 'delivery' : 'pickup')).toUpperCase();
  if (rawType.includes('PICKUP') || rawType.includes('COLLECT')) return 'PICKUP';
  if (rawType.includes('DELIV')) return 'DELIVERY';
  return rawType.replace(/_/g, ' ') || 'DELIVERY';
}

export function isDeliveryOrder(order: any): boolean {
  return getOrderFulfillmentLabel(order) === 'DELIVERY';
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

export function formatMoney(amount?: number): string {
  const n = Number(amount);
  if (amount === undefined || amount === null || isNaN(n)) return '£0.00';
  return n < 0 ? `-£${Math.abs(n).toFixed(2)}` : `£${n.toFixed(2)}`;
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

export function getItemName(item: any): string {
  if (!item) return 'Item';
  return String(
    item.name ||
      item.itemName ||
      item.title ||
      item.dishName ||
      item.productName ||
      (typeof item.menuItemId === 'object' ? item.menuItemId?.name || item.menuItemId?.itemName : undefined) ||
      (typeof item.itemId === 'object' ? item.itemId?.name || item.itemId?.itemName : undefined) ||
      (typeof item.menuItem === 'object' ? item.menuItem?.name || item.menuItem?.itemName : undefined) ||
      'Item'
  );
}

export function getItemQuantity(item: any): number {
  return Number(item?.quantity || item?.qty || 1);
}

export function getItemInstructions(item: any): string {
  return String(item?.instructions || item?.specialInstructions || item?.note || '').trim();
}

export function getOrderItems(order: any): any[] {
  if (Array.isArray(order?.orderedItems) && order.orderedItems.length > 0) return order.orderedItems;
  if (Array.isArray(order?.items) && order.items.length > 0) return order.items;
  return [];
}

/** "#123" — strips the internal "ORD-ID-" prefix and makes sure there is exactly one leading '#'. */
export function getDisplayOrderNumber(order: any): string {
  const raw = String(order?.orderNumber || (order?._id ? String(order._id).slice(-5).toUpperCase() : '00000'))
    .replace(/^ORD-ID-/i, '')
    .replace(/^#+/, '');
  return `#${raw}`;
}

export function getRestaurantName(order: any): string {
  return (
    (typeof order?.restaurantId === 'object' ? order.restaurantId?.restaurantName : '') ||
    order?.restaurantName ||
    order?.restaurantTitle ||
    (typeof order?.restaurant === 'object' ? order.restaurant?.restaurantName || order.restaurant?.name : '') ||
    getCachedStoreProfile()?.restaurantName ||
    'Restaurant'
  );
}

export function getRestaurantPhone(order: any): string {
  return (
    (typeof order?.restaurantId === 'object' ? order.restaurantId?.phoneNumber : '') ||
    order?.restaurantPhone ||
    getCachedStoreProfile()?.phoneNumber ||
    ''
  );
}

export function getRestaurantAddressLine(order: any): string {
  const raw =
    (typeof order?.restaurantId === 'object' ? order.restaurantId?.formattedAddress || order.restaurantId?.address : '') ||
    order?.restaurantAddress ||
    (typeof order?.restaurant === 'object' ? order.restaurant?.formattedAddress || order.restaurant?.address : '') ||
    getCachedStoreProfile()?.address;
  return formatRestaurantAddress(raw);
}

export function getCustomerName(order: any): string {
  return String(
    order?.customerDetails?.name || order?.customerId?.fullName || order?.userId?.fullName || order?.customerName || 'Customer'
  );
}

export function getCustomerPhone(order: any): string {
  return String(
    order?.customerDetails?.phoneNumber ||
      order?.customerId?.phoneNumber ||
      order?.userId?.phoneNumber ||
      order?.deliveryAddress?.phoneNumber ||
      ''
  );
}

/** Delivery address lines — empty for dine-in, pickup and takeaway orders. */
export function getDeliveryAddress(order: any): { address: string; postcode: string } {
  if (!isDeliveryOrder(order)) return { address: '', postcode: '' };
  const address = String(
    order?.deliveryAddress?.formattedAddress ||
      order?.deliveryAddress?.fullAddress ||
      order?.deliveryAddress?.addressLine1 ||
      (typeof order?.deliveryAddress === 'string' ? order.deliveryAddress : '') ||
      ''
  ).trim();
  const pcRaw = order?.deliveryAddress?.postalCode || order?.deliveryAddress?.postcode || '';
  const postcode = String(pcRaw).toUpperCase().trim();
  // Don't print the postcode twice when it is already part of the address line
  const showPostcode = postcode && !address.toUpperCase().replace(/\s/g, '').includes(postcode.replace(/\s/g, ''));
  return { address, postcode: showPostcode ? postcode : '' };
}

export interface PaymentInfo {
  isCash: boolean;
  isPaid: boolean;
  method: string;
  /** Printable one-line summary, e.g. "PAID - CARD" or "CASH DUE - COLLECT ON DELIVERY" */
  label: string;
}

const PAID_STATUSES = ['paid', 'completed', 'complete', 'succeeded', 'success', 'captured'];

export function getPaymentInfo(order: any): PaymentInfo {
  const pType = String(order?.paymentType || order?.paymentMethod || '').toLowerCase();
  const status = String(order?.paymentStatus || '').toLowerCase();
  const isCash = pType.includes('cash') || pType === 'cod';
  // No status: online payments are taken up-front, cash is collected later
  const isPaid = status ? PAID_STATUSES.includes(status) : !isCash && Boolean(pType);

  let method = 'CARD';
  if (isCash) method = 'CASH';
  else if (/online|stripe|wallet|apple|google|paypal/.test(pType)) method = 'ONLINE';
  else if (/card|visa|master|amex|debit|credit/.test(pType)) method = 'CARD';
  else if (pType) method = pType.toUpperCase();

  let label: string;
  if (isPaid) {
    label = `PAID - ${method}`;
  } else if (isCash) {
    label = isDeliveryOrder(order) ? 'CASH DUE - COLLECT ON DELIVERY' : 'CASH DUE - PAY AT COUNTER';
  } else {
    label = `PAYMENT DUE - ${method}`;
  }
  return { isCash, isPaid, method, label };
}

export interface ReceiptTotals {
  subtotal: number;
  deliveryFee: number;
  onlinePaymentFee: number;
  handlingCharge: number;
  platformFee: number;
  tax: number;
  tip: number;
  discount: number;
  total: number;
  /** Informational VAT line ("Incl. VAT (20%)") — already contained in the total, never added to it. */
  includedVat?: { label: string; amount: number };
}

export function computeReceiptTotals(order: any, content?: Partial<ReceiptTemplate['content']>): ReceiptTotals {
  const p = order?.pricing || {};
  const num = (...vals: any[]) => {
    for (const v of vals) {
      if (v !== undefined && v !== null && !isNaN(Number(v))) return Number(v);
    }
    return 0;
  };
  const itemsSum = getOrderItems(order).reduce((sum, it) => sum + getItemPrice(it), 0);

  const deliveryFee = num(p.deliveryFee, order?.deliveryFee);
  const onlinePaymentFee = num(p.onlinePaymentFee, order?.onlinePaymentFee, p.cardFee, p.paymentFee);
  const handlingCharge = num(p.handlingCharge, order?.handlingCharge);
  const platformFee = num(p.platformFee, order?.platformFee, p.serviceFee, order?.serviceFee);
  const tax = num(p.tax, p.vat, order?.tax, order?.vat);
  const tip = num(p.tip, order?.tip);
  const discount = Math.abs(num(p.discount, p.discountAmount, order?.discountAmount));
  // Subtotal falls back to the sum of the items — NOT the order total (which includes fees)
  const subtotal = num(p.subtotal, order?.subtotal, itemsSum > 0 ? itemsSum : undefined);
  const total = num(
    p.total,
    p.totalAmount,
    order?.totalAmount,
    order?.totalPrice,
    subtotal + deliveryFee + onlinePaymentFee + handlingCharge + platformFee + tax + tip - discount
  );

  const totals: ReceiptTotals = { subtotal, deliveryFee, onlinePaymentFee, handlingCharge, platformFee, tax, tip, discount, total };

  const rate = content?.taxPercentage ?? 20;
  if (content?.showItemTaxBreakdown && tax <= 0 && rate > 0 && total > 0) {
    // UK VAT is price-inclusive: VAT = gross × r / (100 + r)
    totals.includedVat = { label: `Incl. VAT (${rate}%)`, amount: Number(((total * rate) / (100 + rate)).toFixed(2)) };
  }
  return totals;
}

/**
 * Word-wraps text so each line does not exceed maxWidth characters.
 * Words longer than a line are hard-split so nothing ever overflows.
 */
export function wrapText(text: string, maxWidth: number): string[] {
  if (!text) return [];
  const width = Math.max(1, maxWidth);
  const out: string[] = [];
  for (const rawLine of String(text).split('\n')) {
    if (rawLine.length <= width) {
      out.push(rawLine);
      continue;
    }
    let current = '';
    for (const word of rawLine.split(' ')) {
      let w = word;
      while (w.length > width) {
        if (current) {
          out.push(current);
          current = '';
        }
        out.push(w.slice(0, width));
        w = w.slice(width);
      }
      if (!current) current = w;
      else if ((current + ' ' + w).length <= width) current += ' ' + w;
      else {
        out.push(current);
        current = w;
      }
    }
    if (current) out.push(current);
  }
  return out;
}

/** Characters per line for a paper width / font combination. */
export function getLineWidth(paperWidth: '58mm' | '80mm' | undefined, font: 'fontA' | 'fontB' = 'fontA'): number {
  const is58 = paperWidth !== '80mm';
  if (font === 'fontB') return is58 ? 42 : 64;
  return is58 ? 32 : 48;
}

function formatReceiptDate(date: Date, format: ReceiptTemplate['content']['dateTimeFormat']): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  if (format === 'time_only') return time;
  if (format === 'short') return `${pad(date.getDate())}/${pad(date.getMonth() + 1)} ${time}`;
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${time}`;
}

/**
 * Protocol-neutral receipt document using the built-in Standard template.
 * (Kept for backward compatibility — there is now ONE receipt builder.)
 */
export function buildReceiptDocument(order: Partial<Order> & any, config?: Partial<PosPrinterConfig>): ReceiptCommand[] {
  return buildCustomizedReceiptDocument(order, config, DEFAULT_RECEIPT_TEMPLATE);
}

/**
 * Protocol-neutral document to pulse the cash drawer kick without an order
 */
export function buildDrawerKickDocument(pin: 1 | 2 = 1): ReceiptCommand[] {
  return [{ type: 'drawer', pin }];
}

/**
 * Builds the receipt document from the restaurant's template.
 * Paper width comes from the PRINTER config (the hardware); the template only decides content & style.
 */
export function buildCustomizedReceiptDocument(
  order: Partial<Order> & any,
  config?: Partial<PosPrinterConfig>,
  template?: ReceiptTemplate
): ReceiptCommand[] {
  const tpl = template || DEFAULT_RECEIPT_TEMPLATE;
  const commands: ReceiptCommand[] = [];
  const layout = tpl.layout;
  const content = tpl.content;

  const paperWidth: '58mm' | '80mm' = config?.paperWidth || layout.paperWidth || '80mm';
  // "Small" text uses the printer's condensed Font B, which fits more characters per line
  const font: 'fontA' | 'fontB' = layout.fontFamily === 'fontB' || layout.fontSize === 'small' ? 'fontB' : 'fontA';
  const cols = getLineWidth(paperWidth, font);
  const isLarge = layout.fontSize === 'large';
  const bodyEmphasis: 'tall' | 'normal' = isLarge ? 'tall' : 'normal';
  const headerAlign = layout.alignment.header;
  const footerAlign = layout.alignment.footer;
  const line = (char?: string): ReceiptCommand => ({ type: 'line', char, font });
  const text = (value: string, opts: Omit<Extract<ReceiptCommand, { type: 'text' }>, 'type' | 'value'> = {}) =>
    commands.push({ type: 'text', value, font, ...opts });

  // 0. Line spacing
  commands.push({ type: 'spacing', mode: layout.lineSpacing });

  const restaurantName = getRestaurantName(order);
  const restaurantPhone = getRestaurantPhone(order);
  const restaurantAddress = getRestaurantAddressLine(order);
  const customerName = getCustomerName(order);
  const customerPhone = getCustomerPhone(order);
  const isDineIn = isDineInOrder(order);
  const tableNum = getTableNumber(order);
  const fulfillmentLabel = getOrderFulfillmentLabel(order);
  const payment = getPaymentInfo(order);

  // 1. Header
  if (content.showLogo && content.logoUrl && content.logoUrl.startsWith('data:image/')) {
    commands.push({ type: 'image', data: content.logoUrl, align: headerAlign });
  }

  if (content.customHeaderTitle && content.customHeaderTitle.trim()) {
    for (const l of wrapText(content.customHeaderTitle.trim().toUpperCase(), cols)) {
      text(l, { bold: true, align: headerAlign });
    }
  }

  if (content.showRestaurantName) {
    const name = restaurantName.toUpperCase();
    const fitsDouble = name.length <= Math.floor(cols / 2);
    if (isLarge && fitsDouble) {
      text(name, { bold: layout.boldElements.restaurantName, align: headerAlign, size: 'double' });
    } else {
      for (const l of wrapText(name, cols)) {
        text(l, { bold: layout.boldElements.restaurantName, align: headerAlign, size: bodyEmphasis });
      }
    }
  }

  if (content.headerMessage && content.headerMessage.trim()) {
    for (const l of wrapText(content.headerMessage.trim(), cols)) {
      text(l, { italic: layout.italicElements.tagline, align: headerAlign });
    }
  }

  if (content.showAddress && restaurantAddress) {
    for (const l of wrapText(restaurantAddress, cols)) text(l, { align: headerAlign });
  }

  if (content.showPhone && restaurantPhone) {
    text(`Tel: ${restaurantPhone}`, { align: headerAlign });
  }

  if (content.showTaxId && content.taxIdValue && content.taxIdValue.trim()) {
    const label = content.taxIdLabel || 'VAT Reg No:';
    for (const l of wrapText(`${label} ${content.taxIdValue.trim()}`, cols)) text(l, { align: headerAlign });
  }

  commands.push(line());

  // 2. Order metadata
  if (content.showOrderNumber) {
    const orderLine = `ORDER ${getDisplayOrderNumber(order)}`;
    text(orderLine, {
      bold: layout.boldElements.orderNumber,
      align: headerAlign,
      size: orderLine.length <= Math.floor(cols / 2) ? 'double' : 'tall',
    });
  }

  if (content.showDateTime) {
    const placed = order.createdAt ? new Date(order.createdAt) : new Date();
    text(`Placed: ${formatReceiptDate(isNaN(placed.getTime()) ? new Date() : placed, content.dateTimeFormat)}`, { align: headerAlign });
  }

  // Fulfilment badge (table number is printed on its own line when that element is enabled)
  const badge = isDineIn && content.showTableNumber && tableNum ? 'DINE-IN' : fulfillmentLabel;
  text(`[ ${badge} ]`, { bold: true, align: 'center' });

  const scheduleInfo = getOrderScheduleInfo(order);
  if (content.showScheduledTime !== false && scheduleInfo.isScheduled && scheduleInfo.scheduleTimeText) {
    commands.push(line('='));
    text(`*** SCHEDULED ${fulfillmentLabel} ***`, { bold: true, align: 'center' });
    for (const l of wrapText(`TARGET: ${scheduleInfo.scheduleTimeText.toUpperCase()}`, cols)) {
      text(l, { bold: true, align: 'center' });
    }
    commands.push(line('='));
  } else {
    commands.push(line());
  }

  let printedMetaBlock = false;
  if (content.showTableNumber && tableNum) {
    text(`TABLE: ${tableNum.toUpperCase()}`, { bold: true, align: 'center', size: bodyEmphasis });
    printedMetaBlock = true;
  }

  const waiter = order.waiterName || content.serverWaiterName;
  if (content.showServerWaiterName && waiter && String(waiter).trim()) {
    text(`Server: ${String(waiter).trim()}`, { align: 'center' });
    printedMetaBlock = true;
  }
  if (printedMetaBlock) commands.push(line());

  // 3. Customer & delivery address
  if (content.showCustomerInfo) {
    for (const l of wrapText(`Customer: ${customerName}`, cols)) {
      text(l, { bold: layout.boldElements.customerDetails, align: 'left' });
    }
    if (customerPhone && !isDummyCustomerPhone(customerPhone, restaurantPhone)) {
      text(`Phone:    ${customerPhone}`, { align: 'left' });
    }
    const { address, postcode } = getDeliveryAddress(order);
    if (address && !address.toLowerCase().includes('pickup')) {
      for (const l of wrapText(`Address:  ${address}`, cols)) text(l, { bold: true, align: 'left' });
      if (postcode) text(`Postcode: ${postcode}`, { bold: true, align: 'left' });
    }
    commands.push(line());
  }

  // 4. Items table — fixed columns so prices always line up on the right
  const qtyW = cols <= 32 ? 4 : 5;
  const priceW = 9; // "£1234.56" + one space gap from the item name
  const nameW = cols - qtyW - priceW;
  text('QTY'.padEnd(qtyW) + 'ITEM'.padEnd(nameW) + 'PRICE'.padStart(priceW), { bold: true, align: 'left' });
  commands.push(line());

  for (const item of getOrderItems(order)) {
    const qtyStr = `${getItemQuantity(item)}x`.padEnd(qtyW);
    const priceStr = formatMoney(getItemPrice(item)).padStart(priceW);
    const nameLines = wrapText(getItemName(item), nameW);
    nameLines.forEach((nl, i) => {
      const row = i === 0 ? qtyStr + nl.padEnd(nameW) + priceStr : ' '.repeat(qtyW) + nl;
      text(row, { bold: layout.boldElements.itemNames, align: 'left', size: bodyEmphasis });
    });

    // Variants / add-ons always print (they change what the kitchen makes)
    const indent = ' '.repeat(qtyW);
    for (const opt of getItemOptionsList(item)) {
      for (const l of wrapText(`+ ${opt}`, cols - qtyW)) text(indent + l, { align: 'left' });
    }
    const instructions = getItemInstructions(item);
    if (content.showItemNotes && instructions) {
      for (const l of wrapText(`* Note: ${instructions}`, cols - qtyW)) text(indent + l, { align: 'left' });
    }
  }

  commands.push(line());

  // 5. Totals
  const totals = computeReceiptTotals(order, content);
  const summaryRow = (label: string, value: string, width: number = cols): string[] => {
    if (label.length + value.length + 1 > width) {
      return [label, value.padStart(width)];
    }
    return [label + ' '.repeat(width - label.length - value.length) + value];
  };
  const pushRow = (label: string, value: string) => {
    for (const r of summaryRow(label, value)) text(r, { align: 'left' });
  };

  if (totals.subtotal > 0) pushRow('Subtotal:', formatMoney(totals.subtotal));
  if (totals.deliveryFee > 0) pushRow('Delivery Fee:', formatMoney(totals.deliveryFee));
  if (totals.onlinePaymentFee > 0) pushRow('Card / Online Fee:', formatMoney(totals.onlinePaymentFee));
  if (totals.handlingCharge > 0) pushRow('Handling Charge:', formatMoney(totals.handlingCharge));
  if (totals.platformFee > 0) pushRow('Service Fee:', formatMoney(totals.platformFee));
  if (totals.tax > 0) {
    const rate = content.taxPercentage ?? 20;
    pushRow(content.showItemTaxBreakdown && rate > 0 ? `Tax / VAT (${rate}%):` : 'Tax / VAT:', formatMoney(totals.tax));
  }
  if (totals.tip > 0) pushRow('Tip:', formatMoney(totals.tip));
  if (content.showDiscountLine && totals.discount > 0) pushRow('Discount:', formatMoney(-totals.discount));

  commands.push(line());
  const totalValue = formatMoney(totals.total);
  const half = Math.floor(cols / 2);
  const useDoubleTotal = layout.fontSize !== 'small' && 'TOTAL:'.length + totalValue.length + 1 <= half;
  for (const r of summaryRow('TOTAL:', totalValue, useDoubleTotal ? half : cols)) {
    text(r, { bold: layout.boldElements.totalAmount, align: 'left', size: useDoubleTotal ? 'double' : 'tall' });
  }
  if (totals.includedVat) pushRow(totals.includedVat.label, formatMoney(totals.includedVat.amount));
  commands.push(line());

  // 6. Payment
  if (content.showPaymentMethod) {
    for (const l of wrapText(`PAYMENT: ${payment.label}`, cols)) text(l, { bold: true, align: 'center' });
  }

  // 7. Order notes
  const displayNotes = getSanitizedOrderNotes(order.notes || order.specialInstructions);
  if (displayNotes) {
    commands.push(line());
    for (const l of wrapText(`NOTE: ${displayNotes}`, cols)) text(l, { bold: true, align: 'left' });
  }

  // 8. Footer & QR code
  if (content.footerMessage && content.footerMessage.trim()) {
    commands.push({ type: 'feed', lines: 1 });
    for (const l of wrapText(content.footerMessage.trim(), cols)) {
      text(l, { bold: true, italic: layout.italicElements.footerMessage, align: footerAlign });
    }
  }

  if (content.showQrCode && content.qrCodeData && content.qrCodeData.trim()) {
    commands.push({ type: 'feed', lines: 1 });
    commands.push({ type: 'qr', data: content.qrCodeData.trim(), label: content.qrCodeLabel });
    if (content.qrCodeLabel && content.qrCodeLabel.trim()) {
      for (const l of wrapText(content.qrCodeLabel.trim(), cols)) text(l, { align: 'center' });
    }
  }

  commands.push({ type: 'feed', lines: 3 });

  if (config?.autoCut !== false) {
    commands.push({ type: 'cut', mode: 'partial' });
  }

  // Cash drawer only opens for cash orders (not for every new order)
  if (config?.openCashDrawer && payment.isCash) {
    commands.push({ type: 'drawer', pin: 1 });
  }

  return commands;
}

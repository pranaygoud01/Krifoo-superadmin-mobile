import { Order } from '../../types';
import { PosPrinterConfig } from '../pos-config.service';

/**
 * Format currency with symbol (£ for UK)
 */
function formatMoney(amount?: number): string {
  if (amount === undefined || amount === null || isNaN(amount)) return '£0.00';
  return `£${Number(amount).toFixed(2)}`;
}

/**
 * Format order date into UK style strings
 */
function formatOrderDate(dateString?: string): { placedAt: string; targetTime: string } {
  const now = dateString ? new Date(dateString) : new Date();

  const options: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  };
  const placedAt = now.toLocaleDateString('en-GB', options);

  const targetDate = new Date(now.getTime() + 35 * 60000);
  const hours = String(targetDate.getHours()).padStart(2, '0');
  const minutes = String(targetDate.getMinutes()).padStart(2, '0');
  const targetTime = `Today by ${hours}:${minutes}`;

  return { placedAt, targetTime };
}

/**
 * Universal ESC/POS Binary Command Builder
 * Formats restaurant receipts for Epson, Star, RetailZ, Munbyn, Xprinter, Citizen, etc.
 */
export class EscPosBuilder {
  private buffer: number[] = [];
  private cols: number;

  constructor(paperWidth: '80mm' | '58mm' = '80mm') {
    this.cols = paperWidth === '58mm' ? 32 : 48;
    this.init();
  }

  /**
   * Initialize printer & select Character Code Page CP858 (Supports £ symbol)
   */
  public init(): this {
    // ESC @ (Initialize)
    this.buffer.push(0x1b, 0x40);
    // ESC t 19 (Select character code table: CP858 Euro/Pound)
    this.buffer.push(0x1b, 0x74, 19);
    return this;
  }

  public alignLeft(): this {
    this.buffer.push(0x1b, 0x61, 0);
    return this;
  }

  public alignCenter(): this {
    this.buffer.push(0x1b, 0x61, 1);
    return this;
  }

  public alignRight(): this {
    this.buffer.push(0x1b, 0x61, 2);
    return this;
  }

  public bold(enable: boolean): this {
    this.buffer.push(0x1b, 0x45, enable ? 1 : 0);
    return this;
  }

  public setSize(widthMulti: number = 1, heightMulti: number = 1): this {
    // GS ! n (Character size: (width - 1) * 16 + (height - 1))
    const w = Math.min(Math.max(widthMulti - 1, 0), 7);
    const h = Math.min(Math.max(heightMulti - 1, 0), 7);
    this.buffer.push(0x1d, 0x21, (w << 4) | h);
    return this;
  }

  /**
   * Convert text into bytes handling UK Pound £ (0x9C in CP858/CP437)
   */
  public text(str: string): this {
    for (let i = 0; i < str.length; i++) {
      const char = str[i];
      if (char === '£') {
        this.buffer.push(0x9c); // CP858 / CP437 Pound Symbol
      } else if (char === '€') {
        this.buffer.push(0xd5); // CP858 Euro Symbol
      } else {
        const code = str.charCodeAt(i);
        if (code < 128) {
          this.buffer.push(code);
        } else {
          this.buffer.push(0x3f); // '?' for unmapped unicode
        }
      }
    }
    return this;
  }

  public line(str: string = ''): this {
    this.text(str);
    this.buffer.push(0x0a); // LF
    return this;
  }

  public lineFeed(lines: number = 1): this {
    for (let i = 0; i < lines; i++) {
      this.buffer.push(0x0a);
    }
    return this;
  }

  public divider(char: string = '-'): this {
    const div = char.repeat(this.cols);
    this.line(div);
    return this;
  }

  public doubleDivider(): this {
    return this.divider('=');
  }

  /**
   * Print 2-column key-value row (e.g. Subtotal £20.00)
   */
  public twoColumn(left: string, right: string): this {
    const leftLen = left.length;
    const rightLen = right.length;
    const spaces = Math.max(1, this.cols - leftLen - rightLen);
    this.line(left + ' '.repeat(spaces) + right);
    return this;
  }

  /**
   * Print 3-column table row (QTY, ITEM, PRICE)
   */
  public threeColumn(qty: string, item: string, price: string): this {
    if (this.cols === 32) {
      // 58mm: QTY (4), ITEM (20), PRICE (8)
      const q = qty.padEnd(4);
      const p = price.padStart(8);
      const maxItemLen = 20;
      const itemName = item.length > maxItemLen ? item.substring(0, maxItemLen) : item.padEnd(maxItemLen);
      this.line(`${q}${itemName}${p}`);
    } else {
      // 80mm: QTY (6), ITEM (32), PRICE (10)
      const q = qty.padEnd(6);
      const p = price.padStart(10);
      const maxItemLen = 32;
      const itemName = item.length > maxItemLen ? item.substring(0, maxItemLen) : item.padEnd(maxItemLen);
      this.line(`${q}${itemName}${p}`);
    }
    return this;
  }

  /**
   * Automatic Paper Cut
   */
  public cut(fullCut: boolean = false): this {
    this.lineFeed(4);
    // GS V m (0 = Full cut, 1 = Partial cut, 66 = Feed & partial cut)
    this.buffer.push(0x1d, 0x56, fullCut ? 0 : 66, 0);
    return this;
  }

  /**
   * Kick open cash drawer (ESC p m t1 t2)
   */
  public cashDrawer(): this {
    this.buffer.push(0x1b, 0x70, 0, 25, 250);
    return this;
  }

  public toByteArray(): Uint8Array {
    return new Uint8Array(this.buffer);
  }

  public toBase64(): string {
    const uint8 = this.toByteArray();
    let binary = '';
    for (let i = 0; i < uint8.length; i++) {
      binary += String.fromCharCode(uint8[i]);
    }
    return btoa(binary);
  }
}

/**
 * Build complete ESC/POS binary payload for an order
 */
export function buildEscPosReceipt(order: Partial<Order> & any, config: PosPrinterConfig): Uint8Array {
  const builder = new EscPosBuilder(config.paperWidth);

  // Restaurant details
  const restaurantName =
    typeof order.restaurantId === 'object'
      ? order.restaurantId?.restaurantName || 'KRIFOO RESTAURANT'
      : 'KRIFOO RESTAURANT';

  const restaurantPhone =
    typeof order.restaurantId === 'object'
      ? order.restaurantId?.phoneNumber || ''
      : '';

  // Customer details
  const customerName =
    order.customerDetails?.name ||
    order.customerId?.fullName ||
    order.userId?.fullName ||
    order.userId?.name ||
    order.customerName ||
    'Customer';

  const customerPhone =
    order.customerDetails?.phoneNumber ||
    order.customerId?.phoneNumber ||
    order.userId?.phoneNumber ||
    order.deliveryAddress?.phoneNumber ||
    order.phoneNumber ||
    '';

  // Delivery Address extraction
  let deliveryAddress = '';
  let deliveryPostcode = '';

  if (typeof order.deliveryAddress === 'string' && order.deliveryAddress.trim()) {
    deliveryAddress = order.deliveryAddress.trim();
  } else if (order.deliveryAddress && typeof order.deliveryAddress === 'object') {
    const addrObj = order.deliveryAddress;
    const addrParts: string[] = [];

    if (addrObj.fullAddress) {
      addrParts.push(addrObj.fullAddress);
    } else {
      if (addrObj.addressLine1) addrParts.push(addrObj.addressLine1);
      if (addrObj.addressLine2) addrParts.push(addrObj.addressLine2);
      if (addrObj.street) addrParts.push(addrObj.street);
      if (addrObj.formattedAddress) addrParts.push(addrObj.formattedAddress);
      if (addrObj.address) addrParts.push(addrObj.address);
    }

    if (addrObj.landmark) addrParts.push(`Landmark: ${addrObj.landmark}`);
    if (addrObj.city && !addrParts.some((p) => p.includes(addrObj.city))) {
      addrParts.push(addrObj.city);
    }

    deliveryAddress = addrParts.filter(Boolean).join(', ');
    deliveryPostcode = addrObj.postalCode || addrObj.postcode || addrObj.postCode || addrObj.zipCode || '';
  }

  const orderNum = order.orderNumber || (order._id ? `#${order._id.slice(-5).toUpperCase()}` : '#00000');
  const fulfillmentType = (order.orderType || order.deliveryType || (deliveryAddress ? 'DELIVERY' : 'COLLECTION')).toUpperCase();
  const isDelivery = fulfillmentType.includes('DELIV') || Boolean(deliveryAddress);
  const { placedAt, targetTime } = formatOrderDate(order.createdAt);

  // 1. HEADER
  builder.alignCenter();
  builder.bold(true).setSize(2, 2).line(restaurantName.toUpperCase());
  builder.setSize(1, 1).bold(false);
  if (restaurantPhone) {
    builder.line(`Tel: ${restaurantPhone}`);
  }
  builder.doubleDivider();

  // ORDER NUMBER & TYPE
  builder.bold(true).setSize(2, 2).line(`ORDER: ${orderNum}`);
  builder.setSize(1, 1).line(`[ ${fulfillmentType} ]`);
  builder.bold(false);
  builder.divider();

  // 2. TIMINGS & CUSTOMER
  builder.alignLeft();
  builder.line(`Placed: ${placedAt}  Target: ${targetTime}`);
  builder.divider();

  builder.bold(true).line('CUSTOMER:').bold(false);
  builder.line(`  Name:  ${customerName}`);
  if (customerPhone) {
    builder.line(`  Phone: ${customerPhone}`);
  }

  if (isDelivery && deliveryAddress) {
    builder.bold(true).line('DELIVERY ADDRESS:');
    builder.line(`  ${deliveryAddress}`);
    if (deliveryPostcode && !deliveryAddress.includes(deliveryPostcode)) {
      builder.line(`  POSTCODE: ${deliveryPostcode}`);
    }
    builder.bold(false);
  }

  if (order.deliveryInstructions || order.notes) {
    const note = order.deliveryInstructions || order.notes;
    builder.bold(true).line(`NOTE: ${note}`).bold(false);
  }

  builder.doubleDivider();

  // 3. ITEMS TABLE
  builder.bold(true);
  builder.threeColumn('QTY', 'ITEM', 'PRICE');
  builder.bold(false);
  builder.divider();

  const itemsList =
    (Array.isArray(order.orderedItems) && order.orderedItems.length > 0)
      ? order.orderedItems
      : (Array.isArray(order.items) && order.items.length > 0)
      ? order.items
      : [];

  itemsList.forEach((item: any) => {
    const qtyNum = Number(item.quantity || item.qty || 1);
    const qtyStr = `${qtyNum}x`;

    const name =
      item.itemName ||
      item.name ||
      item.title ||
      item.itemId?.name ||
      item.itemId?.itemName ||
      item.menuItemId?.name ||
      item.menuItemId?.itemName ||
      item.menuItem?.name ||
      item.menuItem?.itemName ||
      item.dishName ||
      item.productName ||
      'Item';

    let itemPrice = 0;
    if (item.itemTotal !== undefined && item.itemTotal !== null && !isNaN(item.itemTotal)) {
      itemPrice = Number(item.itemTotal);
    } else if (item.basePrice !== undefined && item.basePrice !== null && !isNaN(item.basePrice)) {
      itemPrice = Number(item.basePrice) * qtyNum;
    } else if (item.price !== undefined && item.price !== null && !isNaN(item.price)) {
      itemPrice = Number(item.price) * qtyNum;
    }
    const priceStr = formatMoney(itemPrice);

    builder.bold(true);
    builder.threeColumn(qtyStr, name, priceStr);
    builder.bold(false);

    // Variants & Add-ons
    const optionsList: string[] = [];
    if (Array.isArray(item.selectedVariants)) {
      item.selectedVariants.forEach((v: any) => {
        if (typeof v === 'string' && v.trim()) optionsList.push(v.trim());
        else if (v?.name) {
          const p = v.price || v.additionalPrice ? ` (+${formatMoney(v.price || v.additionalPrice)})` : '';
          optionsList.push(`${v.name}${p}`);
        }
      });
    }
    if (Array.isArray(item.selectedAddons)) {
      item.selectedAddons.forEach((a: any) => {
        if (typeof a === 'string' && a.trim()) optionsList.push(a.trim());
        else if (a?.name) {
          const p = a.price || a.additionalPrice ? ` (+${formatMoney(a.price || a.additionalPrice)})` : '';
          optionsList.push(`${a.name}${p}`);
        }
      });
    }
    if (item.customization?.size) optionsList.push(`Size: ${item.customization.size}`);
    if (Array.isArray(item.customization?.addOns)) {
      item.customization.addOns.forEach((a: string) => { if (a) optionsList.push(a); });
    }

    if (optionsList.length > 0) {
      optionsList.forEach((opt) => {
        builder.line(`    + ${opt}`);
      });
    }

    const itemNote = item.instructions || item.specialInstructions || item.note || '';
    if (itemNote) {
      builder.line(`    * Note: ${itemNote}`);
    }
  });

  builder.doubleDivider();

  // 4. TOTALS
  const subtotal = order.pricing?.subtotal !== undefined ? order.pricing.subtotal : (order.subtotal !== undefined ? order.subtotal : (order.totalAmount || 0));
  builder.twoColumn('Subtotal:', formatMoney(subtotal));

  const deliveryFee = order.pricing?.deliveryFee !== undefined ? order.pricing.deliveryFee : order.deliveryFee;
  if (deliveryFee !== undefined && deliveryFee > 0) {
    builder.twoColumn('Delivery Fee:', formatMoney(deliveryFee));
  }

  const serviceFee = order.pricing?.serviceFee !== undefined ? order.pricing.serviceFee : (order.pricing?.handlingCharge !== undefined ? order.pricing.handlingCharge : order.serviceFee);
  if (serviceFee !== undefined && serviceFee > 0) {
    builder.twoColumn('Service Fee:', formatMoney(serviceFee));
  }

  const discount = order.pricing?.discount !== undefined ? order.pricing.discount : order.discount;
  if (discount !== undefined && discount > 0) {
    builder.twoColumn('Discount:', `-${formatMoney(discount)}`);
  }

  const tip = order.pricing?.tip !== undefined ? order.pricing.tip : order.tip;
  if (tip !== undefined && tip > 0) {
    builder.twoColumn('Driver Tip:', formatMoney(tip));
  }

  builder.divider();

  // TOTAL
  const grandTotal = order.pricing?.total !== undefined ? order.pricing.total : (order.totalAmount || order.total || subtotal);
  builder.bold(true).setSize(2, 2);
  builder.twoColumn('TOTAL:', formatMoney(grandTotal));
  builder.setSize(1, 1).bold(false);
  builder.divider();

  // Payment
  const paymentMethod = (order.paymentType || order.paymentMethod || 'Online / Card').toUpperCase();
  const paymentStatus = (order.paymentStatus || 'PAID').toUpperCase();
  builder.line(`Payment: ${paymentMethod} (${paymentStatus})`);

  // 5. FOOTER
  builder.alignCenter();
  builder.line('\nThank you for ordering with Krifoo!');
  builder.line('www.krifoo.co.uk');

  // Cash drawer if enabled
  if (config.openCashDrawer && (paymentMethod.includes('CASH') || paymentStatus.includes('CASH'))) {
    builder.cashDrawer();
  }

  // Auto-cut if enabled
  if (config.autoCut) {
    builder.cut();
  } else {
    builder.lineFeed(4);
  }

  return builder.toByteArray();
}

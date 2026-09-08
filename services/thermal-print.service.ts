import * as Print from 'expo-print';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Order } from '../types';
import { isSunmiAvailable, printSunmiOrderReceipt } from './sunmi-printer.service';
import { getPosPrinterConfig, savePosPrinterConfig, PosPrinterConfig, POS_BRANDS, getBrandOption, getBrandName, profileFromConfig } from './pos-config.service';
import { printNetworkOrderReceipt, testNetworkPrinter } from './printer/network-printer.service';
import { printEpsonOrderReceipt, testEpsonPrinter, discoverEpsonPrinters } from './printer/epson-printer.service';
import { buildReceiptDocument, buildDrawerKickDocument, buildCustomizedReceiptDocument } from './printer/receipt-document';
import { resolvePrinter } from './printer/printer-registry';
import { PrintQueueService } from './printer/print-queue.service';
import { getActiveReceiptTemplate, ReceiptTemplate, getSampleOrderForPreview, getCachedStoreProfile, setCachedStoreProfile, formatRestaurantAddress } from './receipt-customization.service';

export {
  isSunmiAvailable,
  printSunmiOrderReceipt,
  getPosPrinterConfig,
  savePosPrinterConfig,
  POS_BRANDS,
  getBrandOption,
  getBrandName,
  testNetworkPrinter,
  printEpsonOrderReceipt,
  testEpsonPrinter,
  discoverEpsonPrinters,
  buildReceiptDocument,
  buildCustomizedReceiptDocument,
  buildDrawerKickDocument,
  resolvePrinter,
  PrintQueueService,
  getActiveReceiptTemplate,
  ReceiptTemplate,
};

const AUTO_PRINT_KEY = '@krifoo_auto_print_thermal';

/**
 * Check if auto-printing is enabled (defaults to true)
 */
export async function isAutoPrintEnabled(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(AUTO_PRINT_KEY);
    if (value === null) return true; // Default enabled
    return value === 'true';
  } catch (e) {
    return true;
  }
}

/**
 * Toggle auto-printing on or off
 */
export async function setAutoPrintEnabled(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(AUTO_PRINT_KEY, enabled ? 'true' : 'false');
  } catch (e) {
    console.error('[Print] Failed saving auto-print preference:', e);
  }
}

/**
 * Format currency with symbol (£ for UK)
 */
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

/**
 * Format date time into UK style string e.g. "Mar 29, 22:08" or "Today by 23:05"
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

  // Target delivery time (+35 mins)
  const targetDate = new Date(now.getTime() + 35 * 60000);
  const hours = String(targetDate.getHours()).padStart(2, '0');
  const minutes = String(targetDate.getMinutes()).padStart(2, '0');
  const targetTime = `Today by ${hours}:${minutes}`;

  return { placedAt, targetTime };
}

/**
 * Generate customized thermal receipt HTML reflecting restaurant owner's template
 */
export function generateCustomizedThermalReceiptHtml(order: Partial<Order> & any, template: ReceiptTemplate): string {
  const layout = template.layout;
  const content = template.content;
  const is58mm = layout.paperWidth === '58mm';
  const paperWidthMm = is58mm ? '58mm' : '80mm';
  const fontFamilyCss = layout.fontFamily === 'fontB' ? 'Consolas, "Courier New", monospace' : '"Courier New", Courier, monospace';
  const fontSizePx = layout.fontSize === 'small' ? '11px' : layout.fontSize === 'large' ? '14px' : '12.5px';
  const lineHeight = layout.lineSpacing === 'compact' ? '1.18' : layout.lineSpacing === 'relaxed' ? '1.55' : '1.35';

  const orderNum = order.orderNumber || (order._id ? `#${order._id.slice(-5).toUpperCase()}` : '#00000');

  const customerName = order.customerDetails?.name || order.customerId?.fullName || order.userId?.fullName || 'Customer';
  const customerPhone = order.customerDetails?.phoneNumber || order.customerId?.phoneNumber || order.userId?.phoneNumber || order.deliveryAddress?.phoneNumber || '';

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
      ? order.restaurantId?.formattedAddress || order.restaurantId?.address
      : '') ||
    order.restaurantAddress ||
    getCachedStoreProfile()?.address;
  const restaurantAddress = formatRestaurantAddress(rawRestAddr);

  const fulfillmentType = (order.orderType || order.deliveryType || 'Delivery').toUpperCase();
  const isDelivery = fulfillmentType.includes('DELIV');
  const isDineIn = fulfillmentType.includes('DINE') || fulfillmentType.includes('EAT') || Boolean(order.tableNumber);
  const tableNum = order.tableNumber || (isDineIn && order.notes?.match(/table\s*([0-9a-zA-Z]+)/i)?.[1]) || '';

  const rawAddress =
    order.deliveryAddress?.fullAddress ||
    order.deliveryAddress?.formattedAddress ||
    order.deliveryAddress?.addressLine1 ||
    (typeof order.deliveryAddress === 'string' ? order.deliveryAddress : '');
  const postalCode = order.deliveryAddress?.postalCode || order.deliveryAddress?.postcode || '';

  const { placedAt } = formatOrderDate(order.createdAt);
  const itemsList = order.orderedItems || order.items || [];
  const pricing = order.pricing || {};
  const subtotal = Number(pricing.subtotal ?? (order as any).subtotal ?? order.totalAmount ?? 0);
  const deliveryFee = Number(pricing.deliveryFee ?? (order as any).deliveryFee ?? 0);
  const onlinePaymentFee = Number(pricing.onlinePaymentFee ?? (order as any).onlinePaymentFee ?? 0);
  const handlingCharge = Number(pricing.handlingCharge ?? (order as any).handlingCharge ?? 0);
  const platformFee = Number(pricing.platformFee ?? (order as any).platformFee ?? 0);
  const tax = Number(pricing.tax ?? pricing.vat ?? (order as any).tax ?? 0);
  const tip = Number(pricing.tip ?? (order as any).tip ?? 0);
  const discount = Number(pricing.discount ?? pricing.discountAmount ?? (order as any).discountAmount ?? 0);
  const total = Number(pricing.total ?? pricing.totalAmount ?? order.totalAmount ?? (subtotal + deliveryFee + onlinePaymentFee + handlingCharge + platformFee + tax + tip - discount));

  const paymentType = order.paymentType || 'Card';
  const paymentStatus = (order.paymentStatus || 'Paid').toUpperCase();
  const isPaid = paymentStatus === 'PAID' || paymentStatus === 'COMPLETED';
  const specialNotes = order.notes || order.specialInstructions || '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Receipt ${orderNum}</title>
  <style>
    @page {
      size: ${paperWidthMm} auto;
      margin: 0mm !important;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    html, body {
      width: 100% !important;
      max-width: ${paperWidthMm} !important;
      margin: 0 auto !important;
      padding: 0 !important;
      background-color: #ffffff;
    }
    body {
      font-family: ${fontFamilyCss};
      padding: 4mm 3mm 10mm 3mm;
      color: #000000;
      font-size: ${fontSizePx};
      line-height: ${lineHeight};
    }
    .header-sec { text-align: ${layout.alignment.header}; margin-bottom: 6px; }
    .items-sec { text-align: ${layout.alignment.items}; margin-bottom: 6px; }
    .totals-sec { text-align: ${layout.alignment.totals}; margin-bottom: 6px; }
    .footer-sec { text-align: ${layout.alignment.footer}; margin-top: 8px; }
    .title-large {
      font-size: 1.35em;
      font-weight: ${layout.boldElements.restaurantName ? '800' : '500'};
      letter-spacing: -0.3px;
    }
    .order-banner {
      background: #000000;
      color: #ffffff;
      padding: 6px 8px;
      text-align: center;
      font-weight: ${layout.boldElements.orderNumber ? '800' : '600'};
      font-size: 1.15em;
      border-radius: 4px;
      margin: 6px 0;
    }
    .divider {
      border-bottom: 1px dashed #000000;
      margin: 6px 0;
    }
    .divider-double {
      border-bottom: 2px solid #000000;
      margin: 6px 0;
    }
    .item-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 3px;
      font-weight: ${layout.boldElements.itemNames ? '700' : '500'};
    }
    .item-notes {
      font-size: 0.9em;
      color: #444444;
      padding-left: 14px;
      margin-bottom: 2px;
    }
    .summary-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 2px;
    }
    .total-row {
      display: flex;
      justify-content: space-between;
      font-size: 1.3em;
      font-weight: ${layout.boldElements.totalAmount ? '800' : '600'};
      margin: 4px 0;
    }
    .tagline {
      font-style: ${layout.italicElements.tagline ? 'italic' : 'normal'};
      font-size: 0.95em;
      color: #333333;
    }
    .footer-msg {
      font-style: ${layout.italicElements.footerMessage ? 'italic' : 'normal'};
      font-weight: 700;
      margin-bottom: 6px;
    }
    .qr-box {
      text-align: center;
      margin: 8px 0;
    }
  </style>
</head>
<body>
  <!-- Header -->
  <div class="header-sec">
    ${content.showLogo && content.logoUrl ? `<img src="${content.logoUrl}" style="max-width:90px; max-height:65px; display:block; margin:0 auto 6px auto;" />` : ''}
    ${content.customHeaderTitle ? `<div style="font-weight:800; font-size:1em; letter-spacing:0.5px;">${content.customHeaderTitle.toUpperCase()}</div>` : ''}
    ${content.showRestaurantName ? `<div class="title-large">${restaurantName.toUpperCase()}</div>` : ''}
    ${content.headerMessage ? `<div class="tagline">${content.headerMessage}</div>` : ''}
    ${content.showAddress && restaurantAddress ? `<div>${restaurantAddress}</div>` : ''}
    ${content.showPhone && restaurantPhone ? `<div>Tel: ${restaurantPhone}</div>` : ''}
    ${content.showTaxId && content.taxIdValue ? `<div style="font-size:0.9em;">${content.taxIdLabel || 'Tax ID:'} ${content.taxIdValue}</div>` : ''}
  </div>

  <div class="divider"></div>

  <!-- Order Info -->
  ${content.showOrderNumber ? `<div class="order-banner">ORDER ${orderNum}</div>` : ''}
  ${content.showDateTime ? `<div style="text-align:center; font-size:0.9em;">Placed: ${placedAt}</div>` : ''}
  <div style="text-align:center; font-weight:700; font-size:0.95em; margin:2px 0;">
    [ ${isDineIn ? `EAT-IN / DINE-IN ${tableNum ? `TABLE ${tableNum}` : ''}` : `${fulfillmentType} ORDER`} ]
  </div>
  ${content.showTableNumber && tableNum ? `<div style="text-align:center; font-weight:800;">TABLE: ${tableNum.toUpperCase()}</div>` : ''}
  ${content.showServerWaiterName && (order.waiterName || content.serverWaiterName) ? `<div style="text-align:center; font-size:0.9em;">Server: ${order.waiterName || content.serverWaiterName}</div>` : ''}

  <!-- Customer Info -->
  ${content.showCustomerInfo ? `
  <div class="divider"></div>
  <div style="text-align:left;">
    <div style="font-weight:${layout.boldElements.customerDetails ? '700' : '500'};">Customer: ${customerName}</div>
    ${customerPhone ? `<div>Phone: ${customerPhone}</div>` : ''}
    ${rawAddress && !isDineIn ? `<div>Address: ${rawAddress}</div>` : ''}
    ${postalCode && !isDineIn ? `<div style="font-weight:700;">Postcode: ${postalCode}</div>` : ''}
  </div>
  ` : ''}

  <div class="divider"></div>

  <!-- Items -->
  <div class="items-sec">
    <div style="display:flex; justify-content:space-between; font-weight:800; font-size:0.95em; border-bottom:1px solid #000; padding-bottom:3px; margin-bottom:4px;">
      <span style="width:25px;">QTY</span>
      <span style="flex:1; padding:0 6px;">ITEM</span>
      <span style="text-align:right;">PRICE</span>
    </div>
    ${itemsList.map((item: any) => {
      const q = item.quantity || item.qty || 1;
      const n = item.name || item.itemName || 'Item';
      const p = getItemPrice(item);
      return `
      <div class="item-row">
        <span style="width:25px;">${q}x</span>
        <span style="flex:1; padding:0 6px;">${n}</span>
        <span style="text-align:right;">${formatMoney(p)}</span>
      </div>
      ${content.showItemNotes && item.customization?.size ? `<div class="item-notes">* Size: ${item.customization.size}</div>` : ''}
      ${content.showItemNotes && Array.isArray(item.customization?.addOns) && item.customization.addOns.length > 0 ? `<div class="item-notes">+ ${item.customization.addOns.join(', ')}</div>` : ''}
      `;
    }).join('')}
  </div>

  <div class="divider"></div>

  <!-- Totals -->
  <div class="totals-sec">
    ${subtotal > 0 ? `<div class="summary-row"><span>Subtotal</span><span>${formatMoney(subtotal)}</span></div>` : ''}
    ${deliveryFee > 0 ? `<div class="summary-row"><span>Delivery Fee</span><span>${formatMoney(deliveryFee)}</span></div>` : ''}
    ${onlinePaymentFee > 0 ? `<div class="summary-row"><span>Online Payment Fee</span><span>${formatMoney(onlinePaymentFee)}</span></div>` : ''}
    ${handlingCharge > 0 ? `<div class="summary-row"><span>Handling Charge</span><span>${formatMoney(handlingCharge)}</span></div>` : ''}
    ${platformFee > 0 ? `<div class="summary-row"><span>Platform / Service Fee</span><span>${formatMoney(platformFee)}</span></div>` : ''}
    ${tax > 0 || content.showItemTaxBreakdown ? `
    <div class="summary-row">
      <span>${content.showItemTaxBreakdown ? `Tax / VAT (${content.taxPercentage || 20}%)` : 'Tax / VAT'}</span>
      <span>${formatMoney(tax || (subtotal * ((content.taxPercentage || 20) / 100)))}</span>
    </div>` : ''}
    ${tip > 0 ? `<div class="summary-row"><span>Driver Tip</span><span>${formatMoney(tip)}</span></div>` : ''}
    ${content.showDiscountLine && discount > 0 ? `<div class="summary-row"><span>Discount</span><span>-${formatMoney(discount)}</span></div>` : ''}
    
    <div class="divider-double"></div>
    <div class="total-row">
      <span>TOTAL</span>
      <span>${formatMoney(total)}</span>
    </div>
    <div class="divider-double"></div>

    ${content.showPaymentMethod ? `
    <div style="text-align:center; font-weight:700; margin:4px 0;">
      PAYMENT: ${paymentType.toUpperCase()} (${isPaid ? 'PAID' : paymentStatus})
    </div>` : ''}
  </div>

  ${specialNotes ? `
  <div class="divider"></div>
  <div style="font-weight:700; font-size:0.95em;">NOTE: ${specialNotes}</div>
  ` : ''}

  <!-- Footer & QR -->
  <div class="footer-sec">
    ${content.footerMessage ? `<div class="footer-msg">${content.footerMessage}</div>` : ''}
    ${content.showQrCode && content.qrCodeData ? `
    <div class="qr-box">
      <img src="https://api.qrserver.com/v1/create-qr-code/?size=110x110&data=${encodeURIComponent(content.qrCodeData)}" style="width:90px; height:90px; display:block; margin:0 auto 4px auto;" />
      ${content.qrCodeLabel ? `<div style="font-size:0.85em; font-weight:600;">${content.qrCodeLabel}</div>` : ''}
    </div>` : ''}
  </div>
</body>
</html>
  `;
}

/**
 * Generate 80mm Thermal POS Receipt HTML matching the exact physical receipt layout
 */
export function generateThermalReceiptHtml(order: Partial<Order> & any, template?: ReceiptTemplate): string {
  if (template) {
    return generateCustomizedThermalReceiptHtml(order, template);
  }
  const orderNum = order.orderNumber || (order._id ? `#${order._id.slice(-5).toUpperCase()}` : '#00000');
  
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
    'N/A';

  // Restaurant details
  const restaurantName =
    typeof order.restaurantId === 'object'
      ? order.restaurantId?.restaurantName || 'Restaurant'
      : 'Krifoo Partner';

  const restaurantPhone =
    typeof order.restaurantId === 'object'
      ? order.restaurantId?.phoneNumber || ''
      : '';

  // Fulfillment Type
  const fulfillmentType = (order.orderType || order.deliveryType || 'Delivery').toUpperCase();
  const isDelivery = fulfillmentType.includes('DELIV');

  // Address
  const rawAddress =
    order.deliveryAddress?.fullAddress ||
    order.deliveryAddress?.formattedAddress ||
    order.deliveryAddress?.addressLine1 ||
    order.deliveryAddress?.address ||
    (typeof order.deliveryAddress === 'string' ? order.deliveryAddress : '') ||
    (isDelivery ? 'Delivery Address Specified' : 'Takeaway / Collection');

  const postalCode =
    order.deliveryAddress?.postalCode ||
    order.deliveryAddress?.postcode ||
    order.deliveryAddress?.postCode ||
    order.deliveryAddress?.zipCode ||
    (rawAddress.match(/[A-Z]{1,2}[0-9][A-Z0-9]? ?[0-9][A-Z]{2}/i)?.[0] || '');

  // Dates
  const { placedAt, targetTime } = formatOrderDate(order.createdAt);

  // Items
  const itemsList = order.orderedItems || order.items || [];

  // Financials
  const pricing = order.pricing || {};
  const subtotal = Number(pricing.subtotal ?? (order as any).subtotal ?? order.totalAmount ?? order.totalPrice ?? 0);
  const deliveryFee = Number(pricing.deliveryFee ?? (order as any).deliveryFee ?? 0);
  const onlinePaymentFee = Number(pricing.onlinePaymentFee ?? (order as any).onlinePaymentFee ?? (pricing as any).cardFee ?? (pricing as any).paymentFee ?? 0);
  const handlingCharge = Number(pricing.handlingCharge ?? (order as any).handlingCharge ?? 0);
  const platformFee = Number(pricing.platformFee ?? (order as any).platformFee ?? (pricing as any).serviceFee ?? (order as any).serviceFee ?? 0);
  const tax = Number(pricing.tax ?? pricing.vat ?? (order as any).tax ?? (order as any).vat ?? 0);
  const tip = Number(pricing.tip ?? (order as any).tip ?? 0);
  const discount = Number(pricing.discount ?? pricing.discountAmount ?? (order as any).discountAmount ?? 0);
  const total = Number(pricing.total ?? pricing.totalAmount ?? order.totalAmount ?? (order as any).totalPrice ?? (subtotal + deliveryFee + onlinePaymentFee + handlingCharge + platformFee + tax + tip - discount));

  const paymentType = order.paymentType || 'Card';
  const paymentStatus = (order.paymentStatus || 'Paid').toUpperCase();
  const isPaid = paymentStatus === 'PAID' || paymentStatus === 'COMPLETED';

  // Notes
  const specialNotes = order.notes || order.specialInstructions || '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Receipt ${orderNum}</title>
  <style>
    @page {
      size: 80mm auto;
      margin: 0mm !important;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      color-adjust: exact;
    }
    html, body {
      width: 100% !important;
      max-width: 80mm !important;
      margin: 0 auto !important;
      padding: 0 !important;
      background-color: #ffffff;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      padding: 4mm 3mm 12mm 3mm;
      color: #000000;
      font-size: 13px;
      line-height: 1.35;
    }
    
    /* Top Black Banner */
    .header-banner {
      background-color: #000000 !important;
      color: #ffffff !important;
      padding: 8px 10px;
      border-radius: 4px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 8px;
    }
    .header-left {
      text-align: left;
    }
    .header-customer-name {
      font-size: 17px;
      font-weight: 800;
      line-height: 1.2;
    }
    .header-order-num {
      font-size: 16px;
      font-weight: 800;
      margin-top: 2px;
    }
    .header-right {
      text-align: right;
    }
    .header-type {
      font-size: 17px;
      font-weight: 800;
      line-height: 1.2;
    }
    .header-asap {
      font-size: 16px;
      font-weight: 800;
      margin-top: 2px;
    }

    /* Delivery / Timing Row */
    .timing-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 6px 2px;
      font-size: 13px;
      font-weight: 600;
      color: #333333;
    }
    .timing-target {
      font-size: 14px;
      font-weight: 800;
      color: #000000;
    }

    .divider-solid {
      border-top: 1px solid #000000;
      margin: 6px 0;
    }
    .divider-dashed {
      border-top: 1.5px dashed #555555;
      margin: 8px 0;
    }

    /* Items Table */
    .items-section {
      margin: 8px 0;
    }
    .item-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 7px;
      font-size: 18px;
    }
    .item-name-qty {
      font-size: 18px;
      font-weight: 900;
      flex: 1;
      padding-right: 8px;
      color: #000000;
      line-height: 1.25;
    }
    .item-price {
      font-size: 18px;
      font-weight: 900;
      white-space: nowrap;
      text-align: right;
      color: #000000;
    }
    .item-addon {
      font-size: 14px;
      font-weight: 600;
      color: #333333;
      margin-top: 2px;
      padding-left: 14px;
    }

    /* Summary Financials */
    .summary-table {
      width: 100%;
      margin: 6px 0;
    }
    .summary-row {
      display: flex;
      justify-content: space-between;
      font-size: 13px;
      padding: 2px 0;
      color: #222222;
    }
    .summary-row-bold {
      display: flex;
      justify-content: space-between;
      font-size: 16px;
      font-weight: 900;
      padding: 6px 0;
      color: #000000;
      border-top: 1.5px solid #000000;
      border-bottom: 1.5px solid #000000;
      margin: 6px 0;
    }

    /* Payment status */
    .payment-row {
      display: flex;
      justify-content: space-between;
      font-size: 13px;
      padding: 2px 0;
      color: #222222;
    }
    .payment-method {
      font-weight: 600;
    }

    /* Customer details block */
    .customer-block {
      margin-top: 8px;
    }
    .detail-label {
      font-size: 12px;
      font-weight: 800;
      color: #000000;
      margin-top: 6px;
      margin-bottom: 1px;
    }
    .detail-val {
      font-size: 13px;
      font-weight: 500;
      color: #111111;
      line-height: 1.3;
    }
    .detail-val-bold {
      font-size: 14px;
      font-weight: 800;
      color: #000000;
    }

    /* Notes block */
    .notes-box {
      margin-top: 8px;
      padding: 6px;
      background-color: #f3f3f3;
      border: 1px dashed #000000;
      border-radius: 4px;
    }

    /* Footer */
    .footer {
      text-align: center;
      margin-top: 14px;
      padding-top: 6px;
      border-top: 1px dotted #888888;
      font-size: 11px;
      color: #555555;
    }
    .footer-rest {
      font-weight: 700;
      color: #222222;
      margin-top: 2px;
    }
  </style>
</head>
<body>
  <!-- Header Banner (Dark Inverted Block) -->
  <div class="header-banner">
    <div class="header-left">
      <div class="header-customer-name">${customerName}</div>
      <div class="header-order-num">${orderNum.startsWith('#') ? orderNum : '#' + orderNum}</div>
    </div>
    <div class="header-right">
      <div class="header-type">${fulfillmentType}</div>
      <div class="header-asap">ASAP</div>
    </div>
  </div>

  <!-- Delivery Time Target -->
  <div class="timing-row">
    <span>Delivery time</span>
    <span class="timing-target">${targetTime}</span>
  </div>

  <div class="divider-solid"></div>

  <!-- Ordered Items List -->
  <div class="items-section">
    ${
      itemsList.length > 0
        ? itemsList
            .map((item: any) => {
              const qty = Number(item.quantity || item.qty || 1);
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

              let price = 0;
              if (item.itemTotal !== undefined && item.itemTotal !== null && !isNaN(item.itemTotal)) {
                price = Number(item.itemTotal);
              } else if (item.basePrice !== undefined && item.basePrice !== null && !isNaN(item.basePrice)) {
                price = Number(item.basePrice) * qty;
              } else if (item.price !== undefined && item.price !== null && !isNaN(item.price)) {
                price = Number(item.price) * qty;
              }

              const optionsList: string[] = [];
              if (Array.isArray(item.selectedVariants)) {
                item.selectedVariants.forEach((v: any) => {
                  if (typeof v === 'string' && v.trim()) optionsList.push(v.trim());
                  else if (v && typeof v === 'object') {
                    const vName = v.variantName || v.name || v.title || '';
                    const vPrice = v.price || v.additionalPrice ? ` (+${formatMoney(v.price || v.additionalPrice)})` : '';
                    if (vName) optionsList.push(`${vName}${vPrice}`);
                  }
                });
              }
              if (Array.isArray(item.selectedAddons)) {
                item.selectedAddons.forEach((a: any) => {
                  if (typeof a === 'string' && a.trim()) optionsList.push(a.trim());
                  else if (a && typeof a === 'object') {
                    const aName = a.addonName || a.name || a.title || '';
                    const aPrice = a.price || a.additionalPrice ? ` (+${formatMoney(a.price || a.additionalPrice)})` : '';
                    if (aName) optionsList.push(`${aName}${aPrice}`);
                  }
                });
              }
              if (item.customization?.size) optionsList.push(`Size: ${item.customization.size}`);
              if (Array.isArray(item.customization?.addOns)) {
                item.customization.addOns.forEach((a: string) => { if (a) optionsList.push(a); });
              }

              const itemNote = item.instructions || item.specialInstructions || item.note || '';

              return `
              <div class="item-row">
                <div class="item-name-qty">${qty} x &nbsp;${name}</div>
                <div class="item-price">${formatMoney(price)}</div>
              </div>
              ${optionsList.map((opt: string) => `<div class="item-addon">+ ${opt}</div>`).join('')}
              ${itemNote ? `<div class="item-addon" style="font-style: italic;">* ${itemNote}</div>` : ''}
            `;
            })
            .join('')
        : `<div class="item-row"><div class="item-name-qty">1 x Order Items</div><div class="item-price">${formatMoney(total)}</div></div>`
    }
  </div>

  <div class="divider-solid"></div>

  <!-- Financial Summary -->
  <div class="summary-table">
    <div class="summary-row">
      <span>Subtotal</span>
      <span>${formatMoney(subtotal > 0 ? subtotal : total)}</span>
    </div>
    ${
      deliveryFee > 0
        ? `
    <div class="summary-row">
      <span>Delivery Fee</span>
      <span>${formatMoney(deliveryFee)}</span>
    </div>`
        : ''
    }
    ${
      onlinePaymentFee > 0
        ? `
    <div class="summary-row">
      <span>Online Payment Fee</span>
      <span>${formatMoney(onlinePaymentFee)}</span>
    </div>`
        : ''
    }
    ${
      handlingCharge > 0
        ? `
    <div class="summary-row">
      <span>Handling Charge</span>
      <span>${formatMoney(handlingCharge)}</span>
    </div>`
        : ''
    }
    ${
      platformFee > 0
        ? `
    <div class="summary-row">
      <span>Platform / Service Fee</span>
      <span>${formatMoney(platformFee)}</span>
    </div>`
        : ''
    }
    ${
      tax > 0
        ? `
    <div class="summary-row">
      <span>Tax / VAT</span>
      <span>${formatMoney(tax)}</span>
    </div>`
        : ''
    }
    ${
      tip > 0
        ? `
    <div class="summary-row">
      <span>Driver Tip</span>
      <span>${formatMoney(tip)}</span>
    </div>`
        : ''
    }
    ${
      discount > 0
        ? `
    <div class="summary-row">
      <span>Discount</span>
      <span>-${formatMoney(discount)}</span>
    </div>`
        : ''
    }

    <!-- Total Row (Large Bold) -->
    <div class="summary-row-bold">
      <span>Total</span>
      <span>${formatMoney(total)}</span>
    </div>

    <!-- Payment Rows -->
    <div class="payment-row">
      <span>${isPaid ? 'Paid' : 'Payment Status'}</span>
      <span style="font-weight: 700;">${isPaid ? formatMoney(total) : paymentStatus}</span>
    </div>
    <div class="payment-row">
      <span class="payment-method">Paid with ${paymentType}</span>
      <span>${formatMoney(total)}</span>
    </div>
  </div>

  <div class="divider-dashed"></div>

  <!-- Customer & Delivery Information -->
  <div class="customer-block">
    <div class="detail-label">Customer name</div>
    <div class="detail-val-bold">${customerName}</div>

    ${
      isDelivery && rawAddress
        ? `
    <div class="detail-label">Delivery address</div>
    <div class="detail-val">${rawAddress}</div>
    `
        : ''
    }

    ${
      postalCode
        ? `
    <div class="detail-label">Postal code</div>
    <div class="detail-val-bold">${postalCode}</div>
    `
        : ''
    }

    <div class="detail-label">Phone number</div>
    <div class="detail-val-bold">${customerPhone}</div>

    ${
      specialNotes
        ? `
    <div class="notes-box">
      <div class="detail-label" style="margin-top:0;">Special Instructions:</div>
      <div class="detail-val">${specialNotes}</div>
    </div>
    `
        : ''
    }
  </div>

  <!-- Footer -->
  <div class="footer">
    <div>Order placed ${placedAt}</div>
    <div class="footer-rest">${restaurantName}${restaurantPhone ? ' | ' + restaurantPhone : ''}</div>
  </div>
</body>
</html>
  `;
}

// 80mm in standard PostScript points (80mm / 25.4 * 72 = 226.77 pt)
const THERMAL_80MM_WIDTH_POINTS = 227;

// Cache to prevent duplicate prints when Socket and Push Notification arrive simultaneously
const recentPrints = new Map<string, number>();

export interface PrintJobReport {
  orderId: string;
  orderNumber: string;
  orderStatus: string;
  customerName: string;
  totalAmount: string;
  itemCount: number;
  trigger: 'manual_click' | 'auto_print';
  brand: string;
  connectionType: string;
  targetAddress: string;
  driverUsed: 'sunmi_aidl' | 'epson_epos' | 'network_escpos' | 'system_spooler' | 'none';
  driverLabel: string;
  copies: number;
  success: boolean;
  durationMs: number;
  timestamp: string;
  error?: string;
}

let lastPrintJobReport: PrintJobReport | null = null;

/**
 * Get report for the most recent print action
 */
export function getLastPrintJobReport(): PrintJobReport | null {
  return lastPrintJobReport;
}

/**
 * Print an order on the restaurant's configured thermal POS printer
 * - SUNMI / Flipdish: Uses direct Sunmi AIDL SDK
 * - Epson / Star / RetailZ / Munbyn / ESC-POS: Uses Network TCP/IP ESC-POS driver
 * - System / Generic: Uses expo-print PDF/HTML spooler
 * 
 * @param order Order data object
 * @param isManual True if initiated by direct user tap (bypasses auto-print check & debounce)
 */
export async function printThermalReceipt(
  order: Partial<Order> & any,
  isManual: boolean = false,
  customTemplate?: ReceiptTemplate
): Promise<boolean> {
  const startTime = Date.now();
  const orderNum = String(order.orderNumber || (order._id ? `#${order._id.slice(-5).toUpperCase()}` : '#00000'));
  const orderId = String(order._id || order.id || orderNum);
  const orderStatus = String(order.status || 'unknown');
  const customerName = order.customerDetails?.name || order.customerId?.fullName || order.userId?.fullName || 'Customer';
  const totalAmount = order.pricing?.total ?? order.pricing?.totalAmount ?? order.totalAmount ?? order.totalPrice ?? 0;
  const items = Array.isArray(order.orderedItems) ? order.orderedItems : (Array.isArray(order.items) ? order.items : []);
  const itemCount = items.length;

  let driverUsed: 'sunmi_aidl' | 'epson_epos' | 'network_escpos' | 'system_spooler' | 'none' = 'none';
  let driverLabel = 'None';
  let success = false;
  let printError: string | undefined;

  console.log(`[PRINT INITIATE] Order #${orderNum} | Trigger: ${isManual ? 'MANUAL USER CLICK' : 'AUTO-PRINT'} | Stage: "${orderStatus}" | Total: £${Number(totalAmount).toFixed(2)} | Items: ${itemCount}`);

  try {
    const restId = typeof order.restaurantId === 'object' ? order.restaurantId?._id : (order.restaurantId || order.restaurant);
    const config = await getPosPrinterConfig(restId ? String(restId) : undefined);
    const template = customTemplate || (await getActiveReceiptTemplate(restId ? String(restId) : undefined));

    // Ensure order has live store details populated
    if (!order.restaurantName && (typeof order.restaurantId !== 'object' || !order.restaurantId?.restaurantName)) {
      const cached = getCachedStoreProfile();
      if (cached?.restaurantName) {
        order.restaurantName = cached.restaurantName;
        if (typeof order.restaurantId === 'object') {
          order.restaurantId.restaurantName = cached.restaurantName;
        } else {
          order.restaurantId = {
            _id: String(order.restaurantId || ''),
            restaurantName: cached.restaurantName,
            phoneNumber: cached.phoneNumber || '',
          };
        }
      } else {
        try {
          const { restaurantOwnerService } = require('./restaurant-owner.service');
          const ownerRes = await restaurantOwnerService.getRestaurantProfile();
          if (ownerRes?.success && ownerRes.data?.restaurantName) {
            order.restaurantName = ownerRes.data.restaurantName;
            const ownerAddr = ownerRes.data.address;
            const resolvedAddr = formatRestaurantAddress(ownerAddr);
            setCachedStoreProfile({
              restaurantName: ownerRes.data.restaurantName,
              phoneNumber: ownerRes.data.phoneNumber,
              address: resolvedAddr,
            });
            if (typeof order.restaurantId === 'object') {
              order.restaurantId.restaurantName = ownerRes.data.restaurantName;
            } else {
              order.restaurantId = {
                _id: String(order.restaurantId || ownerRes.data._id || ''),
                restaurantName: ownerRes.data.restaurantName,
                phoneNumber: ownerRes.data.phoneNumber || '',
              };
            }
          }
        } catch {
          // ignore
        }
      }
    }

    // If auto-print is disabled and this was not a manual user click, skip
    if (!config.autoPrint && !isManual) {
      console.log(`[PRINT SKIPPED] Auto-print is disabled for restaurant in POS settings. Order: #${orderNum}`);
      lastPrintJobReport = {
        orderId,
        orderNumber: orderNum,
        orderStatus,
        customerName,
        totalAmount: `£${Number(totalAmount).toFixed(2)}`,
        itemCount,
        trigger: 'auto_print',
        brand: config.brand,
        connectionType: config.connectionType,
        targetAddress: config.connectionType === 'network' ? `${config.ipAddress}:${config.port}` : config.connectionType,
        driverUsed: 'none',
        driverLabel: 'Auto-print disabled',
        copies: 0,
        success: false,
        durationMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        error: 'Auto-print disabled in settings',
      };
      return false;
    }

    const orderKey = String(order._id || order.orderNumber || order.id || '');
    const now = Date.now();

    // Prevent duplicate auto-prints if socket and push notification fire at the same second
    if (!isManual && orderKey) {
      const lastPrinted = recentPrints.get(orderKey);
      if (lastPrinted && now - lastPrinted < 20000) {
        console.log(`[PRINT SKIPPED] Duplicate auto-print for order #${orderNum} (printed ${Math.round((now - lastPrinted)/1000)}s ago)`);
        return true;
      }
      recentPrints.set(orderKey, now);
      if (recentPrints.size > 100) {
        recentPrints.clear();
      }
    }

    const copies = Math.max(1, config.copies || 1);
    const targetAddr = config.connectionType === 'network' ? `${config.ipAddress}:${config.port}` : config.connectionType;
    const profile = profileFromConfig(config);

    console.log(`[PRINT HARDWARE] Brand: ${config.brand.toUpperCase()} (${config.connectionType} @ ${targetAddr}) | Copies: ${copies}`);

    for (let copy = 1; copy <= copies; copy++) {
      if (copy > 1) {
        console.log(`[PRINT] Printing copy ${copy} of ${copies}...`);
      }

      // 1. If valid hardware profile is configured and not purely 'system'
      if (profile && profile.connectionType !== 'system') {
        const printer = resolvePrinter(profile, {
          brand: config.brand,
          paperWidth: config.paperWidth,
          orderContext: order,
          configContext: config,
        });

        console.log(`[PRINT ATTEMPT] Dispatching to ${printer.model} via PrintQueue (Copy ${copy}/${copies})...`);
        const doc = buildCustomizedReceiptDocument(order, config, template);

        const result = await PrintQueueService.enqueuePrintJob(
          printer,
          doc,
          config,
          `Order_${orderNum}_c${copy}`
        );

        if (result.success) {
          driverUsed = profile.connectionType === 'builtin'
            ? 'sunmi_aidl'
            : profile.connectionType === 'network_epos'
            ? 'epson_epos'
            : 'network_escpos';
          driverLabel = printer.model;
          success = true;
          continue;
        } else {
          const failRes = result as { success: false; reason?: string; detail?: string };
          printError = failRes.detail || (failRes.reason ? `Printer failed with reason: ${failRes.reason}` : 'Printer failed');
          console.warn(`[PRINT WARNING] ${printer.model} returned error: ${printError}. Falling back to system spooler...`);
        }
      }

      // 2. Fallback: System Spooler / AirPrint / PDF
      const paperWidthPoints = template.layout.paperWidth === '58mm' ? 164 : THERMAL_80MM_WIDTH_POINTS;
      console.log(`[PRINT ATTEMPT] Dispatching to System Print Spooler (PDF / AirPrint ${template.layout.paperWidth})...`);
      try {
        const html = generateThermalReceiptHtml(order, template);
        const file = await Print.printToFileAsync({
          html,
          width: paperWidthPoints,
        });

        await Print.printAsync({
          uri: file.uri,
        });
        driverUsed = 'system_spooler';
        driverLabel = `System Print Spooler (AirPrint / ${template.layout.paperWidth})`;
        success = true;
      } catch (fallbackErr: any) {
        console.warn('[PRINT FALLBACK] PrintToFileAsync failed, trying direct printAsync:', fallbackErr);
        try {
          const html = generateThermalReceiptHtml(order, template);
          await Print.printAsync({
            html,
            width: paperWidthPoints,
          });
          driverUsed = 'system_spooler';
          driverLabel = `System Print Spooler (Direct ${template.layout.paperWidth})`;
          success = true;
        } catch (directErr: any) {
          console.error('[PRINT ERROR] All print attempts failed:', directErr);
          printError = directErr?.message || fallbackErr?.message || 'Print spooler failed';
          success = false;
        }
      }
    }

    const durationMs = Date.now() - startTime;
    lastPrintJobReport = {
      orderId,
      orderNumber: orderNum,
      orderStatus,
      customerName,
      totalAmount: `£${Number(totalAmount).toFixed(2)}`,
      itemCount,
      trigger: isManual ? 'manual_click' : 'auto_print',
      brand: config.brand,
      connectionType: config.connectionType,
      targetAddress: targetAddr,
      driverUsed,
      driverLabel,
      copies,
      success,
      durationMs,
      timestamp: new Date().toISOString(),
      error: printError,
    };

    console.log(`
┌────────────────────────────────────────────────────────┐
│               🖨️  ACTUAL PRINT STATUS REPORT            │
├───────────────────┬────────────────────────────────────┤
│ Order Number      │ #${orderNum}
│ Order Stage       │ ${orderStatus.toUpperCase()}
│ Trigger Source    │ ${isManual ? 'MANUAL USER CLICK' : 'AUTO-PRINT'}
│ Customer          │ ${customerName}
│ Order Total       │ £${Number(totalAmount).toFixed(2)} (${itemCount} items)
│ Configured Brand  │ ${config.brand.toUpperCase()} (${config.connectionType})
│ Target Address    │ ${targetAddr}
│ Driver Executed   │ ${driverLabel}
│ Copies Printed    │ ${copies} copy/copies
│ Elapsed Time      │ ${durationMs}ms
│ Final Result      │ ${success ? '✅ SUCCESS (PRINTED)' : '❌ FAILED'}
└───────────────────┴────────────────────────────────────┘`);

    return success;
  } catch (error: any) {
    const durationMs = Date.now() - startTime;
    const errMessage = error?.message || String(error);
    lastPrintJobReport = {
      orderId,
      orderNumber: orderNum,
      orderStatus,
      customerName,
      totalAmount: `£${Number(totalAmount).toFixed(2)}`,
      itemCount,
      trigger: isManual ? 'manual_click' : 'auto_print',
      brand: 'unknown',
      connectionType: 'unknown',
      targetAddress: 'unknown',
      driverUsed: 'none',
      driverLabel: 'Error Failed',
      copies: 1,
      success: false,
      durationMs,
      timestamp: new Date().toISOString(),
      error: errMessage,
    };

    console.error(`
┌────────────────────────────────────────────────────────┐
│           ❌ ACTUAL PRINT STATUS REPORT: FAILED        │
├───────────────────┬────────────────────────────────────┤
│ Order Number      │ #${orderNum}
│ Order Stage       │ ${orderStatus.toUpperCase()}
│ Error Details     │ ${errMessage}
│ Elapsed Time      │ ${durationMs}ms
└───────────────────┴────────────────────────────────────┘`);
    return false;
  }
}

/**
 * Sample order for testing 80mm thermal printing
 */
export const SAMPLE_THERMAL_ORDER = {
  _id: '22885',
  orderNumber: '22885',
  orderType: 'Delivery',
  status: 'placed',
  createdAt: new Date().toISOString(),
  customerDetails: {
    name: 'Alida Thej',
    phoneNumber: '07423003935',
  },
  deliveryAddress: {
    formattedAddress: '471 Newmarket Rd, Cambridge, GB-ENG CB5 8JJ, United Kingdom',
    postalCode: 'CB5 8JJ',
  },
  restaurantId: {
    _id: 'rest_1',
    restaurantName: 'Swaad',
    phoneNumber: '83a Mill Rd, Cambridge CB1 2AW, UK',
  },
  orderedItems: [
    {
      itemName: 'Mandi chicken biryani',
      name: 'Mandi chicken biryani',
      price: 10.0,
      basePrice: 10.0,
      quantity: 2,
    },
  ],
  pricing: {
    subtotal: 20.0,
    handlingCharge: 0.4,
    deliveryFee: 0.0,
    total: 20.4,
  },
  paymentType: 'mastercard 0000',
  paymentStatus: 'paid',
};

/**
 * Print a sample test receipt matching the user's POS receipt
 */
export async function printSampleThermalReceipt(): Promise<boolean> {
  return printThermalReceipt(SAMPLE_THERMAL_ORDER, true);
}

/**
 * Pulse cash drawer without creating a fake dummy order (Fixes Bug #8)
 */
export async function openCashDrawer(restaurantId?: string): Promise<boolean> {
  try {
    const config = await getPosPrinterConfig(restaurantId);
    const profile = profileFromConfig(config);

    if (profile && profile.connectionType !== 'system') {
      const printer = resolvePrinter(profile, {
        brand: config.brand,
        paperWidth: config.paperWidth,
      });
      const kickDoc = buildDrawerKickDocument(1);
      const res = await PrintQueueService.enqueuePrintJob(printer, kickDoc, config, 'Drawer_Kick');
      return res.success;
    }

    const hasSunmi = await isSunmiAvailable();
    if (hasSunmi) {
      const { openSunmiCashDrawer } = require('./sunmi-printer.service');
      if (typeof openSunmiCashDrawer === 'function') {
        return await openSunmiCashDrawer();
      }
    }

    return false;
  } catch (err) {
    console.error('[Cash Drawer] Failed to kick drawer:', err);
    return false;
  }
}

/**
 * Print a test receipt using a specific customized template to verify physical formatting
 */
export async function printTestReceiptTemplate(
  template: ReceiptTemplate,
  restaurantId?: string,
  storeNameOverride?: string
): Promise<boolean> {
  let resolvedStoreName = storeNameOverride || getCachedStoreProfile()?.restaurantName;
  let resolvedPhone = getCachedStoreProfile()?.phoneNumber;
  let resolvedAddress = getCachedStoreProfile()?.address;

  if (!resolvedStoreName) {
    try {
      if (restaurantId) {
        const { restaurantService } = require('./restaurant.service');
        const res = await restaurantService.getRestaurantById(restaurantId);
        if (res?.success && res.data?.restaurantName) {
          resolvedStoreName = res.data.restaurantName;
          resolvedPhone = res.data.phoneNumber || resolvedPhone;
          const rAddr = res.data.address;
          resolvedAddress = formatRestaurantAddress(rAddr) || resolvedAddress;
        }
      }
      if (!resolvedStoreName) {
        const { restaurantOwnerService } = require('./restaurant-owner.service');
        const ownerRes = await restaurantOwnerService.getRestaurantProfile();
        if (ownerRes?.success && ownerRes.data?.restaurantName) {
          resolvedStoreName = ownerRes.data.restaurantName;
          resolvedPhone = ownerRes.data.phoneNumber || resolvedPhone;
          const oAddr = ownerRes.data.address;
          resolvedAddress = formatRestaurantAddress(oAddr) || resolvedAddress;
          setCachedStoreProfile({
            restaurantName: resolvedStoreName,
            phoneNumber: resolvedPhone,
            address: resolvedAddress,
          });
        }
      }
    } catch (e) {
      console.warn('[printTestReceiptTemplate] Could not fetch store profile:', e);
    }
  }

  const sampleOrder = getSampleOrderForPreview(
    template.content.showTableNumber ? 'dine_in' : 'delivery',
    resolvedStoreName
  );

  if (resolvedStoreName) {
    const formattedAddr = formatRestaurantAddress(resolvedAddress);
    sampleOrder.restaurantId = {
      _id: restaurantId || 'rest_001',
      restaurantName: resolvedStoreName,
      phoneNumber: resolvedPhone || '01223 456789',
      address: formattedAddr,
      formattedAddress: formattedAddr,
    };
    sampleOrder.restaurantName = resolvedStoreName;
    sampleOrder.restaurantAddress = formattedAddr;
  }

  return printThermalReceipt(sampleOrder, true, template);
}



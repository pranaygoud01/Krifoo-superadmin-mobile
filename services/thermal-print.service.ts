import * as Print from 'expo-print';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Order } from '../types';
import { getPosPrinterConfig, savePosPrinterConfig, PosPrinterConfig, POS_BRANDS, getBrandOption, getBrandName } from './pos-config.service';
import { printNetworkOrderReceipt, testNetworkPrinter } from './printer/network-printer.service';
import { printEpsonOrderReceipt, testEpsonPrinter } from './printer/epson-printer.service';

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
 * Generate 80mm Thermal POS Receipt HTML matching the exact physical receipt layout
 */
export function generateThermalReceiptHtml(order: Partial<Order> & any): string {
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
  const subtotal = pricing.subtotal ?? order.totalAmount ?? order.totalPrice ?? 0;
  const processingFee = pricing.handlingCharge ?? pricing.platformFee ?? 0;
  const deliveryFee = pricing.deliveryFee ?? order.deliveryFee ?? 0;
  const discount = pricing.discount ?? pricing.discountAmount ?? 0;
  const total = pricing.total ?? pricing.totalAmount ?? (subtotal + processingFee + deliveryFee - discount);

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
      margin-bottom: 6px;
      font-size: 14px;
    }
    .item-name-qty {
      font-weight: 800;
      flex: 1;
      padding-right: 8px;
      color: #000000;
    }
    .item-price {
      font-weight: 800;
      white-space: nowrap;
      text-align: right;
      color: #000000;
    }
    .item-addon {
      font-size: 11px;
      color: #555555;
      margin-top: 1px;
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
      processingFee > 0
        ? `
    <div class="summary-row">
      <span>Processing Fee</span>
      <span>${formatMoney(processingFee)}</span>
    </div>`
        : ''
    }
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

/**
 * Print an order on the restaurant's configured thermal POS printer
 * - SUNMI / Flipdish: Uses direct Sunmi AIDL SDK
 * - Epson / Star / RetailZ / Munbyn / ESC-POS: Uses Network TCP/IP ESC-POS driver
 * - System / Generic: Uses expo-print PDF/HTML spooler
 * 
 * @param order Order data object
 * @param isManual True if initiated by direct user tap (bypasses auto-print check & debounce)
 */
export async function printThermalReceipt(order: Partial<Order> & any, isManual: boolean = false): Promise<boolean> {
  try {
    const restId = typeof order.restaurantId === 'object' ? order.restaurantId?._id : (order.restaurantId || order.restaurant);
    const config = await getPosPrinterConfig(restId ? String(restId) : undefined);

    // If auto-print is disabled and this was not a manual user click, skip
    if (!config.autoPrint && !isManual) {
      console.log('[Print] Auto-print is disabled in POS settings, skipping.');
      return false;
    }

    const orderKey = String(order._id || order.orderNumber || order.id || '');
    const now = Date.now();

    // Prevent duplicate auto-prints if socket and push notification fire at the same second
    if (!isManual && orderKey) {
      const lastPrinted = recentPrints.get(orderKey);
      if (lastPrinted && now - lastPrinted < 20000) {
        console.log(`[Print] Skipping duplicate auto-print for order ${orderKey} (already printed ${Math.round((now - lastPrinted)/1000)}s ago)`);
        return true;
      }
      recentPrints.set(orderKey, now);
      if (recentPrints.size > 100) {
        recentPrints.clear();
      }
    }

    console.log(`[Print] Dispatching print job for order ${order.orderNumber || order._id} using brand: ${config.brand.toUpperCase()} (${config.connectionType})`);

    const copies = Math.max(1, config.copies || 1);
    let success = false;

    for (let copy = 1; copy <= copies; copy++) {
      if (copy > 1) {
        console.log(`[Print] Printing copy ${copy} of ${copies}...`);
      }

      // 1. Built-in Sunmi / Flipdish POS hardware
      if (config.connectionType === 'builtin' || config.brand === 'sunmi' || config.brand === 'flipdish') {
        const hasSunmi = await isSunmiAvailable();
        if (hasSunmi) {
          const res = await printSunmiOrderReceipt(order);
          if (res) {
            success = true;
            continue;
          }
        }
      }

      // 2. Epson ePOS XML SDK (Epson TM-m30, TM-T88, TM-T20, TM-T82)
      if (config.brand === 'epson') {
        const epsonRes = await printEpsonOrderReceipt(order, config);
        if (epsonRes) {
          success = true;
          continue;
        }
        console.warn('[Print] Epson ePOS XML print returned false, attempting network ESC/POS stream...');
      }

      // 3. Network ESC/POS (Star, RetailZ, Citizen, Bixolon, Munbyn, Xprinter, Generic)
      if (config.connectionType === 'network' || ['epson', 'star', 'retailz', 'citizen', 'bixolon', 'munbyn_xprinter', 'generic_network'].includes(config.brand)) {
        const res = await printNetworkOrderReceipt(order, config);
        if (res) {
          success = true;
          continue;
        }
        console.warn('[Print] Network ESC/POS print returned false, falling back to system print...');
      }

      // 3. Fallback: System Spooler / AirPrint
      try {
        const html = generateThermalReceiptHtml(order);
        const file = await Print.printToFileAsync({
          html,
          width: THERMAL_80MM_WIDTH_POINTS,
        });

        await Print.printAsync({
          uri: file.uri,
        });
        success = true;
      } catch (fallbackErr) {
        console.warn('[Print] System print fallback error:', fallbackErr);
        const html = generateThermalReceiptHtml(order);
        await Print.printAsync({
          html,
          width: THERMAL_80MM_WIDTH_POINTS,
        });
        success = true;
      }
    }

    return success;
  } catch (error) {
    console.error('[Print] Failed printing thermal receipt:', error);
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
  return printThermalReceipt(SAMPLE_THERMAL_ORDER);
}

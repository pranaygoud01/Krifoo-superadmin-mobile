import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';
import { printHtmlWithSystemDialog } from './printer/system-print';
import { Order } from '../types';
import { isSunmiAvailable, printSunmiOrderReceipt } from './sunmi-printer.service';
import {
  getPosPrinterConfig,
  savePosPrinterConfig,
  savePosPrinterConfigStrict,
  PosPrinterConfig,
  POS_BRANDS,
  getBrandOption,
  getBrandName,
  profileFromConfig,
  AutoPrintTrigger,
} from './pos-config.service';
import {
  printEpsonOrderReceipt,
  testEpsonPrinter,
  testPrinterAlignmentSlip,
  discoverEpsonPrinters,
  verifyPrinterConnection,
  formatPrinterConnectionError,
  isLikelyAudioDevice,
  FormattedPrinterError,
} from './printer/epson-printer.service';
import {
  buildReceiptDocument,
  buildDrawerKickDocument,
  buildCustomizedReceiptDocument,
  getOrderScheduleInfo,
  formatScheduleDisplay,
  getOrderFulfillmentLabel,
  getSanitizedOrderNotes,
  getDisplayOrderNumber,
  getRestaurantName,
  getRestaurantPhone,
  getRestaurantAddressLine,
  getCustomerName,
  getCustomerPhone,
  getDeliveryAddress,
  getPaymentInfo,
  computeReceiptTotals,
  formatMoney,
  getItemName,
  getItemPrice,
  getItemQuantity,
  getItemInstructions,
  getOrderItems,
  getTableNumber,
  isDineInOrder,
} from './printer/receipt-document';
import { resolvePrinter } from './printer/printer-registry';
import { PrintQueueService } from './printer/print-queue.service';
import {
  getActiveReceiptTemplate,
  ReceiptTemplate,
  DEFAULT_RECEIPT_TEMPLATE,
  cloneTemplate,
  getSampleOrderForPreview,
  getCachedStoreProfile,
  setCachedStoreProfile,
  formatRestaurantAddress,
  isDummyCustomerPhone,
  getItemOptionsList,
} from './receipt-customization.service';

export {
  isSunmiAvailable,
  printSunmiOrderReceipt,
  getPosPrinterConfig,
  savePosPrinterConfig,
  POS_BRANDS,
  getBrandOption,
  getBrandName,
  printEpsonOrderReceipt,
  testEpsonPrinter,
  testPrinterAlignmentSlip,
  discoverEpsonPrinters,
  verifyPrinterConnection,
  formatPrinterConnectionError,
  isLikelyAudioDevice,
  buildReceiptDocument,
  buildCustomizedReceiptDocument,
  buildDrawerKickDocument,
  resolvePrinter,
  PrintQueueService,
  getActiveReceiptTemplate,
  getOrderScheduleInfo,
  getOrderFulfillmentLabel,
  formatScheduleDisplay,
};
export type { FormattedPrinterError, ReceiptTemplate };

/** Emitted (payload: PrintJobReport) when an AUTOMATIC print fails, so the UI can alert staff. */
export const PRINT_FAILED_EVENT = 'krifoo:auto-print-failed';

const LEGACY_AUTO_PRINT_KEY = '@krifoo_auto_print_thermal';
const AUTO_PRINTED_KEY = '@krifoo_auto_printed_orders';
const AUTO_PRINTED_TTL_MS = 48 * 60 * 60 * 1000;

// ─────────────────────────────────────────────────────────────────────────────
// Auto-print preference — ONE source of truth: the printer config (`autoPrint`).
// ─────────────────────────────────────────────────────────────────────────────

/** Whether automatic printing is enabled (reads the saved printer config). */
export async function isAutoPrintEnabled(restaurantId?: string): Promise<boolean> {
  try {
    const config = await getPosPrinterConfig(restaurantId);
    return config.autoPrint !== false;
  } catch {
    return true;
  }
}

/** Turn automatic printing on or off (saved in the printer config). */
export async function setAutoPrintEnabled(enabled: boolean, restaurantId?: string): Promise<void> {
  await savePosPrinterConfigStrict({ autoPrint: enabled }, restaurantId);
  try {
    // Keep the legacy key consistent for any older code path still reading it
    await AsyncStorage.setItem(LEGACY_AUTO_PRINT_KEY, enabled ? 'true' : 'false');
  } catch {}
}

/** Remembers which orders have already been auto-printed (survives app restarts). */
async function readAutoPrinted(): Promise<Record<string, number>> {
  try {
    const raw = await AsyncStorage.getItem(AUTO_PRINTED_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const now = Date.now();
    const fresh: Record<string, number> = {};
    for (const [id, ts] of Object.entries(parsed || {})) {
      if (typeof ts === 'number' && now - ts < AUTO_PRINTED_TTL_MS) fresh[id] = ts;
    }
    return fresh;
  } catch {
    return {};
  }
}

async function markAutoPrinted(orderKey: string): Promise<void> {
  try {
    const map = await readAutoPrinted();
    map[orderKey] = Date.now();
    await AsyncStorage.setItem(AUTO_PRINTED_KEY, JSON.stringify(map));
  } catch {}
}

/**
 * Resolves any logo URI (remote http/https, file://, content://) into an inline base64 data URI.
 * Times out after 8s so a slow image never blocks printing.
 */
export async function resolveLogoAsBase64(uri?: string): Promise<string> {
  if (!uri || !uri.trim()) return '';
  const clean = uri.trim();
  if (clean.startsWith('data:image/')) return clean;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(clean, { signal: controller.signal });
    clearTimeout(timer);
    const blob = await response.blob();
    return await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : '');
      reader.onerror = () => resolve('');
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.warn('[thermal-print] Could not resolve logo to base64:', err);
    return '';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HTML receipt (system print / AirPrint). Uses the same shared helpers as the
// thermal document so content is identical on every printer.
// ─────────────────────────────────────────────────────────────────────────────

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function generateThermalReceiptHtml(
  order: Partial<Order> & any,
  template: ReceiptTemplate = DEFAULT_RECEIPT_TEMPLATE,
  paperWidth?: '58mm' | '80mm'
): string {
  const layout = template.layout;
  const content = template.content;
  const width = paperWidth || layout.paperWidth || '80mm';
  const fontFamilyCss = '"Courier New", Courier, monospace';
  const fontSizePx = layout.fontSize === 'small' ? '11px' : layout.fontSize === 'large' ? '14px' : '12.5px';
  const lineHeight = layout.lineSpacing === 'compact' ? '1.18' : layout.lineSpacing === 'relaxed' ? '1.55' : '1.35';

  const restaurantName = getRestaurantName(order);
  const restaurantPhone = getRestaurantPhone(order);
  const restaurantAddress = getRestaurantAddressLine(order);
  const customerName = getCustomerName(order);
  const customerPhone = getCustomerPhone(order);
  const { address, postcode } = getDeliveryAddress(order);
  const isDineIn = isDineInOrder(order);
  const tableNum = getTableNumber(order);
  const scheduleInfo = getOrderScheduleInfo(order);
  const fulfillmentLabel = getOrderFulfillmentLabel(order);
  const payment = getPaymentInfo(order);
  const totals = computeReceiptTotals(order, content);
  const notes = getSanitizedOrderNotes(order.notes || order.specialInstructions || '');
  const placed = order.createdAt ? new Date(order.createdAt) : new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const time = `${pad(placed.getHours())}:${pad(placed.getMinutes())}`;
  const placedText =
    content.dateTimeFormat === 'time_only'
      ? time
      : content.dateTimeFormat === 'short'
      ? `${pad(placed.getDate())}/${pad(placed.getMonth() + 1)} ${time}`
      : `${pad(placed.getDate())}/${pad(placed.getMonth() + 1)}/${placed.getFullYear()} ${time}`;
  const badge = isDineIn && content.showTableNumber && tableNum ? 'DINE-IN' : fulfillmentLabel;
  const waiter = order.waiterName || content.serverWaiterName;
  const row = (label: string, value: string) =>
    `<div class="summary-row"><span>${esc(label)}</span><span>${esc(value)}</span></div>`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Receipt ${esc(getDisplayOrderNumber(order))}</title>
  <style>
    @page { size: ${width} auto; margin: 0mm !important; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    html, body { width: 100% !important; max-width: ${width} !important; margin: 0 auto !important; padding: 0 !important; background: #fff; }
    body { font-family: ${fontFamilyCss}; padding: 4mm 3mm 10mm 3mm; color: #000; font-size: ${fontSizePx}; line-height: ${lineHeight}; }
    .header-sec { text-align: ${layout.alignment.header}; margin-bottom: 6px; }
    .footer-sec { text-align: ${layout.alignment.footer}; margin-top: 8px; }
    .title-large { font-size: 1.35em; font-weight: ${layout.boldElements.restaurantName ? '800' : '500'}; }
    .order-banner { background: #000; color: #fff; padding: 6px 8px; text-align: center; font-weight: ${layout.boldElements.orderNumber ? '800' : '600'}; font-size: 1.15em; border-radius: 4px; margin: 6px 0; }
    .divider { border-bottom: 1px dashed #000; margin: 6px 0; }
    .divider-double { border-bottom: 2px solid #000; margin: 6px 0; }
    .item-row { display: flex; justify-content: space-between; gap: 6px; margin-bottom: 3px; font-weight: ${layout.boldElements.itemNames ? '700' : '500'}; ${layout.fontSize === 'large' ? 'font-size: 1.15em;' : ''} }
    .item-notes { font-size: 0.9em; color: #333; padding-left: 28px; margin-bottom: 2px; }
    .summary-row { display: flex; justify-content: space-between; margin-bottom: 2px; }
    .total-row { display: flex; justify-content: space-between; font-size: 1.3em; font-weight: ${layout.boldElements.totalAmount ? '800' : '600'}; margin: 4px 0; }
    .tagline { font-style: ${layout.italicElements.tagline ? 'italic' : 'normal'}; font-size: 0.95em; }
    .footer-msg { font-style: ${layout.italicElements.footerMessage ? 'italic' : 'normal'}; font-weight: 700; margin-bottom: 6px; }
    .center { text-align: center; }
  </style>
</head>
<body>
  <div class="header-sec">
    ${content.showLogo && content.logoUrl && content.logoUrl.startsWith('data:image/') ? `<img src="${content.logoUrl}" style="max-width:40%;max-height:70px;margin-bottom:4px;" />` : ''}
    ${content.customHeaderTitle ? `<div style="font-weight:800;letter-spacing:0.5px;">${esc(content.customHeaderTitle.toUpperCase())}</div>` : ''}
    ${content.showRestaurantName ? `<div class="title-large">${esc(restaurantName.toUpperCase())}</div>` : ''}
    ${content.headerMessage ? `<div class="tagline">${esc(content.headerMessage)}</div>` : ''}
    ${content.showAddress && restaurantAddress ? `<div>${esc(restaurantAddress)}</div>` : ''}
    ${content.showPhone && restaurantPhone ? `<div>Tel: ${esc(restaurantPhone)}</div>` : ''}
    ${content.showTaxId && content.taxIdValue?.trim() ? `<div style="font-size:0.9em;">${esc(content.taxIdLabel || 'VAT Reg No:')} ${esc(content.taxIdValue.trim())}</div>` : ''}
  </div>
  <div class="divider"></div>

  ${content.showOrderNumber ? `<div class="order-banner">ORDER ${esc(getDisplayOrderNumber(order))}</div>` : ''}
  ${content.showDateTime ? `<div class="center" style="font-size:0.9em;">Placed: ${esc(placedText)}</div>` : ''}
  <div class="center" style="font-weight:700;margin:2px 0;">[ ${esc(badge)} ]</div>
  ${
    content.showScheduledTime !== false && scheduleInfo.isScheduled && scheduleInfo.scheduleTimeText
      ? `<div style="background:#000;color:#fff;text-align:center;font-weight:900;padding:6px 8px;border-radius:4px;margin:6px 0;">
           <div>*** SCHEDULED ${esc(fulfillmentLabel)} ***</div>
           <div style="font-size:1.15em;margin-top:3px;">TARGET: ${esc(scheduleInfo.scheduleTimeText.toUpperCase())}</div>
         </div>`
      : ''
  }
  ${content.showTableNumber && tableNum ? `<div class="center" style="font-weight:800;">TABLE: ${esc(tableNum.toUpperCase())}</div>` : ''}
  ${content.showServerWaiterName && waiter && String(waiter).trim() ? `<div class="center" style="font-size:0.9em;">Server: ${esc(waiter)}</div>` : ''}

  ${
    content.showCustomerInfo
      ? `<div class="divider"></div>
  <div>
    <div style="font-weight:${layout.boldElements.customerDetails ? '700' : '500'};">Customer: ${esc(customerName)}</div>
    ${customerPhone && !isDummyCustomerPhone(customerPhone, restaurantPhone) ? `<div>Phone: ${esc(customerPhone)}</div>` : ''}
    ${address ? `<div>Address: ${esc(address)}</div>` : ''}
    ${postcode ? `<div style="font-weight:700;">Postcode: ${esc(postcode)}</div>` : ''}
  </div>`
      : ''
  }
  <div class="divider"></div>

  <div>
    <div style="display:flex;justify-content:space-between;font-weight:800;font-size:0.95em;border-bottom:1px solid #000;padding-bottom:3px;margin-bottom:4px;">
      <span style="width:28px;">QTY</span><span style="flex:1;">ITEM</span><span>PRICE</span>
    </div>
    ${getOrderItems(order)
      .map((item: any) => {
        const instructions = getItemInstructions(item);
        return `
      <div class="item-row">
        <span style="width:28px;">${esc(getItemQuantity(item))}x</span>
        <span style="flex:1;">${esc(getItemName(item))}</span>
        <span style="white-space:nowrap;">${esc(formatMoney(getItemPrice(item)))}</span>
      </div>
      ${getItemOptionsList(item).map((opt: string) => `<div class="item-notes">+ ${esc(opt)}</div>`).join('')}
      ${content.showItemNotes && instructions ? `<div class="item-notes">* Note: ${esc(instructions)}</div>` : ''}`;
      })
      .join('')}
  </div>
  <div class="divider"></div>

  <div>
    ${totals.subtotal > 0 ? row('Subtotal', formatMoney(totals.subtotal)) : ''}
    ${totals.deliveryFee > 0 ? row('Delivery Fee', formatMoney(totals.deliveryFee)) : ''}
    ${totals.onlinePaymentFee > 0 ? row('Card / Online Fee', formatMoney(totals.onlinePaymentFee)) : ''}
    ${totals.handlingCharge > 0 ? row('Handling Charge', formatMoney(totals.handlingCharge)) : ''}
    ${totals.platformFee > 0 ? row('Service Fee', formatMoney(totals.platformFee)) : ''}
    ${totals.tax > 0 ? row(content.showItemTaxBreakdown && (content.taxPercentage ?? 20) > 0 ? `Tax / VAT (${content.taxPercentage ?? 20}%)` : 'Tax / VAT', formatMoney(totals.tax)) : ''}
    ${totals.tip > 0 ? row('Tip', formatMoney(totals.tip)) : ''}
    ${content.showDiscountLine && totals.discount > 0 ? row('Discount', formatMoney(-totals.discount)) : ''}
    <div class="divider-double"></div>
    <div class="total-row"><span>TOTAL</span><span>${esc(formatMoney(totals.total))}</span></div>
    ${totals.includedVat ? row(totals.includedVat.label, formatMoney(totals.includedVat.amount)) : ''}
    <div class="divider-double"></div>
    ${content.showPaymentMethod ? `<div class="center" style="font-weight:700;margin:4px 0;">PAYMENT: ${esc(payment.label)}</div>` : ''}
  </div>

  ${notes ? `<div class="divider"></div><div style="font-weight:700;font-size:0.95em;">NOTE: ${esc(notes)}</div>` : ''}

  <div class="footer-sec">
    ${content.footerMessage ? `<div class="footer-msg">${esc(content.footerMessage)}</div>` : ''}
    ${
      content.showQrCode && content.qrCodeData?.trim()
        ? `<div class="center" style="margin:8px 0;">
      <img src="https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(content.qrCodeData.trim())}" style="width:90px;height:90px;display:block;margin:0 auto 4px auto;" />
      ${content.qrCodeLabel ? `<div style="font-size:0.85em;font-weight:600;">${esc(content.qrCodeLabel)}</div>` : ''}
      <div style="font-size:0.75em;">${esc(content.qrCodeData.trim())}</div>
    </div>`
        : ''
    }
  </div>
</body>
</html>`;
}

/** @deprecated use generateThermalReceiptHtml(order, template) */
export const generateCustomizedThermalReceiptHtml = (order: any, template: ReceiptTemplate) =>
  generateThermalReceiptHtml(order, template);

// ─────────────────────────────────────────────────────────────────────────────
// Printing
// ─────────────────────────────────────────────────────────────────────────────

const POINTS_PER_WIDTH = { '80mm': 227, '58mm': 164 } as const;

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
  driverUsed: 'sunmi_aidl' | 'epson_epos' | 'network_escpos' | 'bluetooth' | 'system_spooler' | 'none';
  driverLabel: string;
  copies: number;
  copiesPrinted: number;
  success: boolean;
  /** True when nothing was sent because it was not needed (auto-print off, already printed, ...). */
  skipped?: boolean;
  durationMs: number;
  timestamp: string;
  error?: string;
}

let lastPrintJobReport: PrintJobReport | null = null;
const reportsByOrder = new Map<string, PrintJobReport>();
const inFlight = new Map<string, Promise<boolean>>();

/** Report for the most recent print, or for a specific order when an id is given. */
export function getLastPrintJobReport(orderId?: string): PrintJobReport | null {
  if (orderId) return reportsByOrder.get(String(orderId)) || null;
  return lastPrintJobReport;
}

function storeReport(report: PrintJobReport) {
  lastPrintJobReport = report;
  reportsByOrder.set(report.orderId, report);
  if (reportsByOrder.size > 200) {
    const oldest = reportsByOrder.keys().next().value;
    if (oldest) reportsByOrder.delete(oldest);
  }
}

/** Fills in the store name/phone/address on a COPY of the order when the order doesn't carry them. */
async function withStoreDetails(order: any): Promise<any> {
  const copy = { ...order };
  if (copy.restaurantName || (typeof copy.restaurantId === 'object' && copy.restaurantId?.restaurantName)) return copy;

  let cached = getCachedStoreProfile();
  if (!cached?.restaurantName) {
    try {
      const { restaurantOwnerService } = require('./restaurant-owner.service');
      const ownerRes = await restaurantOwnerService.getRestaurantProfile();
      if (ownerRes?.success && ownerRes.data?.restaurantName) {
        cached = {
          restaurantName: ownerRes.data.restaurantName,
          phoneNumber: ownerRes.data.phoneNumber,
          address: formatRestaurantAddress(ownerRes.data.address),
        };
        setCachedStoreProfile(cached);
      }
    } catch {
      // ignore — receipt prints with "Restaurant"
    }
  }
  if (cached?.restaurantName) {
    copy.restaurantName = cached.restaurantName;
    copy.restaurantPhone = copy.restaurantPhone || cached.phoneNumber;
    copy.restaurantAddress = copy.restaurantAddress || cached.address;
  }
  return copy;
}

function driverFor(connectionType: string): PrintJobReport['driverUsed'] {
  if (connectionType === 'builtin') return 'sunmi_aidl';
  if (connectionType === 'network_epos') return 'epson_epos';
  if (connectionType === 'network_raw') return 'network_escpos';
  if (connectionType === 'ble' || connectionType === 'spp') return 'bluetooth';
  if (connectionType === 'system') return 'system_spooler';
  return 'none';
}

/**
 * Print an order on the configured printer.
 *
 * - Manual prints (`isManual`) may fall back to the OS print dialog if the printer fails.
 * - Automatic prints never fall back to a dialog; failures emit PRINT_FAILED_EVENT instead.
 *   (The only dialog an auto-print can open is when "System print" IS the chosen printer.)
 * - Each order is auto-printed once (remembered across restarts), at the configured trigger.
 * - Concurrent calls for the same order share one print job.
 *
 * @param trigger which event caused an automatic print ('new_order' | 'accepted').
 *                Ignored for manual prints.
 */
export function printThermalReceipt(
  order: Partial<Order> & any,
  isManual: boolean = false,
  customTemplate?: ReceiptTemplate,
  configOverride?: Partial<PosPrinterConfig>,
  trigger?: AutoPrintTrigger
): Promise<boolean> {
  const orderKey = String(order?._id || order?.id || order?.orderNumber || '');
  const flightKey = `${orderKey}|${isManual ? 'm' : 'a'}`;
  if (orderKey && inFlight.has(flightKey)) return inFlight.get(flightKey)!;

  const job = runPrintJob(order, isManual, customTemplate, configOverride, trigger).finally(() => {
    inFlight.delete(flightKey);
  });
  if (orderKey) inFlight.set(flightKey, job);
  return job;
}

async function runPrintJob(
  rawOrder: Partial<Order> & any,
  isManual: boolean,
  customTemplate?: ReceiptTemplate,
  configOverride?: Partial<PosPrinterConfig>,
  trigger?: AutoPrintTrigger
): Promise<boolean> {
  const startTime = Date.now();
  const orderNum = getDisplayOrderNumber(rawOrder);
  const orderId = String(rawOrder?._id || rawOrder?.id || orderNum);
  const items = getOrderItems(rawOrder);
  const totalAmount = computeReceiptTotals(rawOrder).total;

  const baseReport = {
    orderId,
    orderNumber: orderNum,
    orderStatus: String(rawOrder?.status || 'unknown'),
    customerName: getCustomerName(rawOrder),
    totalAmount: formatMoney(totalAmount),
    itemCount: items.length,
    trigger: (isManual ? 'manual_click' : 'auto_print') as PrintJobReport['trigger'],
  };

  const finish = (partial: Partial<PrintJobReport> & Pick<PrintJobReport, 'success'>): boolean => {
    const report: PrintJobReport = {
      ...baseReport,
      brand: 'unknown',
      connectionType: 'unknown',
      targetAddress: 'unknown',
      driverUsed: 'none',
      driverLabel: 'None',
      copies: 0,
      copiesPrinted: 0,
      durationMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
      ...partial,
    };
    storeReport(report);
    if (!report.success && !report.skipped && !isManual && report.error !== 'Print cancelled.') {
      DeviceEventEmitter.emit(PRINT_FAILED_EVENT, report);
    }
    console.log(
      `[Print] ${orderNum} ${report.trigger} → ${report.skipped ? 'SKIPPED' : report.success ? 'PRINTED' : 'FAILED'}` +
        ` (${report.driverLabel}, ${report.copiesPrinted}/${report.copies} copies, ${report.durationMs}ms)` +
        (report.error ? ` — ${report.error}` : '')
    );
    return report.success;
  };

  try {
    const restId = typeof rawOrder?.restaurantId === 'object' ? rawOrder.restaurantId?._id : rawOrder?.restaurantId || rawOrder?.restaurant;
    const baseConfig = await getPosPrinterConfig(restId ? String(restId) : undefined);
    const config: PosPrinterConfig = { ...baseConfig, ...(configOverride || {}) };
    const configInfo = {
      brand: config.brand,
      connectionType: config.connectionType,
      targetAddress:
        config.connectionType === 'network'
          ? `${config.ipAddress}:${config.port}`
          : config.connectionType === 'bluetooth'
          ? config.deviceName || config.macAddress || config.target || 'bluetooth'
          : config.connectionType,
    };

    // Automatic print rules
    if (!isManual) {
      if (config.autoPrint === false) {
        return finish({ ...configInfo, success: false, skipped: true, driverLabel: 'Auto-print disabled', error: 'Auto-print is turned off' });
      }
      const wanted = config.autoPrintTrigger || 'new_order';
      if (trigger && trigger !== wanted) {
        return finish({ ...configInfo, success: false, skipped: true, driverLabel: `Auto-print runs on ${wanted}` });
      }
      const printed = await readAutoPrinted();
      if (printed[orderId]) {
        return finish({ ...configInfo, success: true, skipped: true, driverLabel: 'Already printed automatically' });
      }
    }

    // Work on copies — never mutate the caller's order (React state) or a cached template
    const order = await withStoreDetails(rawOrder);
    let template = cloneTemplate(customTemplate || (await getActiveReceiptTemplate(restId ? String(restId) : undefined)));
    // Paper width is a property of the printer hardware
    template.layout.paperWidth = config.paperWidth;

    if (template.content.showLogo && template.content.logoUrl && !template.content.logoUrl.startsWith('data:image/')) {
      const logo = await resolveLogoAsBase64(template.content.logoUrl);
      template = { ...template, content: { ...template.content, logoUrl: logo, showLogo: Boolean(logo) } };
    }

    const copies = Math.max(1, Math.min(5, config.copies || 1));
    const profile = profileFromConfig(config);
    let copiesPrinted = 0;
    let printError: string | undefined;
    let driverUsed: PrintJobReport['driverUsed'] = 'none';
    let driverLabel = 'None';

    // 1. Configured hardware printer
    if (profile && profile.connectionType !== 'system') {
      const printer = resolvePrinter(profile, {
        brand: config.brand,
        paperWidth: config.paperWidth,
        orderContext: order,
        configContext: config,
        templateContext: template,
      });
      driverUsed = driverFor(profile.connectionType);
      driverLabel = printer.model;
      const doc = buildCustomizedReceiptDocument(order, config, template);

      for (let copy = 1; copy <= copies; copy++) {
        // Only the first copy opens the cash drawer
        const copyDoc = copy === 1 ? doc : doc.filter((c) => c.type !== 'drawer');
        const result = await PrintQueueService.enqueuePrintJob(printer, copyDoc, config, `Order_${orderNum}_c${copy}`);
        if (!result.success) {
          printError = result.detail || `Printer error (${result.reason})`;
          break;
        }
        copiesPrinted++;
      }
    } else if (!profile) {
      printError = 'No printer is set up. Open Printer Settings to connect one.';
    }

    const hardwareOk = copiesPrinted === copies;

    // 2. OS print dialog — only when someone tapped Print (never for unattended auto-print),
    //    or when the restaurant chose "System print" as its printer.
    const isSystemPrinter = profile?.connectionType === 'system';
    if (!hardwareOk && (isSystemPrinter || isManual)) {
      const hardwareError = printError;
      // System printer: one dialog per copy. Fallback after a hardware failure: one dialog only.
      const dialogs = isSystemPrinter ? copies : 1;
      const html = generateThermalReceiptHtml(order, template, config.paperWidth);
      let dialogsPrinted = 0;
      try {
        for (let i = 0; i < dialogs; i++) {
          const outcome = await printHtmlWithSystemDialog(html, POINTS_PER_WIDTH[config.paperWidth] || 227);
          if (outcome === 'cancelled') {
            return finish({
              ...configInfo,
              success: false,
              driverUsed: 'system_spooler',
              driverLabel: 'System print (AirPrint / Android)',
              copies,
              copiesPrinted: dialogsPrinted,
              error: 'Print cancelled.',
            });
          }
          dialogsPrinted++;
        }
        return finish({
          ...configInfo,
          success: true,
          driverUsed: 'system_spooler',
          driverLabel: hardwareError ? `System print (printer failed: ${hardwareError})` : 'System print (AirPrint / Android)',
          copies,
          copiesPrinted: isSystemPrinter ? dialogsPrinted : copies,
          error: hardwareError,
        });
      } catch (spoolerErr: any) {
        printError = spoolerErr?.message || hardwareError || 'System print failed';
        driverUsed = 'system_spooler';
      }
    }

    if (hardwareOk && !isManual) await markAutoPrinted(orderId);

    return finish({
      ...configInfo,
      success: hardwareOk,
      driverUsed,
      driverLabel,
      copies,
      copiesPrinted,
      error: hardwareOk ? undefined : copiesPrinted > 0 ? `Printed ${copiesPrinted} of ${copies} copies. ${printError || ''}`.trim() : printError,
    });
  } catch (error: any) {
    return finish({ success: false, error: error?.message || String(error) });
  }
}

/**
 * Print a sample test receipt using the active template.
 */
export async function printSampleThermalReceipt(
  restaurantId?: string,
  configOverride?: Partial<PosPrinterConfig>
): Promise<boolean> {
  const template = await getActiveReceiptTemplate(restaurantId);
  return printTestReceiptTemplate(template, restaurantId, undefined, configOverride);
}

/**
 * Pulse the cash drawer (no receipt printed).
 */
export async function openCashDrawer(restaurantId?: string): Promise<boolean> {
  try {
    const config = await getPosPrinterConfig(restaurantId);
    const profile = profileFromConfig(config);
    if (!profile || profile.connectionType === 'system') return false;

    const printer = resolvePrinter(profile, {
      brand: config.brand,
      paperWidth: config.paperWidth,
      mode: 'drawer', // Sunmi: opens the drawer instead of printing
    });
    const res = await PrintQueueService.enqueuePrintJob(printer, buildDrawerKickDocument(1), config, 'Drawer_Kick');
    return res.success;
  } catch (err) {
    console.error('[Cash Drawer] Failed to kick drawer:', err);
    return false;
  }
}

/**
 * Print a test receipt with a specific template (e.g. while editing it).
 * Uses the printer's paper width and never kicks the cash drawer.
 */
export async function printTestReceiptTemplate(
  template: ReceiptTemplate,
  restaurantId?: string,
  storeNameOverride?: string,
  configOverride?: Partial<PosPrinterConfig>
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
          resolvedAddress = formatRestaurantAddress(res.data.address) || resolvedAddress;
        }
      }
      if (!resolvedStoreName) {
        const { restaurantOwnerService } = require('./restaurant-owner.service');
        const ownerRes = await restaurantOwnerService.getRestaurantProfile();
        if (ownerRes?.success && ownerRes.data?.restaurantName) {
          resolvedStoreName = ownerRes.data.restaurantName;
          resolvedPhone = ownerRes.data.phoneNumber || resolvedPhone;
          resolvedAddress = formatRestaurantAddress(ownerRes.data.address) || resolvedAddress;
          setCachedStoreProfile({ restaurantName: resolvedStoreName, phoneNumber: resolvedPhone, address: resolvedAddress });
        }
      }
    } catch (e) {
      console.warn('[printTestReceiptTemplate] Could not fetch store profile:', e);
    }
  }

  const sampleOrder = getSampleOrderForPreview(template.content.showTableNumber ? 'dine_in' : 'delivery', resolvedStoreName);
  sampleOrder._id = `test_${Date.now()}`; // unique, so repeated test prints are never de-duplicated
  if (resolvedStoreName) {
    const formattedAddr = formatRestaurantAddress(resolvedAddress);
    sampleOrder.restaurantId = {
      _id: restaurantId || 'rest_001',
      restaurantName: resolvedStoreName,
      phoneNumber: resolvedPhone || '',
      address: formattedAddr,
      formattedAddress: formattedAddr,
    };
    sampleOrder.restaurantName = resolvedStoreName;
    sampleOrder.restaurantAddress = formattedAddr;
  }

  return printThermalReceipt(sampleOrder, true, template, { ...configOverride, openCashDrawer: false });
}

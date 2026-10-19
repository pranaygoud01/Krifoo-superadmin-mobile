import { Order } from '../../types';
import { PosPrinterConfig, profileFromConfig } from '../pos-config.service';
import { EpsonEposModule } from '../../src/modules/epson-epos';
import { buildReceiptDocument, buildDrawerKickDocument, buildCustomizedReceiptDocument } from './receipt-document';
import { EposXmlEncoder } from './encoders/epos-xml-encoder';
import { resolvePrinter } from './printer-registry';
import { PrintQueueService } from './print-queue.service';
import {
  getActiveReceiptTemplate,
  ReceiptTemplate,
  getSampleOrderForPreview,
  getCachedStoreProfile,
  formatRestaurantAddress,
} from '../receipt-customization.service';

/**
 * Generate official Epson ePOS-Print XML payload from order using Layer 1 & 2 encoders
 */
export function buildEpsonEposXml(order: Partial<Order> & any, config: PosPrinterConfig, template?: ReceiptTemplate): string {
  const doc = template ? buildCustomizedReceiptDocument(order, config, template) : buildReceiptDocument(order, config);
  return EposXmlEncoder.encode(doc, config);
}

/**
 * Discover available Epson Bluetooth & Network printers
 */
export async function discoverEpsonPrinters(): Promise<
  Array<{ id: string; name: string; connectionType: 'bluetooth' | 'network'; target?: string; ipAddress?: string; macAddress?: string }>
> {
  const discovered: Array<any> = [];

  // 1. Discover via PosPrinter (react-native-thermal-pos-printer) native driver
  try {
    const { NativeModules } = require('react-native');
    const PosPrinter = NativeModules?.PosPrinter;
    if (PosPrinter && typeof PosPrinter.getDeviceList === 'function') {
      const btDevices = await PosPrinter.getDeviceList();
      if (Array.isArray(btDevices)) {
        for (const dev of btDevices) {
          discovered.push({
            id: dev.address || `bt_${dev.name}`,
            name: dev.name || 'Bluetooth Thermal Printer',
            connectionType: 'bluetooth' as const,
            target: dev.address,
            macAddress: dev.address,
          });
        }
      }
    }
  } catch (e) {
    console.warn('[PosPrinter] Bluetooth scan error:', e);
  }

  // 2. Discover via react-native-bluetooth-classic if available
  try {
    const RNBluetoothClassic =
      require('react-native-bluetooth-classic').default || require('react-native-bluetooth-classic');
    if (RNBluetoothClassic && typeof RNBluetoothClassic.getBondedDevices === 'function') {
      const bonded = await RNBluetoothClassic.getBondedDevices();
      if (Array.isArray(bonded)) {
        for (const b of bonded) {
          if (!discovered.some((d) => d.target === b.address)) {
            discovered.push({
              id: b.address,
              name: b.name || 'Paired Bluetooth Printer',
              connectionType: 'bluetooth' as const,
              target: b.address,
              macAddress: b.address,
            });
          }
        }
      }
    }
  } catch {}

  // 3. Fallback to EpsonEposModule discovery
  try {
    const btDevices = await EpsonEposModule.discoverBluetoothPrinters();
    discovered.push(...btDevices);
  } catch (e) {
    console.warn('[Epson SDK] Bluetooth scan error:', e);
  }
  try {
    const lanDevices = await EpsonEposModule.discoverNetworkPrinters();
    discovered.push(...lanDevices);
  } catch (e) {
    console.warn('[Epson SDK] Network scan error:', e);
  }

  return discovered;
}

/**
 * Send print request to Epson TM-series printer using the layered architecture pipeline.
 */
export async function printEpsonOrderReceipt(
  order: Partial<Order> & any,
  config: PosPrinterConfig,
  template?: ReceiptTemplate
): Promise<boolean> {
  const profile = profileFromConfig(config);
  if (!profile) {
    console.warn('[Epson SDK] Cannot print: Missing connection profile or IP/target address.');
    return false;
  }

  const restId = typeof order.restaurantId === 'object' ? order.restaurantId?._id : (order.restaurantId || order.restaurant);
  const activeTemplate = template || (await getActiveReceiptTemplate(restId ? String(restId) : undefined));

  const printer = resolvePrinter(profile, { brand: config.brand, paperWidth: config.paperWidth });
  const doc = buildCustomizedReceiptDocument(order, config, activeTemplate);
  const orderNum = order.orderNumber || (order._id ? order._id.slice(-5).toUpperCase() : 'Order');

  const result = await PrintQueueService.enqueuePrintJob(
    printer,
    doc,
    config,
    `Epson_#${orderNum}`
  );

  return result.success;
}

/**
 * Test printer hardware by rendering and printing the current Receipt Template.
 * Fully formats the sample order, store header, items, tax breakdown, and footer.
 */
export async function testEpsonPrinter(
  config: PosPrinterConfig,
  restaurantId?: string,
  customTemplate?: ReceiptTemplate
): Promise<{ success: boolean; message: string }> {
  const profile = profileFromConfig(config);
  if (!profile) {
    return {
      success: false,
      message: 'Printer connection target is not configured. Please select or enter an address.',
    };
  }

  // 1. Fetch current active receipt template and apply selected paper roll width preference
  const baseTemplate = customTemplate || (await getActiveReceiptTemplate(restaurantId));
  const template: ReceiptTemplate = {
    ...baseTemplate,
    layout: {
      ...baseTemplate.layout,
      paperWidth: config.paperWidth || baseTemplate.layout?.paperWidth || '80mm',
    },
  };

  // 2. Resolve store profile details (restaurant name, phone, address)
  let resolvedStoreName = getCachedStoreProfile()?.restaurantName;
  let resolvedPhone = getCachedStoreProfile()?.phoneNumber;
  let resolvedAddress = getCachedStoreProfile()?.address;

  if (!resolvedStoreName && restaurantId) {
    try {
      const { restaurantService } = require('../restaurant.service');
      const res = await restaurantService.getRestaurantById(restaurantId);
      if (res?.success && res.data?.restaurantName) {
        resolvedStoreName = res.data.restaurantName;
        resolvedPhone = res.data.phoneNumber || resolvedPhone;
        resolvedAddress = formatRestaurantAddress(res.data.address) || resolvedAddress;
      }
    } catch (err) {
      console.warn('[testEpsonPrinter] Could not fetch restaurant profile:', err);
    }
  }

  if (!resolvedStoreName) {
    try {
      const { restaurantOwnerService } = require('../restaurant-owner.service');
      const ownerRes = await restaurantOwnerService.getRestaurantProfile();
      if (ownerRes?.success && ownerRes.data?.restaurantName) {
        resolvedStoreName = ownerRes.data.restaurantName;
        resolvedPhone = ownerRes.data.phoneNumber || resolvedPhone;
        resolvedAddress = formatRestaurantAddress(ownerRes.data.address) || resolvedAddress;
      }
    } catch (err) {
      console.warn('[testEpsonPrinter] Could not fetch owner profile:', err);
    }
  }

  // 3. Generate high-fidelity sample order matching current template settings
  const sampleOrder = getSampleOrderForPreview(
    template.content?.showTableNumber ? 'dine_in' : 'delivery',
    resolvedStoreName || 'Krifoo Kitchen'
  );

  if (resolvedStoreName) {
    sampleOrder.restaurantName = resolvedStoreName;
    sampleOrder.restaurantAddress = resolvedAddress || '';
    if (typeof sampleOrder.restaurantId === 'object') {
      sampleOrder.restaurantId.restaurantName = resolvedStoreName;
      sampleOrder.restaurantId.phoneNumber = resolvedPhone || '';
      sampleOrder.restaurantId.address = resolvedAddress || '';
    }
  }

  // If cash drawer is enabled, test drawer kick signal
  if (config.openCashDrawer) {
    sampleOrder.paymentType = 'Cash';
  }

  // 4. Build customized receipt document commands (respects autoCut, paperWidth, and drawer)
  const testDoc = buildCustomizedReceiptDocument(sampleOrder, config, template);

  // 5. Generate thermal HTML for System Spooler / AirPrint
  let htmlContent: string | undefined;
  try {
    const { generateThermalReceiptHtml } = require('../thermal-print.service');
    if (typeof generateThermalReceiptHtml === 'function') {
      htmlContent = generateThermalReceiptHtml(sampleOrder, template);
    }
  } catch (err) {
    console.warn('[testEpsonPrinter] Could not generate thermal receipt HTML:', err);
  }

  // 6. Resolve printer with complete context (paper width, template, and html)
  const printer = resolvePrinter(profile, {
    brand: config.brand,
    paperWidth: config.paperWidth,
    orderContext: sampleOrder,
    configContext: config,
    templateContext: template,
    htmlContent,
  });

  // 7. Enqueue print job(s) respecting number of copies preference
  const copies = Math.max(1, config.copies || 1);
  for (let copy = 1; copy <= copies; copy++) {
    const result = await PrintQueueService.enqueuePrintJob(
      printer,
      testDoc,
      config,
      `ReceiptTemplate_Test_c${copy}`
    );

    if (!result.success) {
      return {
        success: false,
        message: result.detail || `Test print failed (${result.reason}). Check printer connection or paper roll.`,
      };
    }
  }

  return {
    success: true,
    message: `Successfully printed ${copies} ${copies > 1 ? 'copies' : 'copy'} of test receipt (${config.paperWidth}) to ${printer.model}.`,
  };
}

/**
 * Send manual Cash Drawer kickout signal without creating a fake dummy order.
 * Structurally fixes Bug #8.
 */
export async function openEpsonCashDrawer(config: PosPrinterConfig): Promise<boolean> {
  const profile = profileFromConfig(config);
  if (!profile) {
    console.warn('[Epson Drawer] Cannot kick drawer: Missing connection profile.');
    return false;
  }

  const printer = resolvePrinter(profile, { brand: config.brand, paperWidth: config.paperWidth });
  const kickDoc = buildDrawerKickDocument(1);

  const result = await PrintQueueService.enqueuePrintJob(
    printer,
    kickDoc,
    config,
    'Drawer_Kick_Pulse'
  );

  return result.success;
}

/**
 * Print a hardware alignment and column calibration test slip
 */
export async function testPrinterAlignmentSlip(
  config: PosPrinterConfig
): Promise<{ success: boolean; message: string }> {
  const profile = profileFromConfig(config);
  if (!profile) {
    return {
      success: false,
      message: 'Printer is not configured. Please select or pair a printer first.',
    };
  }

  const printer = resolvePrinter(profile, { brand: config.brand, paperWidth: config.paperWidth });
  const is80 = config.paperWidth === '80mm';
  const cols = is80 ? 48 : 32;

  const rulerLine = is80
    ? '01--------10--------20--------30--------40----48'
    : '01--------10--------20--------32';

  const testDoc = [
    { type: 'text' as const, value: 'HARDWARE CALIBRATION SLIP', bold: true, align: 'center' as const, size: 'double' as const },
    { type: 'line' as const },
    { type: 'text' as const, value: `Width Mode: ${config.paperWidth} (${cols} Columns)`, bold: true, align: 'center' as const },
    { type: 'text' as const, value: `Interface: ${profile.connectionType.toUpperCase()}`, align: 'center' as const },
    { type: 'text' as const, value: `Date: ${new Date().toLocaleString('en-GB')}`, align: 'center' as const },
    { type: 'line' as const },
    { type: 'text' as const, value: 'RULER ALIGNMENT CHECK:', bold: true },
    { type: 'text' as const, value: rulerLine, bold: true },
    { type: 'text' as const, value: '(Line must fit completely without wrapping)', align: 'center' as const },
    { type: 'line' as const },
    { type: 'text' as const, value: 'PRICE RIGHT-ALIGNMENT CHECK:', bold: true },
    {
      type: 'table' as const,
      cols: is80 ? [5, 31, 12] : [4, 18, 10],
      aligns: ['left' as const, 'left' as const, 'right' as const],
      rows: [
        ['1x', 'Margherita Pizza 12"', '£12.50'],
        ['2x', 'Crispy Wings (6pcs)', '£15.00'],
      ],
    },
    { type: 'line' as const },
    {
      type: 'table' as const,
      cols: is80 ? [28, 20] : [18, 14],
      aligns: ['left' as const, 'right' as const],
      rows: [
        ['Subtotal:', '£27.50'],
        ['TOTAL:', '£27.50'],
      ],
    },
    { type: 'line' as const },
    { type: 'text' as const, value: 'CALIBRATION PASSED [OK]', bold: true, align: 'center' as const },
    { type: 'feed' as const, lines: 3 },
    { type: 'cut' as const, mode: 'partial' as const },
  ];

  const result = await PrintQueueService.enqueuePrintJob(
    printer,
    testDoc as any,
    config,
    'Alignment_Test'
  );

  return {
    success: result.success,
    message: result.success
      ? `Calibration slip printed on ${config.paperWidth} (${cols} columns).`
      : result.detail || 'Failed transmitting calibration slip to printer.',
  };
}

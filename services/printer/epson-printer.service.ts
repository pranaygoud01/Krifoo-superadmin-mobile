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

export interface FormattedPrinterError {
  title: string;
  message: string;
  troubleshootingSteps: string[];
  isLikelyNonPrinter: boolean;
}

const NON_PRINTER_AUDIO_KEYWORDS = [
  'rockerz',
  'airpod',
  'earbud',
  'headphone',
  'headset',
  'earphone',
  'soundbar',
  'speaker',
  'handsfree',
  'smartwatch',
  'smart watch',
  'watch',
  'band',
  'fitbit',
  'car media',
  'car audio',
  'echo dot',
  'nest mini',
  'buds',
  'tws',
  'soundcore',
  'realme buds',
  'oneplus bullets',
  'boult',
  'mivi',
  'noise',
];

export function isLikelyAudioDevice(name: string): boolean {
  if (!name) return false;
  const n = name.toLowerCase();
  return NON_PRINTER_AUDIO_KEYWORDS.some((kw) => n.includes(kw));
}

export function formatPrinterConnectionError(rawError: string, deviceName?: string): FormattedPrinterError {
  const name = (deviceName || '').trim();
  const lowerErr = (rawError || '').toLowerCase();

  const isAudio = isLikelyAudioDevice(name);

  if (isAudio) {
    return {
      title: 'Not a POS Receipt Printer',
      message: `"${name}" is a Bluetooth audio accessory (headphones/speaker) and does not support thermal receipt printing.`,
      troubleshootingSteps: [
        'Please tap "Choose Different Printer" below to select your POS receipt printer.',
        'If your thermal printer is not listed, make sure its power switch is ON and it is paired in your tablet Bluetooth settings (PIN: 0000 or 1234).',
      ],
      isLikelyNonPrinter: true,
    };
  }

  if (
    lowerErr.includes('socket might closed') ||
    lowerErr.includes('read ret: -1') ||
    lowerErr.includes('broken pipe') ||
    lowerErr.includes('connection reset') ||
    lowerErr.includes('connection refused')
  ) {
    return {
      title: 'Printer Not Responding',
      message: `Could not establish communication with "${name || 'thermal printer'}". The printer may be turned OFF, sleeping, or out of range.`,
      troubleshootingSteps: [
        'Check that the printer power switch is ON and the power LED is green.',
        'Ensure the thermal paper roll is loaded and the printer lid is fully locked.',
        'Make sure no other tablet, phone, or POS app is currently connected (Bluetooth thermal printers only accept 1 device at a time).',
        'Keep your tablet within 5 meters of the printer and try again.',
      ],
      isLikelyNonPrinter: false,
    };
  }

  if (lowerErr.includes('bluetooth is disabled') || lowerErr.includes('bluetooth_disabled')) {
    return {
      title: 'Bluetooth is Switched Off',
      message: 'Bluetooth is currently disabled on this tablet.',
      troubleshootingSteps: [
        'Turn ON Bluetooth in your device quick settings tray.',
        'Tap "Retry Link" to reconnect.',
      ],
      isLikelyNonPrinter: false,
    };
  }

  if (lowerErr.includes('not found') || lowerErr.includes('not paired') || lowerErr.includes('bonded')) {
    return {
      title: 'Printer Not Paired',
      message: `"${name || 'The printer'}" is not paired with this tablet.`,
      troubleshootingSteps: [
        'Open Bluetooth Settings on your tablet.',
        'Select your thermal printer to pair (default PIN is usually 0000 or 1234).',
        'Return here and tap "Retry Link".',
      ],
      isLikelyNonPrinter: false,
    };
  }

  if (lowerErr.includes('permission') || lowerErr.includes('nearby')) {
    return {
      title: 'Bluetooth Permission Required',
      message: 'Android requires "Nearby devices" permission to communicate with Bluetooth printers.',
      troubleshootingSteps: [
        'Go to Settings > Apps > Krifoo Admin > Permissions and allow "Nearby devices".',
      ],
      isLikelyNonPrinter: false,
    };
  }

  return {
    title: 'Connection Handshake Failed',
    message: `Unable to establish communication with "${name || 'printer'}".`,
    troubleshootingSteps: [
      'Check that the printer is powered ON and has paper loaded.',
      'Verify the printer is paired in tablet Bluetooth settings.',
      'Turn the printer power switch OFF and back ON, then tap "Retry Link".',
    ],
    isLikelyNonPrinter: false,
  };
}

/**
 * Discover available Epson Bluetooth & Network printers
 */
export async function discoverEpsonPrinters(): Promise<
  Array<{ id: string; name: string; connectionType: 'bluetooth' | 'network'; target?: string; ipAddress?: string; macAddress?: string }>
> {
  const discovered: Array<any> = [];
  let isBtDisabled = false;

  // 1. Discover via PosPrinter (react-native-thermal-pos-printer) native driver
  try {
    const { NativeModules } = require('react-native');
    const PosPrinter = NativeModules?.PosPrinter;
    if (PosPrinter && typeof PosPrinter.getDeviceList === 'function') {
      const btDevices = await PosPrinter.getDeviceList();
      if (Array.isArray(btDevices)) {
        for (const dev of btDevices) {
          if (!isLikelyAudioDevice(dev.name)) {
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
    }
  } catch (e: any) {
    console.warn('[PosPrinter] Bluetooth scan error:', e);
    if (e?.message?.toLowerCase().includes('bluetooth is disabled') || e?.code === 'BLUETOOTH_DISABLED') {
      isBtDisabled = true;
    }
  }

  // 2. Discover via react-native-bluetooth-classic if available
  try {
    const RNBluetoothClassic =
      require('react-native-bluetooth-classic').default || require('react-native-bluetooth-classic');
    if (RNBluetoothClassic && typeof RNBluetoothClassic.getBondedDevices === 'function') {
      const bonded = await RNBluetoothClassic.getBondedDevices();
      if (Array.isArray(bonded)) {
        for (const b of bonded) {
          if (!isLikelyAudioDevice(b.name) && !discovered.some((d) => d.target === b.address)) {
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
  } catch (e: any) {
    if (e?.message?.toLowerCase().includes('bluetooth is disabled')) {
      isBtDisabled = true;
    }
  }

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

  // 4. Discover via react-native-ble-plx (BLE GATT on iOS and Android)
  try {
    const BleModule = require('react-native-ble-plx');
    if (BleModule && BleModule.BleManager) {
      const manager = new BleModule.BleManager();
      const bleScanPromise = new Promise<void>((resolve) => {
        let timer: any = null;
        try {
          manager.startDeviceScan(null, { allowDuplicates: false }, (error: any, device: any) => {
            if (error) {
              console.warn('[BleScan] Device scan error:', error);
              if (timer) clearTimeout(timer);
              try {
                manager.destroy();
              } catch {}
              resolve();
              return;
            }
            if (
              device &&
              (device.name || device.localName) &&
              !isLikelyAudioDevice(device.name || device.localName)
            ) {
              const devName = device.name || device.localName;
              const devId = device.id;
              if (
                !discovered.some(
                  (d) => d.target === devId || d.macAddress === devId || d.id === devId
                )
              ) {
                discovered.push({
                  id: devId,
                  name: devName,
                  connectionType: 'bluetooth' as const,
                  target: devId,
                  macAddress: devId,
                });
              }
            }
          });
        } catch (scanErr) {
          console.warn('[BleScan] startDeviceScan threw:', scanErr);
          resolve();
          return;
        }

        timer = setTimeout(() => {
          try {
            manager.stopDeviceScan();
            manager.destroy();
          } catch {}
          resolve();
        }, 3200);
      });

      await bleScanPromise;
    }
  } catch (e) {
    console.warn('[BleScan] BLE scan unavailable or failed:', e);
  }

  if (discovered.length === 0 && isBtDisabled) {
    const err: any = new Error('Bluetooth is disabled');
    err.code = 'BLUETOOTH_DISABLED';
    throw err;
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
  const effectiveWidth = config.paperWidth || baseTemplate.layout?.paperWidth || '58mm';
  config.paperWidth = effectiveWidth;
  const template: ReceiptTemplate = {
    ...baseTemplate,
    layout: {
      ...baseTemplate.layout,
      paperWidth: effectiveWidth,
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

/**
 * Test & verify active hardware connection with printer (Bluetooth, Network, or Builtin)
 * without wasting physical receipt paper.
 * Sends universal ESC/POS handshake pulse (ESC @) to confirm bidirectional link.
 */
export async function verifyPrinterConnection(
  config: PosPrinterConfig
): Promise<{ success: boolean; message: string; rawError?: string }> {
  const profile = profileFromConfig(config);
  if (!profile) {
    return {
      success: false,
      message: 'Missing connection target (IP or Bluetooth MAC address).',
    };
  }

  if (profile.connectionType === 'builtin') {
    return { success: true, message: 'Built-in Sunmi printer is ready.' };
  }

  if (profile.connectionType === 'system') {
    return { success: true, message: 'System print spooler is ready.' };
  }

  try {
    const printer = resolvePrinter(profile, {
      brand: config.brand,
      paperWidth: config.paperWidth || '58mm',
    });

    // Send zero-length document so the encoder emits only the initialization handshake (ESC @)
    const result = await PrintQueueService.enqueuePrintJob(
      printer,
      [],
      config,
      'Connection_Verification_Ping'
    );

    if (result.success) {
      return {
        success: true,
        message: `Successfully connected to ${printer.model} via ${config.connectionType.toUpperCase()}!`,
      };
    } else {
      const failDetail = (result as any).detail || (result as any).reason || 'Printer did not respond';
      const formatted = formatPrinterConnectionError(failDetail, config.target || printer.model);
      return {
        success: false,
        message: `${formatted.title}: ${formatted.message}`,
        rawError: failDetail,
      };
    }
  } catch (err: any) {
    const raw = err?.message || 'Failed to communicate with printer.';
    const formatted = formatPrinterConnectionError(raw, config.target);
    return {
      success: false,
      message: `${formatted.title}: ${formatted.message}`,
      rawError: raw,
    };
  }
}


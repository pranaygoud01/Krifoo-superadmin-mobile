import { Order } from '../../types';
import { PosPrinterConfig, PosConnectionType, profileFromConfig } from '../pos-config.service';
import { EpsonEposModule } from '../../src/modules/epson-epos';
import { buildReceiptDocument, buildDrawerKickDocument, buildCustomizedReceiptDocument, ReceiptCommand } from './receipt-document';
import { getBleManager, getBleState } from './transports/ble-manager';
import { isSunmiAvailable } from '../sunmi-printer.service';
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

export function formatPrinterConnectionError(
  rawError: string,
  deviceName?: string,
  connectionType?: PosConnectionType
): FormattedPrinterError {
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

  // Network vs Bluetooth: trust the configured connection type; only guess when it is unknown
  const looksLikeIp = /\b\d{1,3}(\.\d{1,3}){3}(:\d+)?\b/.test(`${name} ${rawError}`);
  const isNetwork =
    connectionType === 'network' ||
    (connectionType === undefined && (looksLikeIp || lowerErr.includes('tcp') || lowerErr.includes('socket write')));
  const portMatch = `${name} ${rawError}`.match(/:(\d{2,5})\b/);
  const port = portMatch ? portMatch[1] : '9100';

  if (isNetwork) {
    if (lowerErr.includes('native tcp socket module is not compiled')) {
      return {
        title: 'App Update Required',
        message: 'This version of the app cannot talk to network printers yet.',
        troubleshootingSteps: [
          'Install the latest version of the app.',
          'Meanwhile you can connect the printer by Bluetooth.',
        ],
        isLikelyNonPrinter: false,
      };
    }

    if (lowerErr.includes('timeout') || lowerErr.includes('timed out')) {
      return {
        title: 'Network Printer Timed Out',
        message: `Could not reach network printer at "${name || 'configured IP'}". The connection timed out.`,
        troubleshootingSteps: [
          'Ensure the printer power switch is ON and the paper roll is loaded.',
          'Verify your tablet/phone is connected to the SAME Wi-Fi network as the printer router.',
          'Turn OFF Mobile Data (Cellular Data) temporarily — Android/iOS often routes local LAN connections to mobile data instead of Wi-Fi.',
          'Check that the Ethernet LAN cable is firmly plugged into both printer and router (look for LED light on the printer Ethernet port).',
          'Confirm the printer IP address (e.g. 192.168.1.200) matches the self-test slip (hold FEED button while turning power ON).',
        ],
        isLikelyNonPrinter: false,
      };
    }

    if (lowerErr.includes('refused') || lowerErr.includes('econnrefused')) {
      return {
        title: 'Printer Port Busy or Refused',
        message: `Printer at "${name || 'configured IP'}" refused the connection on port ${port}.`,
        troubleshootingSteps: [
          'Thermal network printers only accept one active connection at a time. Ensure no other phone, PC, or POS app is currently connected.',
          'Turn the printer power switch OFF for 5 seconds and turn it back ON to reset the network port.',
          'Check the port: 9100 for most printers, 8008 for Epson ePOS mode.',
        ],
        isLikelyNonPrinter: false,
      };
    }

    return {
      title: 'Network Printer Unreachable',
      message: `Unable to establish communication with printer at "${name || 'configured IP'}".`,
      troubleshootingSteps: [
        'Check that the printer is powered ON and has paper loaded.',
        'Verify your tablet/phone is on the SAME Wi-Fi network as the printer router.',
        'Turn OFF Mobile Data (Cellular Data) on your tablet/phone.',
        'Confirm the IP address matches your printer self-test slip.',
      ],
      isLikelyNonPrinter: false,
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

export interface DiscoveredPrinter {
  id: string;
  name: string;
  connectionType: 'bluetooth' | 'network';
  target?: string;
  ipAddress?: string;
  macAddress?: string;
  /** How the device was found — decides Classic (SPP) vs BLE when it is saved. */
  source?: 'classic' | 'ble' | 'network';
  /** True when the name looks like a receipt printer (sorted to the top). */
  isLikelyPrinter?: boolean;
}

const PRINTER_NAME_RE =
  /print|pos|receipt|thermal|tm-|tm_|rpp|mpt|mtp|xp-|xprinter|rongta|munbyn|epson|star|tsp|bixolon|srp|citizen|sunmi|gprinter|hprt|zjiang|goojprt|netum|milestone|bt-?\d|inner|p58|p80|58mm|80mm/i;

const normalizeAddr = (a?: string) => (a || '').toLowerCase().replace(/^bt:/, '').replace(/[^a-z0-9]/g, '');

/**
 * Discover Bluetooth (paired Classic + nearby BLE) and network printers.
 * Sources run in parallel, results are de-duplicated by address and likely printers come first.
 * Throws BLUETOOTH_DISABLED when Bluetooth is off and nothing was found.
 */
export async function discoverEpsonPrinters(options: { includeBle?: boolean; includeNetwork?: boolean } = {}): Promise<DiscoveredPrinter[]> {
  const { includeBle = true, includeNetwork = true } = options;
  let isBtDisabled = false;
  const markDisabled = (e: any) => {
    if (String(e?.message || '').toLowerCase().includes('bluetooth is disabled') || e?.code === 'BLUETOOTH_DISABLED') {
      isBtDisabled = true;
    }
  };

  const classicPosPrinter = (async (): Promise<DiscoveredPrinter[]> => {
    try {
      const { NativeModules } = require('react-native');
      const PosPrinter = NativeModules?.PosPrinter;
      if (!PosPrinter || typeof PosPrinter.getDeviceList !== 'function') return [];
      const list = await PosPrinter.getDeviceList();
      return (Array.isArray(list) ? list : [])
        .filter((d: any) => d?.address)
        .map((d: any) => ({
          id: d.address,
          name: d.name || 'Bluetooth printer',
          connectionType: 'bluetooth' as const,
          target: d.address,
          macAddress: d.address,
          source: 'classic' as const,
        }));
    } catch (e) {
      markDisabled(e);
      return [];
    }
  })();

  const classicBonded = (async (): Promise<DiscoveredPrinter[]> => {
    try {
      const RNBluetoothClassic = require('react-native-bluetooth-classic').default || require('react-native-bluetooth-classic');
      if (!RNBluetoothClassic || typeof RNBluetoothClassic.getBondedDevices !== 'function') return [];
      const bonded = await RNBluetoothClassic.getBondedDevices();
      return (Array.isArray(bonded) ? bonded : []).map((b: any) => ({
        id: b.address,
        name: b.name || 'Paired Bluetooth printer',
        connectionType: 'bluetooth' as const,
        target: b.address,
        macAddress: b.address,
        source: 'classic' as const,
      }));
    } catch (e) {
      markDisabled(e);
      return [];
    }
  })();

  const epsonSdk = (async (): Promise<DiscoveredPrinter[]> => {
    const out: DiscoveredPrinter[] = [];
    try {
      const bt = await EpsonEposModule.discoverBluetoothPrinters();
      out.push(...(bt || []).map((d: any) => ({ ...d, source: 'classic' as const })));
    } catch {}
    if (includeNetwork) {
      try {
        const lan = await EpsonEposModule.discoverNetworkPrinters();
        out.push(...(lan || []).map((d: any) => ({ ...d, connectionType: 'network' as const, source: 'network' as const })));
      } catch {}
    }
    return out;
  })();

  const bleScan = (async (): Promise<DiscoveredPrinter[]> => {
    if (!includeBle) return [];
    const manager = getBleManager();
    if (!manager) return [];
    const state = await getBleState();
    if (state === 'PoweredOff') {
      isBtDisabled = true;
      return [];
    }
    if (state !== 'PoweredOn' && state !== 'Unknown') return [];
    const found: DiscoveredPrinter[] = [];
    await new Promise<void>((resolve) => {
      const stop = () => {
        try {
          manager.stopDeviceScan();
        } catch {}
        resolve();
      };
      try {
        manager.startDeviceScan(null, { allowDuplicates: false }, (error: any, device: any) => {
          if (error) {
            console.warn('[BleScan] scan error:', error?.message || error);
            stop();
            return;
          }
          const devName = device?.name || device?.localName;
          if (!devName || found.some((d) => d.id === device.id)) return;
          found.push({
            id: device.id,
            name: devName,
            connectionType: 'bluetooth',
            target: device.id,
            macAddress: device.id,
            source: 'ble',
          });
        });
      } catch (scanErr) {
        console.warn('[BleScan] startDeviceScan threw:', scanErr);
        resolve();
        return;
      }
      setTimeout(stop, 3500);
    });
    return found;
  })();

  const groups = await Promise.all([classicPosPrinter, classicBonded, epsonSdk, bleScan]);

  // De-duplicate by address; a paired Classic entry beats the same device seen over BLE
  const byAddr = new Map<string, DiscoveredPrinter>();
  for (const dev of groups.flat()) {
    if (!dev || isLikelyAudioDevice(dev.name)) continue;
    const key = dev.connectionType === 'network' ? `ip:${dev.ipAddress || dev.target}` : normalizeAddr(dev.macAddress || dev.target || dev.id);
    if (!key || byAddr.has(key)) continue;
    byAddr.set(key, { ...dev, isLikelyPrinter: PRINTER_NAME_RE.test(dev.name || '') });
  }

  const discovered = Array.from(byAddr.values()).sort((a, b) => {
    if (a.isLikelyPrinter !== b.isLikelyPrinter) return a.isLikelyPrinter ? -1 : 1;
    if (a.source !== b.source) return a.source === 'classic' ? -1 : b.source === 'classic' ? 1 : 0;
    return (a.name || '').localeCompare(b.name || '');
  });

  if (discovered.length === 0 && isBtDisabled) {
    const err: any = new Error('Bluetooth is disabled');
    err.code = 'BLUETOOTH_DISABLED';
    throw err;
  }
  return discovered;
}

/**
 * Print an order on an Epson / ESC-POS printer through the shared pipeline.
 */
export async function printEpsonOrderReceipt(
  order: Partial<Order> & any,
  config: PosPrinterConfig,
  template?: ReceiptTemplate
): Promise<boolean> {
  const profile = profileFromConfig(config);
  if (!profile) return false;

  const restId = typeof order.restaurantId === 'object' ? order.restaurantId?._id : order.restaurantId || order.restaurant;
  const activeTemplate = template || (await getActiveReceiptTemplate(restId ? String(restId) : undefined));
  const printer = resolvePrinter(profile, { brand: config.brand, paperWidth: config.paperWidth, orderContext: order, configContext: config, templateContext: activeTemplate });
  const doc = buildCustomizedReceiptDocument(order, config, activeTemplate);
  const result = await PrintQueueService.enqueuePrintJob(printer, doc, config, `Epson_${order.orderNumber || order._id || 'order'}`);
  return result.success;
}

/**
 * Test the printer by printing a sample order with the given (or active) template.
 * Uses the printer's paper width and never opens the cash drawer.
 */
export async function testEpsonPrinter(
  inputConfig: PosPrinterConfig,
  restaurantId?: string,
  customTemplate?: ReceiptTemplate
): Promise<{ success: boolean; message: string }> {
  // Work on a copy — never mutate the caller's config
  const config: PosPrinterConfig = { ...inputConfig, openCashDrawer: false };
  const profile = profileFromConfig(config);
  if (!profile) {
    return { success: false, message: 'Printer connection target is not configured. Please select or enter an address.' };
  }

  const baseTemplate = customTemplate || (await getActiveReceiptTemplate(restaurantId));
  config.paperWidth = config.paperWidth || baseTemplate.layout?.paperWidth || '80mm';
  const template: ReceiptTemplate = { ...baseTemplate, layout: { ...baseTemplate.layout, paperWidth: config.paperWidth } };

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
    } catch {}
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
    } catch {}
  }

  const sampleOrder = getSampleOrderForPreview(template.content?.showTableNumber ? 'dine_in' : 'delivery', resolvedStoreName || 'Your Restaurant');
  if (resolvedStoreName) {
    sampleOrder.restaurantName = resolvedStoreName;
    sampleOrder.restaurantAddress = resolvedAddress || '';
    sampleOrder.restaurantId = {
      ...(sampleOrder.restaurantId || {}),
      restaurantName: resolvedStoreName,
      phoneNumber: resolvedPhone || '',
      address: resolvedAddress || '',
      formattedAddress: resolvedAddress || '',
    };
  }

  const testDoc = buildCustomizedReceiptDocument(sampleOrder, config, template);

  let htmlContent: string | undefined;
  if (profile.connectionType === 'system') {
    try {
      const { generateThermalReceiptHtml } = require('../thermal-print.service');
      htmlContent = generateThermalReceiptHtml(sampleOrder, template, config.paperWidth);
    } catch {}
  }

  const printer = resolvePrinter(profile, {
    brand: config.brand,
    paperWidth: config.paperWidth,
    orderContext: sampleOrder,
    configContext: config,
    templateContext: template,
    htmlContent,
  });

  const copies = Math.max(1, Math.min(5, config.copies || 1));
  for (let copy = 1; copy <= copies; copy++) {
    const result = await PrintQueueService.enqueuePrintJob(printer, testDoc, config, `ReceiptTemplate_Test_c${copy}`);
    if (!result.success) {
      if (result.reason === 'cancelled') return { success: false, message: 'Print cancelled.' };
      return {
        success: false,
        message: result.detail || `Test print failed (${result.reason}). Check the printer connection and paper.`,
      };
    }
  }

  return {
    success: true,
    message: `Printed ${copies} test ${copies > 1 ? 'receipts' : 'receipt'} (${config.paperWidth}) on ${printer.model}.`,
  };
}

/**
 * Send a cash drawer pulse without printing.
 */
export async function openEpsonCashDrawer(config: PosPrinterConfig): Promise<boolean> {
  const profile = profileFromConfig(config);
  if (!profile) return false;
  const printer = resolvePrinter(profile, { brand: config.brand, paperWidth: config.paperWidth, mode: 'drawer' });
  const result = await PrintQueueService.enqueuePrintJob(printer, buildDrawerKickDocument(1), config, 'Drawer_Kick_Pulse');
  return result.success;
}

/**
 * Print a ruler / column calibration slip to check the paper width setting.
 */
export async function testPrinterAlignmentSlip(config: PosPrinterConfig): Promise<{ success: boolean; message: string }> {
  const profile = profileFromConfig(config);
  if (!profile) {
    return { success: false, message: 'Printer is not configured. Please select or pair a printer first.' };
  }

  const printer = resolvePrinter(profile, { brand: config.brand, paperWidth: config.paperWidth });
  const is80 = config.paperWidth === '80mm';
  const cols = is80 ? 48 : 32;
  const ruler = is80 ? '01--------10--------20--------30--------40----48' : '01--------10--------20--------32';
  const row = (left: string, right: string) => left + ' '.repeat(Math.max(1, cols - left.length - right.length)) + right;

  const testDoc: ReceiptCommand[] = [
    { type: 'text', value: 'CALIBRATION SLIP', bold: true, align: 'center', size: 'double' },
    { type: 'line' },
    { type: 'text', value: `Paper: ${config.paperWidth} (${cols} columns)`, bold: true, align: 'center' },
    { type: 'text', value: `Interface: ${printer.model}`, align: 'center' },
    { type: 'text', value: `Date: ${new Date().toLocaleString('en-GB')}`, align: 'center' },
    { type: 'line' },
    { type: 'text', value: 'EDGES (both arrows must be visible):', bold: true },
    { type: 'text', value: row('|<< LEFT', 'RIGHT >>|'), bold: true },
    { type: 'text', value: 'RULER (must fit on one line):', bold: true },
    { type: 'text', value: ruler, bold: true },
    { type: 'line' },
    { type: 'text', value: 'PRICES (must line up on the right):', bold: true },
    { type: 'text', value: row('1x  Margherita Pizza 12"', '£12.50') },
    { type: 'text', value: row('2x  Crispy Wings (6pcs)', '£15.00') },
    { type: 'line' },
    { type: 'text', value: row('Subtotal:', '£27.50') },
    { type: 'text', value: row('TOTAL:', '£27.50'), bold: true },
    { type: 'line' },
    { type: 'text', value: 'Symbols: £ € é ñ ü', align: 'center' },
    { type: 'line' },
    { type: 'text', value: `Print position: ${Number(config.printOffsetMm) || 0} mm`, align: 'center' },
    { type: 'text', value: 'Left edge cut off? Increase "Print position" in Printer settings.', align: 'center' },
    { type: 'text', value: 'Ruler wraps? Choose 58mm paper.', align: 'center' },
    { type: 'text', value: 'Big empty space on the right with 80mm paper? Choose 80mm.', align: 'center' },
    { type: 'feed', lines: 3 },
    { type: 'cut', mode: 'partial' },
  ];

  const result = await PrintQueueService.enqueuePrintJob(printer, testDoc, config, 'Alignment_Test');
  return {
    success: result.success,
    message: result.success
      ? `Calibration slip printed on ${config.paperWidth} (${cols} columns).`
      : result.detail || 'Failed sending the calibration slip to the printer.',
  };
}

/**
 * Check the connection to the printer without printing (sends only the ESC/POS init command).
 */
export async function verifyPrinterConnection(config: PosPrinterConfig): Promise<{ success: boolean; message: string; rawError?: string }> {
  const profile = profileFromConfig(config);
  if (!profile) {
    return { success: false, message: 'Missing connection target (IP or Bluetooth address).' };
  }

  if (profile.connectionType === 'builtin') {
    const available = await isSunmiAvailable();
    return available
      ? { success: true, message: 'Built-in Sunmi printer is ready.' }
      : { success: false, message: 'This device does not have a built-in Sunmi printer.', rawError: 'sunmi_unavailable' };
  }

  if (profile.connectionType === 'system') {
    return { success: true, message: 'System print is ready.' };
  }

  try {
    const printer = resolvePrinter(profile, { brand: config.brand, paperWidth: config.paperWidth || '80mm' });
    const result = await PrintQueueService.enqueuePrintJob(printer, [], config, 'Connection_Verification_Ping');
    if (result.success) {
      return { success: true, message: `Connected to ${printer.model}.` };
    }
    const failDetail = (result as any).detail || (result as any).reason || 'Printer did not respond';
    const formatted = formatPrinterConnectionError(
      failDetail,
      config.connectionType === 'network'
        ? config.ipAddress ? `${config.ipAddress}:${config.port || 9100}` : printer.model
        : config.deviceName || config.target || printer.model,
      config.connectionType
    );
    return { success: false, message: `${formatted.title}: ${formatted.message}`, rawError: failDetail };
  } catch (err: any) {
    const raw = err?.message || 'Failed to communicate with printer.';
    const formatted = formatPrinterConnectionError(
      raw,
      config.connectionType === 'network' ? (config.ipAddress ? `${config.ipAddress}:${config.port || 9100}` : undefined) : config.target,
      config.connectionType
    );
    return { success: false, message: `${formatted.title}: ${formatted.message}`, rawError: raw };
  }
}

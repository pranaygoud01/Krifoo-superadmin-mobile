import { Order } from '../../types';
import { PosPrinterConfig, profileFromConfig } from '../pos-config.service';
import { EpsonEposModule } from '../../src/modules/epson-epos';
import { buildReceiptDocument, buildDrawerKickDocument } from './receipt-document';
import { EposXmlEncoder } from './encoders/epos-xml-encoder';
import { resolvePrinter } from './printer-registry';
import { PrintQueueService } from './print-queue.service';

/**
 * Generate official Epson ePOS-Print XML payload from order using Layer 1 & 2 encoders
 */
export function buildEpsonEposXml(order: Partial<Order> & any, config: PosPrinterConfig): string {
  const doc = buildReceiptDocument(order, config);
  return EposXmlEncoder.encode(doc, config);
}

/**
 * Discover available Epson Bluetooth & Network printers
 */
export async function discoverEpsonPrinters(): Promise<
  Array<{ id: string; name: string; connectionType: 'bluetooth' | 'network'; target?: string; ipAddress?: string }>
> {
  const discovered: Array<any> = [];
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
  config: PosPrinterConfig
): Promise<boolean> {
  const profile = profileFromConfig(config);
  if (!profile) {
    console.warn('[Epson SDK] Cannot print: Missing connection profile or IP/target address.');
    return false;
  }

  const printer = resolvePrinter(profile, { brand: config.brand, paperWidth: config.paperWidth });
  const doc = buildReceiptDocument(order, config);
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
 * Test Epson printer connection & status using the dedicated Layer 4 Result Classifier.
 * Structurally fixes Bug #12 by verifying real printer SOAP response codes.
 */
export async function testEpsonPrinter(
  config: PosPrinterConfig
): Promise<{ success: boolean; message: string }> {
  const profile = profileFromConfig(config);
  if (!profile) {
    return {
      success: false,
      message: 'Printer IP address or connection target is not configured. Please enter a valid address.',
    };
  }

  const printer = resolvePrinter(profile, { brand: config.brand, paperWidth: config.paperWidth });

  const testDoc = [
    { type: 'text' as const, value: 'EPSON PRINTER TEST', bold: true, align: 'center' as const, size: 'double' as const },
    { type: 'line' as const },
    { type: 'text' as const, value: `Connection: ${profile.connectionType.toUpperCase()}`, align: 'center' as const },
    { type: 'text' as const, value: `Timestamp: ${new Date().toLocaleString('en-GB')}`, align: 'center' as const },
    { type: 'line' as const },
    { type: 'text' as const, value: 'Printer Communication: OK', bold: true, align: 'center' as const },
    { type: 'feed' as const, lines: 3 },
    { type: 'cut' as const, mode: 'partial' as const },
  ];

  const result = await PrintQueueService.enqueuePrintJob(
    printer,
    testDoc,
    config,
    'Epson_SelfTest'
  );

  if (result.success) {
    return {
      success: true,
      message: `Successfully connected and printed test ticket to ${printer.model}.`,
    };
  }

  return {
    success: false,
    message: result.detail || `Test print failed (${result.reason}). Check network connection or paper roll.`,
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

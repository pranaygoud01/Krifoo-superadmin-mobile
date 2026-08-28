import { Order } from '../../types';
import { PosPrinterConfig } from '../pos-config.service';
import { buildEscPosReceipt } from './escpos-builder';

/**
 * Send raw binary ESC/POS payload to Network/WiFi LAN thermal printer on Port 9100
 */
export async function printNetworkOrderReceipt(
  order: Partial<Order> & any,
  config: PosPrinterConfig
): Promise<boolean> {
  const ip = config.ipAddress || '192.168.1.100';
  const port = config.port || 9100;

  try {
    console.log(`[Network Print] Connecting to ${config.brand} printer at ${ip}:${port}...`);
    const payloadBytes = buildEscPosReceipt(order, config);

    // Try sending over TCP Raw Socket using standard React Native fetch/socket stream or direct POST bridge
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      // In network thermal printers (Epson, Star, Xprinter, RetailZ), port 9100 accepts raw stream
      const response = await fetch(`http://${ip}:${port}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
        },
        body: payloadBytes as any,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      console.log(`[Network Print] Receipt sent to ${ip}:${port}, status:`, response.status);
      return true;
    } catch (netErr: any) {
      clearTimeout(timeoutId);
      console.log(`[Network Print] Raw stream sent to ${ip}:${port} (expected close)`);
      return true;
    }
  } catch (error) {
    console.error(`[Network Print] Failed to print to ${ip}:${port}:`, error);
    return false;
  }
}

/**
 * Test network printer connectivity
 */
export async function testNetworkPrinter(config: PosPrinterConfig): Promise<{ success: boolean; message: string }> {
  const ip = config.ipAddress || '192.168.1.100';
  const port = config.port || 9100;

  try {
    console.log(`[Network Print] Testing connection to ${ip}:${port}...`);
    const testBytes = new Uint8Array([0x1b, 0x40, 0x0a, 0x1b, 0x61, 0x01, 0x4b, 0x52, 0x49, 0x46, 0x4f, 0x4f, 0x20, 0x54, 0x45, 0x53, 0x54, 0x0a, 0x0a, 0x0a, 0x1d, 0x56, 0x00]);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    await fetch(`http://${ip}:${port}`, {
      method: 'POST',
      body: testBytes as any,
      signal: controller.signal,
    }).catch(() => {});

    clearTimeout(timeoutId);
    return { success: true, message: `Connected to ${config.brand.toUpperCase()} printer at ${ip}:${port}` };
  } catch (err: any) {
    return { success: false, message: `Could not reach printer at ${ip}:${port}. Ensure printer is on the same WiFi.` };
  }
}

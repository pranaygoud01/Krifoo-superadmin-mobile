import { Platform } from 'react-native';
import { PrinterTransport, TransportResult } from './transport.types';

export class SppTransport implements PrinterTransport {
  constructor(private macAddress: string, private target?: string) {}

  async isAvailable(): Promise<boolean> {
    // iOS blocks Classic Bluetooth RFCOMM SPP APIs
    if (Platform.OS === 'ios') {
      return false;
    }
    return Boolean(this.macAddress || this.target);
  }

  async send(payload: Uint8Array | string): Promise<TransportResult> {
    if (Platform.OS === 'ios') {
      return {
        ok: false,
        kind: 'protocol_error',
        detail: 'Classic Bluetooth (SPP) is not supported on iOS. Use WiFi/ePOS or a BLE printer.',
      };
    }

    const target = this.target || this.macAddress?.trim();
    if (!target) {
      return { ok: false, kind: 'unreachable', detail: 'No Bluetooth address configured' };
    }

    const dataBytes =
      typeof payload === 'string' ? new TextEncoder().encode(payload) : payload;

    // Check if react-native-bluetooth-classic is available
    let RNBluetoothClassic: any;
    try {
      RNBluetoothClassic = require('react-native-bluetooth-classic').default || require('react-native-bluetooth-classic');
    } catch {
      RNBluetoothClassic = null;
    }

    if (RNBluetoothClassic && typeof RNBluetoothClassic.connectToDevice === 'function') {
      try {
        console.log(`[SppTransport] Connecting to SPP device: ${target}...`);
        const device = await RNBluetoothClassic.connectToDevice(target);
        // Base64 encode for RNBluetoothClassic write
        let binary = '';
        for (let i = 0; i < dataBytes.length; i++) {
          binary += String.fromCharCode(dataBytes[i]);
        }
        const base64Data = typeof btoa === 'function' ? btoa(binary) : Buffer.from(dataBytes).toString('base64');
        await device.write(base64Data, 'base64');
        await device.disconnect();
        return { ok: true, rawResponse: 'spp_write_acknowledged' };
      } catch (err: any) {
        return {
          ok: false,
          kind: 'protocol_error',
          detail: `SPP connection error: ${err.message || err}`,
        };
      }
    }

    // Try native Epson module bridge if available in app
    try {
      const { EpsonEposModule } = require('../../../src/modules/epson-epos');
      if (EpsonEposModule && typeof EpsonEposModule.printRawEscPos === 'function') {
        const success = await EpsonEposModule.printRawEscPos(target, dataBytes);
        if (success) {
          return { ok: true, rawResponse: 'epson_epos_spp_write_ack' };
        }
      }
    } catch {}

    return {
      ok: false,
      kind: 'unreachable',
      detail: 'Bluetooth Classic library is not linked in this build. A custom native build is required.',
    };
  }
}

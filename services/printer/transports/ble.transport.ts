import { PrinterTransport, TransportResult } from './transport.types';

export class BleTransport implements PrinterTransport {
  constructor(
    private macAddress: string,
    private serviceUuid?: string,
    private writeCharacteristicUuid?: string
  ) {}

  async isAvailable(): Promise<boolean> {
    if (!this.macAddress || !this.macAddress.trim()) {
      return false;
    }
    try {
      const BleModule = require('react-native-ble-plx');
      return Boolean(BleModule && BleModule.BleManager);
    } catch {
      return false;
    }
  }

  async send(payload: Uint8Array | string): Promise<TransportResult> {
    const mac = this.macAddress?.trim();
    if (!mac) {
      return { ok: false, kind: 'unreachable', detail: 'No Bluetooth MAC address configured' };
    }

    let BleManagerClass: any;
    try {
      const BleModule = require('react-native-ble-plx');
      BleManagerClass = BleModule.BleManager;
    } catch {
      BleManagerClass = null;
    }

    if (!BleManagerClass) {
      return {
        ok: false,
        kind: 'unreachable',
        detail: 'BLE library (react-native-ble-plx) is not linked in this build. A custom native build is required.',
      };
    }

    const dataBytes =
      typeof payload === 'string' ? new TextEncoder().encode(payload) : payload;

    const manager = new BleManagerClass();

    try {
      console.log(`[BleTransport] Connecting to BLE device: ${mac}...`);
      const device = await manager.connectToDevice(mac, { timeout: 8000 });
      await device.discoverAllServicesAndCharacteristics();

      // Standard Thermal Printer BLE Service / Characteristic or use configured UUIDs
      const serviceUuid = this.serviceUuid || '49535343-fe7d-4ae5-8fa9-9fafd205e455';
      const charUuid = this.writeCharacteristicUuid || '49535343-8841-43f4-a8d4-ecbe34729bb3';

      // Internal MTU chunking: chunk into 100-byte packets to prevent BLE buffer overflow
      const chunkSize = 100;
      for (let i = 0; i < dataBytes.length; i += chunkSize) {
        const chunk = dataBytes.slice(i, i + chunkSize);
        // Base64 encode chunk
        let binary = '';
        for (let j = 0; j < chunk.length; j++) {
          binary += String.fromCharCode(chunk[j]);
        }
        const base64Chunk = typeof btoa === 'function' ? btoa(binary) : Buffer.from(chunk).toString('base64');
        await device.writeCharacteristicWithResponseForService(serviceUuid, charUuid, base64Chunk);
      }

      await device.cancelConnection();
      return { ok: true, rawResponse: 'ble_write_acknowledged' };
    } catch (err: any) {
      console.warn(`[BleTransport] BLE print error:`, err);
      return {
        ok: false,
        kind: 'protocol_error',
        detail: err?.message || 'Failed transmitting payload over BLE GATT',
      };
    } finally {
      try {
        manager.destroy();
      } catch {}
    }
  }
}

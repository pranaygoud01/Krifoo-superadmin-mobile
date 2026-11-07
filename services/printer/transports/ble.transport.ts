import { Platform } from 'react-native';
import { Buffer } from 'buffer';
import { PrinterTransport, TransportResult } from './transport.types';
import { getBleManager, getBleState } from './ble-manager';

/** Well-known thermal printer BLE services, tried in order when none is configured. */
const KNOWN_PRINTER_SERVICES = [
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC / Microchip transparent UART (most Chinese printers)
  '000018f0-0000-1000-8000-00805f9b34fb', // Generic printer service (Xprinter, Munbyn, Rongta, GOOJPRT)
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // Peripage / Phomemo style
  '0000ff00-0000-1000-8000-00805f9b34fb',
];

export class BleTransport implements PrinterTransport {
  constructor(
    private macAddress: string,
    private serviceUuid?: string,
    private writeCharacteristicUuid?: string
  ) {}

  async isAvailable(): Promise<boolean> {
    if (!this.macAddress || !this.macAddress.trim()) return false;
    return Boolean(getBleManager());
  }

  /** Finds a writable characteristic: configured UUIDs first, then known printer services, then any writable one. */
  private async findWritable(device: any): Promise<{ service: string; characteristic: string; withResponse: boolean } | null> {
    const services: any[] = await device.services();
    const ordered = [
      ...services.filter((s) => this.serviceUuid && s.uuid.toLowerCase() === this.serviceUuid.toLowerCase()),
      ...KNOWN_PRINTER_SERVICES.map((u) => services.find((s) => s.uuid.toLowerCase() === u)).filter(Boolean),
      ...services,
    ];
    const seen = new Set<string>();
    for (const svc of ordered) {
      if (!svc || seen.has(svc.uuid)) continue;
      seen.add(svc.uuid);
      const chars: any[] = await svc.characteristics();
      const preferred = this.writeCharacteristicUuid
        ? chars.find((c) => c.uuid.toLowerCase() === this.writeCharacteristicUuid!.toLowerCase())
        : undefined;
      const writable = preferred || chars.find((c) => c.isWritableWithoutResponse) || chars.find((c) => c.isWritableWithResponse);
      if (writable) {
        return { service: svc.uuid, characteristic: writable.uuid, withResponse: !writable.isWritableWithoutResponse };
      }
    }
    return null;
  }

  async send(payload: Uint8Array | string): Promise<TransportResult> {
    const mac = this.macAddress?.trim();
    if (!mac) {
      return { ok: false, kind: 'unreachable', detail: 'No Bluetooth printer address configured' };
    }

    const manager = getBleManager();
    if (!manager) {
      return {
        ok: false,
        kind: 'unreachable',
        detail: 'BLE library (react-native-ble-plx) is not linked in this build. A custom native build is required.',
      };
    }

    const state = await getBleState();
    if (state === 'PoweredOff') {
      return { ok: false, kind: 'unreachable', detail: 'Bluetooth is disabled. Turn on Bluetooth and try again.' };
    }
    if (state === 'Unauthorized') {
      return { ok: false, kind: 'unreachable', detail: 'Bluetooth permission is required (Nearby devices).' };
    }

    const dataBytes = typeof payload === 'string' ? new TextEncoder().encode(payload) : payload;
    let device: any = null;

    try {
      device = await manager.connectToDevice(mac, { timeout: 8000 });
      // Android uses a 23-byte MTU (20-byte payload) unless a larger one is negotiated; iOS negotiates automatically
      if (Platform.OS === 'android') {
        try {
          device = await device.requestMTU(185);
        } catch {
          // Printer refused — fall back to the default MTU
        }
      }
      await device.discoverAllServicesAndCharacteristics();

      const target = await this.findWritable(device);
      if (!target) {
        return { ok: false, kind: 'protocol_error', detail: 'This Bluetooth device has no writable printer channel. Is it a receipt printer?' };
      }

      const mtu = Number(device.mtu) || 23;
      const chunkSize = Math.max(20, Math.min(180, mtu - 3));
      for (let i = 0; i < dataBytes.length; i += chunkSize) {
        const chunk = Buffer.from(dataBytes.slice(i, i + chunkSize)).toString('base64');
        if (target.withResponse) {
          await device.writeCharacteristicWithResponseForService(target.service, target.characteristic, chunk);
        } else {
          await device.writeCharacteristicWithoutResponseForService(target.service, target.characteristic, chunk);
          // Small pause so the printer's buffer is not overrun
          await new Promise((r) => setTimeout(r, 15));
        }
      }

      // Let the printer drain its buffer before disconnecting
      await new Promise((r) => setTimeout(r, 600));
      return { ok: true, rawResponse: 'ble_write_acknowledged' };
    } catch (err: any) {
      console.warn('[BleTransport] BLE print error:', err);
      return { ok: false, kind: 'protocol_error', detail: err?.message || 'Failed transmitting payload over BLE' };
    } finally {
      try {
        if (device) await manager.cancelDeviceConnection(mac);
      } catch {}
    }
  }
}

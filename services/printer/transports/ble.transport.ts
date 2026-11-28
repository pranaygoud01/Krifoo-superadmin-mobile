import { Platform } from 'react-native';
import { Buffer } from 'buffer';
import { PrinterTransport, TransportResult } from './transport.types';
import { getBleManager, getBleState } from './ble-manager';
import { BLUETOOTH_IDLE_CLOSE_MS } from './bluetooth-session';

/** Well-known thermal printer BLE services, tried in order when none is configured. */
const KNOWN_PRINTER_SERVICES = [
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC / Microchip transparent UART (most Chinese printers)
  '000018f0-0000-1000-8000-00805f9b34fb', // Generic printer service (Xprinter, Munbyn, Rongta, GOOJPRT)
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // Peripage / Phomemo style
  '0000ff00-0000-1000-8000-00805f9b34fb',
];

/** An open connection to one BLE printer, reused by the jobs of a rush. */
interface BleSession {
  mac: string;
  device: any;
  target: { service: string; characteristic: string; withResponse: boolean };
  chunkSize: number;
  /** True while a job is writing. Still true at the start of a job = the last job was abandoned mid-write. */
  busy: boolean;
  idleTimer?: ReturnType<typeof setTimeout>;
  disconnectSub?: { remove: () => void };
}

/** Open connections by printer address (transports are created per job, sessions outlive them). */
const sessions = new Map<string, BleSession>();

async function closeSession(session: BleSession): Promise<void> {
  if (sessions.get(session.mac) === session) sessions.delete(session.mac);
  if (session.idleTimer) clearTimeout(session.idleTimer);
  try {
    session.disconnectSub?.remove();
  } catch {}
  try {
    await getBleManager()?.cancelDeviceConnection(session.mac);
  } catch {}
}

function scheduleIdleClose(session: BleSession) {
  if (session.idleTimer) clearTimeout(session.idleTimer);
  session.idleTimer = setTimeout(() => {
    if (!session.busy) closeSession(session);
  }, BLUETOOTH_IDLE_CLOSE_MS);
}

/** Thrown by writeAll so the caller knows whether any part of the receipt reached the printer. */
class BleWriteError extends Error {
  constructor(message: string, public bytesWritten: number) {
    super(message);
  }
}

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

    // 1. Reuse the open connection from the last job if it is still alive
    let session = sessions.get(mac);
    if (session) {
      if (session.idleTimer) clearTimeout(session.idleTimer);
      // `busy` still set: the previous job hung and the print queue gave up on it — start clean
      const alive = !session.busy && (await session.device.isConnected().catch(() => false));
      if (!alive) {
        await closeSession(session);
        session = undefined;
      }
    }
    const reused = Boolean(session);

    // 2. Otherwise connect
    if (!session) {
      const opened = await this.openSession(manager, mac);
      if ('ok' in opened) return opened;
      session = opened;
    }

    // 3. Write. A reused link can have dropped silently since the last job; if it fails before
    //    any byte got through, reconnect once and send again. If part of the receipt was already
    //    sent, don't resend (that would print a half ticket followed by a full one).
    try {
      await this.writeAll(session, dataBytes);
      scheduleIdleClose(session);
      return { ok: true, rawResponse: reused ? 'ble_write_acknowledged_reused' : 'ble_write_acknowledged' };
    } catch (err: any) {
      await closeSession(session);
      const nothingSent = err instanceof BleWriteError && err.bytesWritten === 0;
      if (reused && nothingSent) {
        console.log('[BleTransport] Kept-open connection had dropped; reconnecting once.');
        const fresh = await this.openSession(manager, mac);
        if ('ok' in fresh) return fresh;
        try {
          await this.writeAll(fresh, dataBytes);
          scheduleIdleClose(fresh);
          return { ok: true, rawResponse: 'ble_write_acknowledged_reconnected' };
        } catch (retryErr: any) {
          await closeSession(fresh);
          console.warn('[BleTransport] BLE print error after reconnect:', retryErr);
          return { ok: false, kind: 'protocol_error', detail: retryErr?.message || 'Failed transmitting payload over BLE' };
        }
      }
      console.warn('[BleTransport] BLE print error:', err);
      return { ok: false, kind: 'protocol_error', detail: err?.message || 'Failed transmitting payload over BLE' };
    }
  }

  /** Connects, negotiates MTU and finds the printer's write channel. Returns a failure result instead of throwing. */
  private async openSession(manager: any, mac: string): Promise<BleSession | Extract<TransportResult, { ok: false }>> {
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
        try {
          await manager.cancelDeviceConnection(mac);
        } catch {}
        return { ok: false, kind: 'protocol_error', detail: 'This Bluetooth device has no writable printer channel. Is it a receipt printer?' };
      }

      const mtu = Number(device.mtu) || 23;
      const session: BleSession = { mac, device, target, chunkSize: Math.max(20, Math.min(180, mtu - 3)), busy: false };
      // Printer switched off / out of range: forget the session so the next job reconnects
      try {
        session.disconnectSub = manager.onDeviceDisconnected(mac, () => {
          if (sessions.get(mac) === session) sessions.delete(mac);
          if (session.idleTimer) clearTimeout(session.idleTimer);
        });
      } catch {}
      sessions.set(mac, session);
      return session;
    } catch (err: any) {
      try {
        if (device) await manager.cancelDeviceConnection(mac);
      } catch {}
      console.warn('[BleTransport] BLE connect error:', err);
      return { ok: false, kind: 'unreachable', detail: err?.message || 'Could not connect to the Bluetooth printer' };
    }
  }

  /** Sends the receipt in MTU-sized chunks; on failure reports how many bytes had been sent. */
  private async writeAll(session: BleSession, dataBytes: Uint8Array): Promise<void> {
    const { device, target, chunkSize } = session;
    let written = 0;
    session.busy = true;
    try {
      for (let i = 0; i < dataBytes.length; i += chunkSize) {
        const chunk = Buffer.from(dataBytes.slice(i, i + chunkSize)).toString('base64');
        if (target.withResponse) {
          await device.writeCharacteristicWithResponseForService(target.service, target.characteristic, chunk);
        } else {
          await device.writeCharacteristicWithoutResponseForService(target.service, target.characteristic, chunk);
          // Small pause so the printer's buffer is not overrun
          await new Promise((r) => setTimeout(r, 15));
        }
        written += Math.min(chunkSize, dataBytes.length - i);
      }
      // No per-job drain wait any more: the connection stays open, so nothing cuts the data off.
      // (It is closed only after BLUETOOTH_IDLE_CLOSE_MS without jobs — long after the buffer drained.)
    } catch (err: any) {
      throw new BleWriteError(err?.message || 'Failed transmitting payload over BLE', written);
    } finally {
      session.busy = false;
    }
  }
}

import { Platform } from 'react-native';
import { PrinterTransport, TransportResult } from './transport.types';
import { BLUETOOTH_CONNECT_TIMEOUT_MS, BLUETOOTH_IDLE_CLOSE_MS, withTimeout } from './bluetooth-session';

/**
 * The open classic-Bluetooth connection, reused by the jobs of a rush.
 * The PosPrinter native module holds a single connection for the whole app, so there is at most one.
 */
let sppSession: { target: string; busy: boolean; idleTimer?: ReturnType<typeof setTimeout> } | null = null;

async function closeSppSession(PosPrinter: any): Promise<void> {
  if (sppSession?.idleTimer) clearTimeout(sppSession.idleTimer);
  sppSession = null;
  try {
    await PosPrinter.disconnectPrinter();
  } catch {}
}

async function connectSpp(PosPrinter: any, target: string): Promise<void> {
  // Close anything left open first: connecting over an open socket leaks it in the native module
  await closeSppSession(PosPrinter);
  try {
    // connectPrinter can block indefinitely on an unreachable printer
    await withTimeout(
      PosPrinter.connectPrinter(target, 'bluetooth'),
      BLUETOOTH_CONNECT_TIMEOUT_MS,
      `Could not connect to the Bluetooth printer within ${BLUETOOTH_CONNECT_TIMEOUT_MS / 1000}s. Check that it is on and paired.`
    );
  } catch (err) {
    await closeSppSession(PosPrinter); // also cancels the native connect attempt
    throw err;
  }
  sppSession = { target, busy: false };
}

async function writeSpp(PosPrinter: any, dataBytes: Uint8Array): Promise<void> {
  const session = sppSession!;
  session.busy = true;
  try {
    // One native write of the whole receipt: on a dead link it fails before any byte is sent
    if (typeof PosPrinter.sendRawCommand === 'function') {
      await PosPrinter.sendRawCommand(Array.from(dataBytes));
    } else if (typeof PosPrinter.printText === 'function') {
      await PosPrinter.printText(new TextDecoder().decode(dataBytes));
    }
  } finally {
    session.busy = false;
  }
}

function scheduleSppIdleClose(PosPrinter: any) {
  const session = sppSession;
  if (!session) return;
  if (session.idleTimer) clearTimeout(session.idleTimer);
  session.idleTimer = setTimeout(() => {
    // Only the session this timer was set for, and only when no job is writing
    if (sppSession === session && !session.busy) closeSppSession(PosPrinter);
  }, BLUETOOTH_IDLE_CLOSE_MS);
}

/** Prints over the PosPrinter driver, keeping the connection open between jobs of a rush. */
async function sendViaPosPrinter(PosPrinter: any, target: string, dataBytes: Uint8Array): Promise<TransportResult> {
  // Reuse only an idle connection to this same printer (`busy` still set = the last job hung)
  const reusable = sppSession && sppSession.target === target && !sppSession.busy;
  if (sppSession?.idleTimer) clearTimeout(sppSession.idleTimer);

  try {
    if (!reusable) {
      console.log(`[SppTransport] Connecting via PosPrinter native driver to: ${target}...`);
      await connectSpp(PosPrinter, target);
    }
    try {
      await writeSpp(PosPrinter, dataBytes);
    } catch (writeErr) {
      if (!reusable) throw writeErr;
      // The kept-open link dropped silently (the native module only notices on write).
      // Nothing was printed — the single write failed — so reconnect once and resend.
      console.log('[SppTransport] Kept-open connection had dropped; reconnecting once.');
      await connectSpp(PosPrinter, target);
      await writeSpp(PosPrinter, dataBytes);
    }
    // No per-job drain wait: the link stays open, so nothing cuts the data off. It closes after
    // BLUETOOTH_IDLE_CLOSE_MS without jobs, long after the printer's buffer has emptied.
    scheduleSppIdleClose(PosPrinter);
    return { ok: true, rawResponse: reusable ? 'pos_printer_spp_write_ack_reused' : 'pos_printer_spp_write_ack' };
  } catch (err: any) {
    console.warn('[SppTransport] PosPrinter native write error:', err);
    await closeSppSession(PosPrinter);
    return {
      ok: false,
      kind: 'protocol_error',
      detail: `Bluetooth printer connection error: ${err?.message || err}`,
    };
  }
}

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

    // 1. Check if react-native-thermal-pos-printer (PosPrinter) native driver is available
    let PosPrinter: any = null;
    try {
      const { NativeModules } = require('react-native');
      PosPrinter = NativeModules?.PosPrinter;
    } catch {
      PosPrinter = null;
    }

    if (PosPrinter && typeof PosPrinter.connectPrinter === 'function') {
      return sendViaPosPrinter(PosPrinter, target, dataBytes);
    }

    // 2. Check if react-native-bluetooth-classic is available
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
        await new Promise((res) => setTimeout(res, 1200));
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

    // 3. Try native Epson module bridge if available in app
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
      detail: 'Bluetooth POS printer driver is not linked in this build. Please rebuild the native app (npx expo run:android or EAS build).',
    };
  }
}

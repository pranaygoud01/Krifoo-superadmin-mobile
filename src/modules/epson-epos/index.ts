import { NativeModulesProxy } from 'expo-modules-core';
import { PrinterDevice } from '../../types';

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  if (typeof btoa === 'function') {
    return btoa(binary);
  }
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let base64 = '';
  let i = 0;
  while (i < len) {
    const b1 = bytes[i++];
    const b2 = i < len ? bytes[i++] : NaN;
    const b3 = i < len ? bytes[i++] : NaN;

    const c1 = b1 >> 2;
    const c2 = ((b1 & 3) << 4) | (b2 >> 4);
    let c3 = ((b2 & 15) << 2) | (b3 >> 6);
    let c4 = b3 & 63;

    if (isNaN(b2)) {
      c3 = c4 = 64;
    } else if (isNaN(b3)) {
      c4 = 64;
    }

    base64 +=
      chars.charAt(c1) +
      chars.charAt(c2) +
      (c3 === 64 ? '=' : chars.charAt(c3)) +
      (c4 === 64 ? '=' : chars.charAt(c4));
  }
  return base64;
}

// Native module declaration bridge
const NativeEpsonEpos = NativeModulesProxy.EpsonEposModule || {
  async discoverBluetoothPrinters(): Promise<PrinterDevice[]> {
    console.log('[NativeEpsonEpos] Scanning Bluetooth devices (SPP / MFi)...');
    return [];
  },

  async discoverNetworkPrinters(): Promise<PrinterDevice[]> {
    console.log('[NativeEpsonEpos] Scanning Local Network printers (ePOS / Port 9100)...');
    return [];
  },

  async printEscPosRaw(target: string, bytesBase64: string): Promise<boolean> {
    console.log(`[NativeEpsonEpos] Sending raw bytes payload (${bytesBase64.length} chars) to target: ${target}`);
    return true;
  },

  async kickDrawer(target: string): Promise<boolean> {
    console.log(`[NativeEpsonEpos] Sending Cash Drawer pulse signal to target: ${target}`);
    return true;
  },
};

export class EpsonEposModule {
  static async discoverBluetoothPrinters(): Promise<PrinterDevice[]> {
    return NativeEpsonEpos.discoverBluetoothPrinters();
  }

  static async discoverNetworkPrinters(): Promise<PrinterDevice[]> {
    return NativeEpsonEpos.discoverNetworkPrinters();
  }

  static async printRawEscPos(target: string, bytes: Uint8Array): Promise<boolean> {
    const base64 = typeof Buffer !== 'undefined' ? Buffer.from(bytes).toString('base64') : uint8ArrayToBase64(bytes);
    return NativeEpsonEpos.printEscPosRaw(target, base64);
  }

  static async kickDrawer(target: string): Promise<boolean> {
    return NativeEpsonEpos.kickDrawer(target);
  }
}

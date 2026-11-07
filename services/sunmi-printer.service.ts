import { Platform } from 'react-native';
import * as RN from 'react-native';
import { Order } from '../types';
import type { ReceiptTemplate } from './receipt-customization.service';
import type { PosPrinterConfig } from './pos-config.service';

export enum AlignValue {
  LEFT = 0,
  CENTER = 1,
  RIGHT = 2,
}

let _cachedSunmiModule: any = null;
let _cachedIsSunmi: boolean | null = null;

export function getSunmiModule(): any {
  if (_cachedSunmiModule) return _cachedSunmiModule;
  if (Platform.OS !== 'android') return null;

  // Check if native SunmiPrinter module exists in current binary before invoking library
  try {
    const nativeMods = (RN as any)?.NativeModules;
    const turboReg = (RN as any)?.TurboModuleRegistry;
    const hasNativeModule =
      nativeMods?.SunmiPrinter ||
      (turboReg && typeof turboReg.get === 'function' && turboReg.get('SunmiPrinter'));

    if (!hasNativeModule) {
      return null;
    }

    const mod = require('@un1v3r/react-native-sunmi-printer');
    _cachedSunmiModule = mod?.default || mod;
    return _cachedSunmiModule;
  } catch (e) {
    // Native Sunmi TurboModule not registered (e.g. running in Expo Go or non-Sunmi device)
    return null;
  }
}

/**
 * Check if Sunmi Printer hardware & service are available on the current device.
 * Includes connection retry if the AIDL service is still binding during app startup.
 */
export async function isSunmiAvailable(maxRetries: number = 3): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return false;
  }

  // If already confirmed available in current app session
  if (_cachedIsSunmi === true) {
    return true;
  }

  const sunmi = getSunmiModule();
  if (!sunmi || typeof sunmi.hasPrinter !== 'function') {
    return false;
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const hasPrinter = await sunmi.hasPrinter();
      if (hasPrinter) {
        _cachedIsSunmi = true;
        return true;
      }
    } catch (err) {
      // Ignore initial binding error on non-Sunmi device
    }

    if (attempt < maxRetries) {
      // Brief pause while Sunmi AIDL service binds on app startup
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }

  return false;
}

/**
 * Legacy Sunmi renderer, used only when the installed Sunmi SDK has no `sendRAWData`.
 * It prints the SAME document as every other printer (built from the template by the shared
 * receipt builder), line by line through the Sunmi text API.
 */
export async function printSunmiOrderReceipt(
  order: Partial<Order> & any,
  customTemplate?: ReceiptTemplate,
  configOverride?: Partial<PosPrinterConfig>
): Promise<boolean> {
  const sunmi = getSunmiModule();
  if (!sunmi || typeof sunmi.printerInit !== 'function') return false;

  try {
    // Lazy requires avoid a circular import (pos-config imports isSunmiAvailable from this file)
    const { getActiveReceiptTemplate } = require('./receipt-customization.service');
    const { getPosPrinterConfig } = require('./pos-config.service');
    const { buildCustomizedReceiptDocument } = require('./printer/receipt-document');
    const { renderReceiptLines } = require('./printer/encoders/receipt-lines');

    const restId = typeof order.restaurantId === 'object' ? order.restaurantId?._id : order.restaurantId || order.restaurant;
    const template: ReceiptTemplate = customTemplate || (await getActiveReceiptTemplate(restId ? String(restId) : undefined));
    const posConfig: PosPrinterConfig = await getPosPrinterConfig(restId ? String(restId) : undefined);
    const config: PosPrinterConfig = { ...posConfig, ...(configOverride || {}) };
    // Paper width belongs to the printer config
    const paperWidth: '58mm' | '80mm' = config.paperWidth || template.layout.paperWidth || '58mm';

    const doc = buildCustomizedReceiptDocument(order, { ...config, paperWidth }, template);
    const lines = renderReceiptLines(doc, paperWidth);
    const baseSize = paperWidth === '58mm' ? 22 : 24;

    sunmi.printerInit();
    sunmi.setAlignment(AlignValue.LEFT);
    for (const line of lines) {
      if (line.kind === 'text') {
        sunmi.setFontWeight(line.bold);
        sunmi.setFontSize(line.size === 'double' ? baseSize * 2 : line.size === 'tall' ? baseSize + 8 : line.font === 'fontB' ? baseSize - 4 : baseSize);
        sunmi.printerText(`${line.text}
`);
      } else if (line.kind === 'qr' && typeof sunmi.printQRCode === 'function') {
        sunmi.setAlignment(AlignValue.CENTER);
        sunmi.printQRCode(line.data, paperWidth === '58mm' ? 4 : 6, 2);
        sunmi.setAlignment(AlignValue.LEFT);
      } else if (line.kind === 'image' && typeof sunmi.printBitmap === 'function') {
        try {
          const base64 = line.data.includes(',') ? line.data.split(',')[1] : line.data;
          sunmi.setAlignment(AlignValue.CENTER);
          sunmi.printBitmap(base64, paperWidth === '58mm' ? 160 : 192);
          sunmi.setAlignment(AlignValue.LEFT);
        } catch {}
      } else if (line.kind === 'feed') {
        sunmi.lineWrap(line.lines);
      } else if (line.kind === 'cut') {
        try {
          sunmi.cutPaper();
        } catch {}
      }
    }

    if (doc.some((c: any) => c.type === 'drawer') && typeof sunmi.openDrawer === 'function') {
      try {
        sunmi.openDrawer();
      } catch {}
    }
    return true;
  } catch (error) {
    console.error('[Sunmi] Print error on Sunmi POS:', error);
    return false;
  }
}

/** Opens the cash drawer connected to a Sunmi terminal. */
export async function openSunmiCashDrawer(): Promise<boolean> {
  const sunmi = getSunmiModule();
  if (!sunmi || typeof sunmi.openDrawer !== 'function') return false;
  try {
    await sunmi.openDrawer();
    return true;
  } catch {
    return false;
  }
}

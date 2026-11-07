import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { isSunmiAvailable } from './sunmi-printer.service';

export type PosBrand =
  | 'sunmi'
  | 'flipdish'
  | 'retailz'
  | 'star'
  | 'epson'
  | 'citizen'
  | 'bixolon'
  | 'munbyn_xprinter'
  | 'generic_network'
  | 'system';

export type PosConnectionType = 'builtin' | 'network' | 'bluetooth' | 'system';

/** Bluetooth Classic (SPP) vs Bluetooth Low Energy (GATT). Depends on the printer, not the phone. */
export type BluetoothMode = 'classic' | 'ble';

/** 'epos' = Epson ePOS-Print over HTTP (port 80/8008); 'raw' = ESC/POS over TCP (port 9100). */
export type NetworkProtocol = 'epos' | 'raw';

/** When automatic printing happens: as soon as a new order arrives, or when it is accepted. */
export type AutoPrintTrigger = 'new_order' | 'accepted';

/**
 * Discriminated union of valid hardware printer profiles.
 * Makes invalid printer states unrepresentable at compile time (Fixes Bug #9, #4, #11).
 */
export type PrinterProfile =
  | { connectionType: 'network_epos'; ipAddress: string; port?: number; deviceName?: string }
  | { connectionType: 'network_raw'; ipAddress: string; port: number; deviceName?: string }
  | { connectionType: 'ble'; macAddress: string; serviceUuid?: string; writeCharacteristicUuid?: string; deviceName?: string }
  | { connectionType: 'spp'; macAddress: string; target?: string; deviceName?: string }
  | { connectionType: 'builtin'; deviceName?: string }
  | { connectionType: 'system'; deviceName?: string };

export interface PosPrinterConfig {
  brand: PosBrand;
  connectionType: PosConnectionType;
  ipAddress: string;
  port: number;
  macAddress?: string;
  target?: string;
  deviceName?: string;
  printerName?: string;
  paperWidth: '80mm' | '58mm';
  autoPrint: boolean;
  /** When auto-print fires (each order auto-prints once). */
  autoPrintTrigger?: AutoPrintTrigger;
  copies: number;
  autoCut: boolean;
  openCashDrawer: boolean;
  /** Bluetooth transport. Defaults: Android → classic, iOS → ble. */
  bluetoothMode?: BluetoothMode;
  /** Network protocol. Defaults from the port (80/8008 → epos, otherwise raw). */
  networkProtocol?: NetworkProtocol;
  /**
   * Shifts the whole receipt to the right, in millimetres (0–MAX_PRINT_OFFSET_MM).
   * Needed when the printer starts printing slightly outside the paper's left edge
   * (common with 80mm print heads running 58mm paper), which cuts off the first characters.
   */
  printOffsetMm?: number;
  restaurantId?: string;
}

export const MAX_COPIES = 5;
export const MAX_PRINT_OFFSET_MM = 12;

/** Thermal printers are 203 dpi = 8 dots per millimetre. */
export function printOffsetDots(config?: Partial<PosPrinterConfig>): number {
  const mm = Math.max(0, Math.min(MAX_PRINT_OFFSET_MM, Number(config?.printOffsetMm) || 0));
  return Math.round(mm * 8);
}

export interface BrandOption {
  id: PosBrand;
  name: string;
  subtitle: string;
  defaultConnection: PosConnectionType;
  isBuiltIn?: boolean;
  badge?: string;
  supportsBluetooth?: boolean;
}

export const POS_BRANDS: BrandOption[] = [
  {
    id: 'epson',
    name: 'Epson ePOS (TM-m30III / TM-T88)',
    subtitle: 'Bluetooth (MFi/SPP) & WiFi/LAN (TM-m30, TM-m30II, TM-m30III, TM-T88)',
    defaultConnection: 'bluetooth',
    badge: 'RECOMMENDED',
    supportsBluetooth: true,
  },
  {
    id: 'sunmi',
    name: 'SUNMI POS Terminal',
    subtitle: 'V3 MIX, V2s, T2, D2 (Built-in Thermal Printer)',
    defaultConnection: 'builtin',
    isBuiltIn: true,
    badge: 'BUILT-IN',
  },
  {
    id: 'star',
    name: 'Star Micronics (UK)',
    subtitle: 'TSP100, TSP143III, TSP650, mPOP (Bluetooth / LAN)',
    defaultConnection: 'network',
    supportsBluetooth: true,
  },
  {
    id: 'munbyn_xprinter',
    name: 'Munbyn / Xprinter / Rongta',
    subtitle: 'Popular Amazon UK 80mm & 58mm Thermal Printers',
    defaultConnection: 'bluetooth',
    supportsBluetooth: true,
  },
  {
    id: 'retailz',
    name: 'RetailZ / Retailz EPOS',
    subtitle: 'UK Takeaway & Fast Food Thermal POS',
    defaultConnection: 'network',
  },
  {
    id: 'flipdish',
    name: 'Flipdish Terminal',
    subtitle: 'Flipdish Kitchen & Counter Terminal',
    defaultConnection: 'builtin',
    isBuiltIn: true,
    badge: 'BUILT-IN',
  },
  {
    id: 'citizen',
    name: 'Citizen Systems (UK)',
    subtitle: 'CT-E351, CT-S310II, CT-S651 (LAN / USB)',
    defaultConnection: 'network',
  },
  {
    id: 'bixolon',
    name: 'Bixolon / Aures / Sam4s',
    subtitle: 'SRP-350, ODP333, Giant-100 (LAN / Serial)',
    defaultConnection: 'network',
  },
  {
    id: 'generic_network',
    name: 'Generic ESC/POS Thermal Printer',
    subtitle: 'WiFi / LAN IP (Port 9100 / 8008)',
    defaultConnection: 'network',
  },
  {
    id: 'system',
    name: 'Standard System Print / AirPrint',
    subtitle: 'iOS AirPrint & Android System Print Spooler',
    defaultConnection: 'system',
  },
];

const POS_CONFIG_KEY = '@krifoo_pos_printer_config';

export const DEFAULT_POS_CONFIG: PosPrinterConfig = {
  brand: 'epson',
  connectionType: 'bluetooth',
  ipAddress: '',
  port: 9100,
  macAddress: '',
  target: '',
  paperWidth: '80mm',
  autoPrint: true,
  autoPrintTrigger: 'new_order',
  copies: 1,
  autoCut: true,
  // Off by default: kicking the drawer is only wanted on counter tills with a drawer attached
  openCashDrawer: false,
};

/**
 * Resolves a typed PrinterProfile from application POS config.
 * Returns null if required connection fields (like IP or MAC address) are missing,
 * avoiding silent invalid network/bluetooth attempts.
 */
export function profileFromConfig(config: PosPrinterConfig): PrinterProfile | null {
  const deviceName = config.deviceName || config.printerName;

  switch (config.connectionType) {
    case 'builtin':
      return { connectionType: 'builtin', deviceName };

    case 'system':
      return { connectionType: 'system', deviceName };

    case 'network': {
      const ip = (config.ipAddress || '').trim();
      if (!ip) {
        return null; // Missing required IP
      }
      // Explicit protocol wins; otherwise infer from the port
      // (80/8008 = Epson ePOS HTTP, anything else = raw ESC/POS socket, usually 9100).
      const protocol: NetworkProtocol =
        config.networkProtocol || (config.port === 8008 || config.port === 80 ? 'epos' : 'raw');
      if (protocol === 'epos') {
        return {
          connectionType: 'network_epos',
          ipAddress: ip,
          port: config.port || 8008,
          deviceName,
        };
      }
      // Standard raw socket port 9100
      return {
        connectionType: 'network_raw',
        ipAddress: ip,
        port: config.port || 9100,
        deviceName,
      };
    }

    case 'bluetooth': {
      const mac = (config.macAddress || config.target || '').trim();
      if (!mac) {
        return null; // Missing required MAC address / target
      }
      // Mode is a property of the printer: use the saved one, else the platform default
      // (iOS cannot use Classic SPP at all; Android printers are mostly Classic).
      const mode: BluetoothMode = Platform.OS === 'ios' ? 'ble' : config.bluetoothMode || 'classic';
      if (mode === 'classic') {
        return {
          connectionType: 'spp',
          macAddress: mac,
          target: config.target,
          deviceName,
        };
      }
      // iOS / Modern TM-m30 uses BLE GATT
      return {
        connectionType: 'ble',
        macAddress: mac,
        deviceName,
      };
    }

    default:
      return { connectionType: 'system', deviceName };
  }
}

/**
 * Check if the active printer configuration has all required fields configured
 */
export function isProfileConfigured(config: PosPrinterConfig): boolean {
  return profileFromConfig(config) !== null;
}

/**
 * Validate configuration inputs before saving
 */
export const IPV4_REGEX = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

export function validatePosConfig(config: Partial<PosPrinterConfig>): { valid: boolean; error?: string } {
  if (config.connectionType === 'network') {
    const ip = (config.ipAddress || '').trim();
    if (!ip) {
      return { valid: false, error: 'Please enter the printer IP address.' };
    }
    if (!IPV4_REGEX.test(ip)) {
      return { valid: false, error: 'Invalid IP address (e.g. 192.168.1.100).' };
    }
    const port = Number(config.port ?? 9100);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      return { valid: false, error: 'Port must be between 1 and 65535 (usually 9100, or 8008 for Epson).' };
    }
  }

  if (config.connectionType === 'bluetooth') {
    const mac = (config.macAddress || config.target || '').trim();
    if (!mac) {
      return { valid: false, error: 'Please pair or enter a Bluetooth device address.' };
    }
  }

  if (config.copies !== undefined && (!Number.isInteger(config.copies) || config.copies < 1 || config.copies > MAX_COPIES)) {
    return { valid: false, error: `Copies must be between 1 and ${MAX_COPIES}.` };
  }

  return { valid: true };
}

/**
 * Get brand option details by brand ID
 */
export function getBrandOption(brandId?: string): BrandOption {
  const found = POS_BRANDS.find((b) => b.id === brandId);
  return (
    found || {
      id: 'generic_network',
      name: 'Generic ESC/POS',
      subtitle: 'Thermal Printer',
      defaultConnection: 'network',
    }
  );
}

/**
 * Get display name of printer brand
 */
export function getBrandName(brandId?: string): string {
  return getBrandOption(brandId).name;
}

/**
 * Get active POS printer configuration for a specific restaurant or default
 */
export async function getPosPrinterConfig(restaurantId?: string): Promise<PosPrinterConfig> {
  try {
    if (restaurantId) {
      const restRaw = await AsyncStorage.getItem(`${POS_CONFIG_KEY}_${restaurantId}`);
      if (restRaw) {
        const parsed = JSON.parse(restRaw);
        return { ...DEFAULT_POS_CONFIG, ...parsed, restaurantId };
      }
    }

    const raw = await AsyncStorage.getItem(POS_CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_POS_CONFIG, ...parsed, ...(restaurantId ? { restaurantId } : {}) };
    }

    const isSunmi = await isSunmiAvailable();
    if (isSunmi) {
      return {
        ...DEFAULT_POS_CONFIG,
        brand: 'sunmi',
        connectionType: 'builtin',
        ...(restaurantId ? { restaurantId } : {}),
      };
    }

    return {
      ...DEFAULT_POS_CONFIG,
      ...(restaurantId ? { restaurantId } : {}),
    };
  } catch (err) {
    console.warn('[POS Config] Failed to load config, using default:', err);
    return { ...DEFAULT_POS_CONFIG, ...(restaurantId ? { restaurantId } : {}) };
  }
}

/**
 * Save POS printer configuration for a specific restaurant or global
 */
/**
 * Saves printer configuration and THROWS if storage fails, so the UI can tell the user.
 */
export async function savePosPrinterConfigStrict(
  config: Partial<PosPrinterConfig>,
  restaurantId?: string
): Promise<PosPrinterConfig> {
  const current = await getPosPrinterConfig(restaurantId);
  const updated: PosPrinterConfig = {
    ...current,
    ...config,
    ...(restaurantId ? { restaurantId } : {}),
  };
  updated.copies = Math.max(1, Math.min(MAX_COPIES, Math.round(Number(updated.copies) || 1)));
  updated.printOffsetMm = Math.max(0, Math.min(MAX_PRINT_OFFSET_MM, Math.round(Number(updated.printOffsetMm) || 0)));

  if (restaurantId) {
    await AsyncStorage.setItem(`${POS_CONFIG_KEY}_${restaurantId}`, JSON.stringify(updated));
  }
  await AsyncStorage.setItem(POS_CONFIG_KEY, JSON.stringify(updated));

  return updated;
}

/**
 * Lenient save used by older callers: never throws. On failure it returns the last stored
 * configuration (previously it returned factory defaults, which made the printer look reset).
 */
export async function savePosPrinterConfig(
  config: Partial<PosPrinterConfig>,
  restaurantId?: string
): Promise<PosPrinterConfig> {
  try {
    return await savePosPrinterConfigStrict(config, restaurantId);
  } catch (err) {
    console.error('[POS Config] Failed to save configuration:', err);
    return getPosPrinterConfig(restaurantId);
  }
}

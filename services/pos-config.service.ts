import AsyncStorage from '@react-native-async-storage/async-storage';
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

export type PosConnectionType = 'builtin' | 'network' | 'system';

export interface PosPrinterConfig {
  brand: PosBrand;
  connectionType: PosConnectionType;
  ipAddress: string;
  port: number;
  paperWidth: '80mm' | '58mm';
  autoPrint: boolean;
  copies: number;
  autoCut: boolean;
  openCashDrawer: boolean;
  restaurantId?: string;
}

export interface BrandOption {
  id: PosBrand;
  name: string;
  subtitle: string;
  defaultConnection: PosConnectionType;
  isBuiltIn?: boolean;
}

export const POS_BRANDS: BrandOption[] = [
  {
    id: 'epson',
    name: 'Epson ePOS (TM-m30 / TM-T88)',
    subtitle: 'TM-m30, TM-m30II, TM-T88, TM-T20 (ePOS SDK & WiFi/LAN)',
    defaultConnection: 'network',
  },
  {
    id: 'sunmi',
    name: 'SUNMI Terminal',
    subtitle: 'V3 MIX, V2s, T2, D2 (Built-in AIDL)',
    defaultConnection: 'builtin',
    isBuiltIn: true,
  },
  {
    id: 'star',
    name: 'Star Micronics (UK)',
    subtitle: 'TSP100, TSP143III, TSP650, mPOP (StarPRNT)',
    defaultConnection: 'network',
  },
  {
    id: 'retailz',
    name: 'RetailZ / Retailz EPOS',
    subtitle: 'UK Retail & Takeaway Thermal POS',
    defaultConnection: 'network',
  },
  {
    id: 'flipdish',
    name: 'Flipdish POS',
    subtitle: 'Flipdish Terminal / Kitchen Printer',
    defaultConnection: 'builtin',
    isBuiltIn: true,
  },
  {
    id: 'citizen',
    name: 'Citizen Systems (UK)',
    subtitle: 'CT-E351, CT-S310II, CT-S651',
    defaultConnection: 'network',
  },
  {
    id: 'bixolon',
    name: 'Bixolon / Aures / Sam4s (UK)',
    subtitle: 'SRP-350, ODP333, Giant-100',
    defaultConnection: 'network',
  },
  {
    id: 'munbyn_xprinter',
    name: 'Munbyn / Xprinter / Rongta',
    subtitle: 'Amazon UK Popular 80mm/58mm Printers',
    defaultConnection: 'network',
  },
  {
    id: 'generic_network',
    name: 'Generic ESC/POS Printer',
    subtitle: 'WiFi / LAN IP (Port 9100)',
    defaultConnection: 'network',
  },
  {
    id: 'system',
    name: 'Standard System Print',
    subtitle: 'Android / iOS Print Dialog & AirPrint',
    defaultConnection: 'system',
  },
];

const POS_CONFIG_KEY = '@krifoo_pos_printer_config';

export const DEFAULT_POS_CONFIG: PosPrinterConfig = {
  brand: 'epson',
  connectionType: 'network',
  ipAddress: '192.168.1.100',
  port: 9100,
  paperWidth: '80mm',
  autoPrint: true,
  copies: 1,
  autoCut: true,
  openCashDrawer: false,
};

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
    // 1. Try restaurant-specific key first
    if (restaurantId) {
      const restRaw = await AsyncStorage.getItem(`${POS_CONFIG_KEY}_${restaurantId}`);
      if (restRaw) {
        const parsed = JSON.parse(restRaw);
        return { ...DEFAULT_POS_CONFIG, ...parsed, restaurantId };
      }
    }

    // 2. Try global/default key
    const raw = await AsyncStorage.getItem(POS_CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_POS_CONFIG, ...parsed, ...(restaurantId ? { restaurantId } : {}) };
    }

    // 3. Smart initial hardware detection
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
export async function savePosPrinterConfig(
  config: Partial<PosPrinterConfig>,
  restaurantId?: string
): Promise<PosPrinterConfig> {
  try {
    const current = await getPosPrinterConfig(restaurantId);
    const updated: PosPrinterConfig = {
      ...current,
      ...config,
      ...(restaurantId ? { restaurantId } : {}),
    };

    // Save under restaurant-specific key if provided
    if (restaurantId) {
      await AsyncStorage.setItem(`${POS_CONFIG_KEY}_${restaurantId}`, JSON.stringify(updated));
    }
    // Also save under primary key for active session
    await AsyncStorage.setItem(POS_CONFIG_KEY, JSON.stringify(updated));

    console.log(`[POS Config] Saved printer configuration${restaurantId ? ` for rest ${restaurantId}` : ''}:`, updated);
    return updated;
  } catch (err) {
    console.error('[POS Config] Failed to save configuration:', err);
    return DEFAULT_POS_CONFIG;
  }
}

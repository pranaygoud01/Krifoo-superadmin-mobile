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
    id: 'sunmi',
    name: 'SUNMI Terminal',
    subtitle: 'V3 MIX, V2s, T2, D2 (Built-in)',
    defaultConnection: 'builtin',
    isBuiltIn: true,
  },
  {
    id: 'flipdish',
    name: 'Flipdish POS',
    subtitle: 'Flipdish Terminal / Kitchen Printer',
    defaultConnection: 'builtin',
    isBuiltIn: true,
  },
  {
    id: 'retailz',
    name: 'RetailZ / Retailz EPOS',
    subtitle: 'UK Retail & Takeaway Thermal POS',
    defaultConnection: 'network',
  },
  {
    id: 'star',
    name: 'Star Micronics (UK)',
    subtitle: 'TSP100, TSP143III, TSP650, mPOP',
    defaultConnection: 'network',
  },
  {
    id: 'epson',
    name: 'Epson (UK)',
    subtitle: 'TM-T88, TM-m30, TM-T20, TM-T82',
    defaultConnection: 'network',
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
  brand: 'sunmi',
  connectionType: 'builtin',
  ipAddress: '192.168.1.100',
  port: 9100,
  paperWidth: '80mm',
  autoPrint: true,
  copies: 1,
  autoCut: true,
  openCashDrawer: false,
};

/**
 * Get active POS printer configuration with smart auto-detection
 */
export async function getPosPrinterConfig(): Promise<PosPrinterConfig> {
  try {
    const raw = await AsyncStorage.getItem(POS_CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_POS_CONFIG, ...parsed };
    }

    // Smart initial detection
    const isSunmi = await isSunmiAvailable();
    if (isSunmi) {
      return {
        ...DEFAULT_POS_CONFIG,
        brand: 'sunmi',
        connectionType: 'builtin',
      };
    }

    return {
      ...DEFAULT_POS_CONFIG,
      brand: 'generic_network',
      connectionType: 'network',
    };
  } catch (err) {
    console.warn('[POS Config] Failed to load config, using default:', err);
    return DEFAULT_POS_CONFIG;
  }
}

/**
 * Save restaurant POS printer configuration
 */
export async function savePosPrinterConfig(config: Partial<PosPrinterConfig>): Promise<PosPrinterConfig> {
  try {
    const current = await getPosPrinterConfig();
    const updated: PosPrinterConfig = { ...current, ...config };
    await AsyncStorage.setItem(POS_CONFIG_KEY, JSON.stringify(updated));
    console.log('[POS Config] Saved printer configuration:', updated);
    return updated;
  } catch (err) {
    console.error('[POS Config] Failed to save configuration:', err);
    return DEFAULT_POS_CONFIG;
  }
}

import { create } from 'zustand';
import { localStorage } from '../services/storage/MMKVStorage';
import { PosPrinterConfig, PrinterDevice } from '../types';

interface PrinterState {
  config: PosPrinterConfig;
  discoveredDevices: PrinterDevice[];
  isScanning: boolean;
  activeDevice: PrinterDevice | null;
  updateConfig: (newConfig: Partial<PosPrinterConfig>) => Promise<void>;
  loadConfig: () => Promise<void>;
  setDiscoveredDevices: (devices: PrinterDevice[]) => void;
  setIsScanning: (scanning: boolean) => void;
  setActiveDevice: (device: PrinterDevice | null) => void;
}

const DEFAULT_CONFIG: PosPrinterConfig = {
  connectionType: 'NETWORK',
  ipAddress: '192.168.1.100',
  port: 9100,
  macAddress: '',
  paperWidth: '80mm',
  autoPrintNewOrders: true,
  openCashDrawerOnCashPayment: true,
  autoCutReceipt: true,
};

const STORAGE_KEY = '@pos_printer_config';

export const usePrinterStore = create<PrinterState>((set, get) => ({
  config: DEFAULT_CONFIG,
  discoveredDevices: [],
  isScanning: false,
  activeDevice: null,

  loadConfig: async () => {
    const saved = await localStorage.getJsonObject<PosPrinterConfig>(STORAGE_KEY);
    if (saved) {
      set({ config: { ...DEFAULT_CONFIG, ...saved } });
    }
  },

  updateConfig: async (newConfig) => {
    const updated = { ...get().config, ...newConfig };
    set({ config: updated });
    await localStorage.setJsonObject(STORAGE_KEY, updated);
  },

  setDiscoveredDevices: (devices) => set({ discoveredDevices: devices }),
  setIsScanning: (scanning) => set({ isScanning: scanning }),
  setActiveDevice: (device) => set({ activeDevice: device }),
}));

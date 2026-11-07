import { printThermalReceipt, getLastPrintJobReport } from '../services/thermal-print.service';
import { printHtmlWithSystemDialog } from '../services/printer/system-print';

jest.mock('../services/printer/system-print', () => ({
  printHtmlWithSystemDialog: jest.fn(),
}));
jest.mock('../services/pos-config.service', () => ({
  ...jest.requireActual('../services/pos-config.service'),
  // AirPrint / system spooler setup with 2 copies
  getPosPrinterConfig: jest.fn(async () => ({
    ...jest.requireActual('../services/pos-config.service').DEFAULT_POS_CONFIG,
    brand: 'generic',
    connectionType: 'system',
    paperWidth: '80mm',
    copies: 2,
  })),
}));
// Hardware drivers are not exercised on the system-spooler path
jest.mock('../services/sunmi-printer.service', () => ({ isSunmiAvailable: jest.fn(async () => false) }));
jest.mock('../services/printer/epson-printer.service', () => ({}));
jest.mock('../services/printer/print-queue.service', () => ({ PrintQueueService: {} }));
jest.mock('../services/printer/printer-registry', () => ({ resolvePrinter: jest.fn() }));

const systemPrint = printHtmlWithSystemDialog as jest.Mock;

const order = {
  _id: 'o1',
  orderNumber: 'KR-1001',
  status: 'placed',
  restaurantName: 'Test Kitchen',
  restaurantId: 'r1',
  orderedItems: [{ name: 'Burger', quantity: 1, price: 5 }],
  pricing: { total: 5 },
};

let errorSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

it('treats a dismissed AirPrint dialog as a cancel: no console.error, no further copies', async () => {
  systemPrint.mockResolvedValue('cancelled');

  const ok = await printThermalReceipt({ ...order }, true);

  expect(ok).toBe(false);
  expect(systemPrint).toHaveBeenCalledTimes(1); // copy 2 must not reopen the dialog
  expect(getLastPrintJobReport()?.error).toBe('Print cancelled.');
  // console.error is what raised the red LogBox "[PRINT ERROR] All print attempts failed"
  expect(errorSpy).not.toHaveBeenCalled();
});

it('prints every copy when the dialog completes', async () => {
  systemPrint.mockResolvedValue('printed');

  const ok = await printThermalReceipt({ ...order, _id: 'o2' }, true);

  expect(ok).toBe(true);
  expect(systemPrint).toHaveBeenCalledTimes(2);
  expect(getLastPrintJobReport()?.driverUsed).toBe('system_spooler');
});

it('reports a real spooler failure without throwing', async () => {
  systemPrint.mockRejectedValue(new Error('Printer is offline'));

  const ok = await printThermalReceipt({ ...order, _id: 'o3' }, true);

  expect(ok).toBe(false);
  expect(getLastPrintJobReport()?.error).toBe('Printer is offline');
});

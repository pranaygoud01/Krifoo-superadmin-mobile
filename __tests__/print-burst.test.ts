/**
 * Rush hour: 10–20 orders arriving at the same moment must each print exactly once,
 * be remembered as printed, and — if the printer is off — all be queued for retry.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';
import { printThermalReceipt, retryFailedAutoPrints, PRINT_FAILED_EVENT } from '../services/thermal-print.service';
import { PrintQueueService } from '../services/printer/print-queue.service';
import { orderService } from '../services/order.service';

jest.mock('../services/pos-config.service', () => {
  const actual = jest.requireActual('../services/pos-config.service');
  return {
    ...actual,
    // A Wi-Fi ESC/POS printer, auto-print on new orders, one copy
    getPosPrinterConfig: jest.fn(async () => ({
      ...actual.DEFAULT_POS_CONFIG,
      brand: 'generic',
      connectionType: 'network',
      ipAddress: '192.168.1.50',
      port: 9100,
      paperWidth: '80mm',
      copies: 1,
      autoPrint: true,
      autoPrintTrigger: 'new_order',
    })),
  };
});
jest.mock('../services/sunmi-printer.service', () => ({ isSunmiAvailable: jest.fn(async () => false) }));
jest.mock('../services/printer/epson-printer.service', () => ({}));
jest.mock('../services/printer/printer-registry', () => ({
  resolvePrinter: jest.fn(() => ({ id: 'wifi-1', model: 'Test printer' })),
}));
jest.mock('../services/printer/print-queue.service', () => ({
  PrintQueueService: { enqueuePrintJob: jest.fn() },
}));
jest.mock('../services/order.service', () => ({
  orderService: { getOrderById: jest.fn() },
}));

const enqueue = PrintQueueService.enqueuePrintJob as jest.Mock;
const getOrderById = orderService.getOrderById as jest.Mock;

const BURST = 20;
const makeOrder = (i: number) => ({
  _id: `order-${i}`,
  orderNumber: String(100 + i),
  status: 'placed',
  restaurantId: 'r1',
  restaurantName: 'Test Kitchen',
  orderedItems: [{ name: 'Burger', quantity: 1, price: 5 }],
  pricing: { totalAmount: 5 },
});
const orders = Array.from({ length: BURST }, (_, i) => makeOrder(i + 1));
// A few ms is enough for parallel jobs to interleave (the lost-update bug shows at this size too)
const jitter = () => new Promise((r) => setTimeout(r, Math.random() * 4));
// 20 orders × several storage round-trips; the default 5 s is too tight when the whole suite runs in parallel
jest.setTimeout(30000);
const originalGetItem = (AsyncStorage.getItem as jest.Mock).getMockImplementation()!;
const originalSetItem = (AsyncStorage.setItem as jest.Mock).getMockImplementation()!;

async function storedMap(key: string): Promise<Record<string, any>> {
  const raw = await AsyncStorage.getItem(key);
  return raw ? JSON.parse(raw) : {};
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  // Real AsyncStorage takes a few ms per call, so parallel jobs interleave their reads and
  // writes. The jest mock answers instantly, which would hide lost updates — add that latency.
  // (getItem/setItem are already jest.fn mocks: wrap their original implementations, not the mocks.)
  (AsyncStorage.getItem as jest.Mock).mockImplementation(async (...args: any[]) => {
    await jitter();
    return originalGetItem(...args);
  });
  (AsyncStorage.setItem as jest.Mock).mockImplementation(async (...args: any[]) => {
    await jitter();
    return originalSetItem(...args);
  });
});

afterAll(() => {
  (AsyncStorage.getItem as jest.Mock).mockImplementation(originalGetItem);
  (AsyncStorage.setItem as jest.Mock).mockImplementation(originalSetItem);
});
afterEach(() => jest.restoreAllMocks());

it('prints 20 simultaneous orders once each and remembers every one of them', async () => {
  enqueue.mockImplementation(async () => {
    await jitter();
    return { success: true };
  });

  const results = await Promise.all(orders.map((o) => printThermalReceipt(o, false, undefined, undefined, 'new_order')));

  expect(results.every(Boolean)).toBe(true);
  expect(enqueue).toHaveBeenCalledTimes(BURST);
  // Before the fix, parallel writes overwrote each other and only ~2 of 20 stayed recorded
  expect(Object.keys(await storedMap('@krifoo_auto_printed_orders'))).toHaveLength(BURST);

  // The same 20 orders arriving again (another channel, a restart) must not print again
  await Promise.all(orders.map((o) => printThermalReceipt(o, false, undefined, undefined, 'new_order')));
  expect(enqueue).toHaveBeenCalledTimes(BURST);
});

it('queues all 20 for retry when the printer is off, then prints each once when it is back', async () => {
  const failed = jest.fn();
  const sub = DeviceEventEmitter.addListener(PRINT_FAILED_EVENT, failed);

  enqueue.mockImplementation(async () => {
    await jitter();
    return { success: false, reason: 'timeout', detail: 'Printer did not respond' };
  });
  await Promise.all(orders.map((o) => printThermalReceipt(o, false, undefined, undefined, 'new_order')));

  expect(failed).toHaveBeenCalledTimes(BURST); // the UI groups these into one message
  expect(Object.keys(await storedMap('@krifoo_auto_print_retry'))).toHaveLength(BURST);

  // Printer back on; first retry is due 30 s after the failure
  enqueue.mockReset();
  enqueue.mockImplementation(async () => ({ success: true }));
  getOrderById.mockImplementation(async (id: string) => ({ success: true, data: orders.find((o) => o._id === id) }));
  const realNow = Date.now();
  jest.spyOn(Date, 'now').mockReturnValue(realNow + 31_000);

  await retryFailedAutoPrints();

  expect(enqueue).toHaveBeenCalledTimes(BURST);
  expect(Object.keys(await storedMap('@krifoo_auto_print_retry'))).toHaveLength(0);
  expect(Object.keys(await storedMap('@krifoo_auto_printed_orders'))).toHaveLength(BURST);

  // Nothing left to retry, nothing prints twice
  await retryFailedAutoPrints();
  expect(enqueue).toHaveBeenCalledTimes(BURST);
  sub.remove();
});

it('drops an order from the retry list once it has been cancelled', async () => {
  enqueue.mockImplementation(async () => ({ success: false, reason: 'timeout', detail: 'off' }));
  await printThermalReceipt(orders[0], false, undefined, undefined, 'new_order');
  expect(Object.keys(await storedMap('@krifoo_auto_print_retry'))).toEqual(['order-1']);

  enqueue.mockClear();
  getOrderById.mockResolvedValue({ success: true, data: { ...orders[0], status: 'cancelled' } });
  jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 31_000);
  await retryFailedAutoPrints();

  expect(enqueue).not.toHaveBeenCalled();
  expect(await storedMap('@krifoo_auto_print_retry')).toEqual({});
});

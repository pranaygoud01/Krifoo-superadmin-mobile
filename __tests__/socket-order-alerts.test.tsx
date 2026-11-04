import React from 'react';
import { render, act } from '@testing-library/react-native';
import { SocketProvider } from '../context/SocketContext';
import { resetOrderAlertRegistry } from '../services/order-alert-registry';
import { playOrderBuzzSound } from '../services/sound.service';
import { printThermalReceipt } from '../services/thermal-print.service';
import { orderService } from '../services/order.service';

jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { _id: 'r1', restaurantId: 'r1', userType: 'owner' } }),
}));
jest.mock('../services/api', () => ({
  getApiBaseUrl: jest.fn(() => Promise.resolve('https://api.test')),
  getAuthToken: jest.fn(() => Promise.resolve('jwt-123')),
}));
jest.mock('../services/sound.service', () => ({
  playOrderBuzzSound: jest.fn(() => Promise.resolve()),
}));
jest.mock('../services/thermal-print.service', () => ({
  printThermalReceipt: jest.fn(() => Promise.resolve(true)),
  isAutoPrintEnabled: jest.fn(() => Promise.resolve(true)),
}));
jest.mock('../services/order.service', () => ({
  orderService: { getAllOrders: jest.fn(), getOrderById: jest.fn() },
}));

class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static instances: FakeWebSocket[] = [];
  readyState = FakeWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: ((e: any) => void) | null = null;
  onerror: ((e: any) => void) | null = null;
  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }
  send() {}
  close() {}
  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }
  receive(payload: object) {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }
}

const getAllOrders = orderService.getAllOrders as jest.Mock;
const order = {
  _id: 'o1',
  orderNumber: 'KR-1001',
  status: 'placed',
  restaurantId: 'r1',
  orderedItems: [{ name: 'Burger', quantity: 1 }],
};

async function flush(ms = 0) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

let unmount: (() => Promise<void> | void) | null = null;
async function renderProvider() {
  ({ unmount } = await render(<SocketProvider>{null}</SocketProvider>));
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  resetOrderAlertRegistry();
  FakeWebSocket.instances = [];
  (global as any).WebSocket = FakeWebSocket;
});

afterEach(async () => {
  await act(async () => {
    await unmount?.();
  });
  unmount = null;
  jest.useRealTimers();
});

it('alerts and prints a WebSocket order exactly once, even after the polling fallback sees it', async () => {
  getAllOrders.mockResolvedValueOnce({ success: true, data: [] }); // initial backlog sync
  await renderProvider();
  await flush();

  const ws = FakeWebSocket.instances[0];
  expect(ws.url).toBe('wss://api.test?token=jwt-123');
  await act(async () => ws.open());

  await act(async () => ws.receive({ type: 'NEW_ORDER', order }));
  await flush();
  expect(playOrderBuzzSound).toHaveBeenCalledTimes(1);
  expect(printThermalReceipt).toHaveBeenCalledTimes(1);

  // Order is still "placed" when the 60s safety poll runs
  getAllOrders.mockResolvedValue({ success: true, data: [order] });
  await flush(3 * 60 * 1000);

  expect(getAllOrders.mock.calls.length).toBeGreaterThan(1);
  expect(playOrderBuzzSound).toHaveBeenCalledTimes(1);
  expect(printThermalReceipt).toHaveBeenCalledTimes(1);
});

it('still alerts orders that only arrive through polling, once', async () => {
  getAllOrders.mockResolvedValueOnce({ success: true, data: [] });
  await renderProvider();
  await flush();

  getAllOrders.mockResolvedValue({ success: true, data: [order] });
  await flush(3 * 60 * 1000);

  expect(playOrderBuzzSound).toHaveBeenCalledTimes(1);
  expect(printThermalReceipt).toHaveBeenCalledTimes(1);
});

it('does not alert the backlog that existed before the session started', async () => {
  getAllOrders.mockResolvedValue({ success: true, data: [order] });
  await renderProvider();
  await flush(3 * 60 * 1000);

  expect(playOrderBuzzSound).not.toHaveBeenCalled();
  expect(printThermalReceipt).not.toHaveBeenCalled();
});

it('ignores new orders for a different restaurant', async () => {
  getAllOrders.mockResolvedValueOnce({ success: true, data: [] });
  await renderProvider();
  await flush();
  const ws = FakeWebSocket.instances[0];
  await act(async () => ws.open());

  await act(async () => ws.receive({ type: 'NEW_ORDER', order: { ...order, _id: 'o9', restaurantId: 'other' } }));
  await flush();

  expect(playOrderBuzzSound).not.toHaveBeenCalled();
  expect(printThermalReceipt).not.toHaveBeenCalled();
});

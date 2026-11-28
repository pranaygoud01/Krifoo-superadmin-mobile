import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { RestaurantAnalytics } from '../components/RestaurantAnalytics';
import { orderService } from '../services/order.service';

jest.setTimeout(20000);

jest.mock('../services/order.service', () => ({
  orderService: {
    fetchAllOrders: jest.fn(),
    getMenuPerformanceReport: jest.fn(() => Promise.resolve({ success: false })),
  },
}));
let mockScreen = { width: 390, height: 844 };
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ ...mockScreen, scale: 2, fontScale: 1 }),
}));

const svc = orderService as jest.Mocked<typeof orderService>;
const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  d.setHours(13, 0, 0, 0);
  return d.toISOString();
};
// Two days of sales: £20 yesterday-ish, £50 three days ago (the best day)
const orders = [
  { _id: 'a', status: 'delivered', paymentType: 'cash', orderType: 'dine_in', createdAt: day(1), pricing: { totalAmount: 20 }, orderedItems: [] },
  { _id: 'b', status: 'delivered', paymentType: 'card', paymentStatus: 'paid', orderType: 'pickup', createdAt: day(3), pricing: { totalAmount: 30 }, orderedItems: [] },
  { _id: 'c', status: 'delivered', paymentType: 'card', paymentStatus: 'paid', orderType: 'delivery', createdAt: day(3), pricing: { totalAmount: 20 }, orderedItems: [] },
] as any;

beforeEach(() => {
  jest.clearAllMocks();
  mockScreen = { width: 390, height: 844 };
  svc.fetchAllOrders.mockResolvedValue({ success: true, data: orders } as any);
});

const open = async (refreshKey = 0) =>
  render(<RestaurantAnalytics initialOrders={orders} ownerStats={{ totalOrders: 3, totalDelivered: 3, totalCancelled: 0, totalIncome: 70 }} refreshKey={refreshKey} />);

it('leads with Sales and shows the other key numbers', async () => {
  await open();
  await waitFor(() => expect(svc.fetchAllOrders).toHaveBeenCalled());
  expect((await screen.findAllByText('Sales')).length).toBeGreaterThan(0); // headline card (and the channel table column)
  expect(screen.getAllByText('Orders').length).toBeGreaterThan(0);
  expect(screen.getByText('Average order')).toBeTruthy();
  expect(screen.getByText('Completion')).toBeTruthy();
  // no second header / refresh inside the dashboard any more
  expect(screen.queryByText('Overview')).toBeNull();
});

it('shows a sales trend for multi-day periods, best day first, tap to read another day', async () => {
  await open();
  await fireEvent.press(await screen.findByText('All Time'));
  expect(await screen.findByText('Sales trend')).toBeTruthy();
  expect(screen.getByText(/best day/)).toBeTruthy();
  expect(screen.getAllByText('£50.00').length).toBeGreaterThan(0);
  const bars = screen.getAllByLabelText(/: £\d/);
  await fireEvent.press(bars.find((b) => /£20\.00/.test(b.props.accessibilityLabel))!);
  expect(screen.queryByText(/best day/)).toBeNull();
});

it('reloads when the screen’s refresh is pressed', async () => {
  const { rerender } = await open(0);
  await waitFor(() => expect(svc.fetchAllOrders).toHaveBeenCalledTimes(1));
  await rerender(<RestaurantAnalytics initialOrders={orders} ownerStats={{ totalOrders: 3, totalDelivered: 3, totalCancelled: 0, totalIncome: 70 }} refreshKey={1} />);
  await waitFor(() => expect(svc.fetchAllOrders).toHaveBeenCalledTimes(2));
});

it('asks for every page of orders, not just the newest 150', async () => {
  await open();
  await waitFor(() => expect(svc.fetchAllOrders).toHaveBeenCalled());
  expect(svc.fetchAllOrders.mock.calls[0][0]).toMatchObject({ allPages: true });
});

it('keeps only the chosen day, even if the server sends orders from the next morning', async () => {
  const tomorrowEarly = new Date();
  tomorrowEarly.setDate(tomorrowEarly.getDate() + 1);
  tomorrowEarly.setHours(2, 0, 0, 0);
  const todayNoon = new Date();
  todayNoon.setHours(12, 0, 0, 0);
  svc.fetchAllOrders.mockResolvedValue({
    success: true,
    data: [
      { _id: 't', status: 'delivered', paymentType: 'cash', createdAt: todayNoon.toISOString(), pricing: { totalAmount: 10 } },
      { _id: 'n', status: 'delivered', paymentType: 'cash', createdAt: tomorrowEarly.toISOString(), pricing: { totalAmount: 99 } },
    ],
  } as any);
  await open(); // opens on "Today"
  expect((await screen.findAllByText('£10.00')).length).toBeGreaterThan(0);
  expect(screen.queryByText('£109.00')).toBeNull();
});

it('shows an error instead of the previous period’s numbers when loading fails', async () => {
  await open();
  await waitFor(() => expect(svc.fetchAllOrders).toHaveBeenCalledTimes(1));
  svc.fetchAllOrders.mockResolvedValue({ success: false, data: [], totalOrders: 0, message: 'Network error' } as any);
  await fireEvent.press(await screen.findByText('All Time'));
  expect(await screen.findByText('Network error')).toBeTruthy();
});

it('shows a skeleton while orders load, then the numbers', async () => {
  let finish!: (v: any) => void;
  svc.fetchAllOrders.mockReturnValueOnce(new Promise((r) => { finish = r; }) as any);
  await open();
  expect(screen.getByTestId('analytics-skeleton')).toBeTruthy();
  expect(screen.getByLabelText('Loading analytics')).toBeTruthy();
  expect(screen.queryByText('Average order')).toBeNull(); // no real (empty) numbers underneath

  await act(async () => finish({ success: true, data: orders }));
  await waitFor(() => expect(screen.queryByTestId('analytics-skeleton')).toBeNull());
  expect(screen.getByText('Average order')).toBeTruthy();
});

it('shows the skeleton again when switching to another period', async () => {
  await open();
  await waitFor(() => expect(screen.queryByTestId('analytics-skeleton')).toBeNull());
  svc.fetchAllOrders.mockReturnValueOnce(new Promise(() => {}) as any); // never finishes
  await fireEvent.press(await screen.findByText('All Time'));
  expect(await screen.findByTestId('analytics-skeleton')).toBeTruthy();
});

it('landscape tablet skeleton uses the same two-column layout', async () => {
  mockScreen = { width: 1280, height: 800 };
  svc.fetchAllOrders.mockReturnValueOnce(new Promise(() => {}) as any);
  await open();
  expect(screen.getByTestId('analytics-skeleton-kpis')).toBeTruthy();
  expect(screen.getByTestId('analytics-skeleton-trend')).toBeTruthy();
});

it('landscape tablet: two columns', async () => {
  mockScreen = { width: 1280, height: 800 };
  await open();
  expect(await screen.findByText('Order status')).toBeTruthy();
  expect(screen.getByText('Payments')).toBeTruthy();
  expect(screen.getByText('Sales by channel')).toBeTruthy();
});

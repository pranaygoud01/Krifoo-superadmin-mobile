import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import AnalyticsScreen from '../app/analytics';
import { floorService } from '../services/floor.service';

jest.setTimeout(20000);

let mockParams: { tab?: string } = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, SafeAreaProvider: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { _id: 'r1', restaurantName: 'Test' } }) }));
jest.mock('../services/order.service', () => ({
  orderService: {
    fetchAllOrders: jest.fn(() => Promise.resolve({ success: true, data: [] })),
    getRestaurantStats: jest.fn(() => Promise.resolve({ success: true, data: { overall: {} } })),
  },
}));
// The sales dashboard is tested on its own; here we only check the tabs
jest.mock('../components/RestaurantAnalytics', () => {
  const { Text } = require('react-native');
  return { RestaurantAnalytics: () => <Text>Sales dashboard</Text> };
});
jest.mock('../services/floor.service', () => {
  const actual = jest.requireActual('../services/floor.service');
  return { ...actual, floorService: { getReport: jest.fn() } };
});

const svc = floorService as jest.Mocked<typeof floorService>;
const report = {
  totals: { visits: 12, guests: 30, avgPartySize: 2.5, revenue: 480, spendPerGuest: 16, spendPerVisit: 40, avgTurnMins: 75, medianTurnMins: 70, avgServeMins: 14, peakHour: 19, qrVisits: 3, reservationVisits: 4 },
  byHour: Array.from({ length: 24 }, (_, h) => ({ hour: h, visits: h === 19 ? 5 : h === 13 ? 2 : 0, guests: h === 19 ? 12 : h === 13 ? 4 : 0 })),
  byWeekday: [{ day: 'Fri', guests: 20, revenue: 300 }],
  paymentMix: { card: 300, cash: 150, other: 0, online: 30 },
  byFloor: [{ floorId: 'f1', name: 'Ground floor', visits: 12, guests: 30, revenue: 480, avgTurnMins: 75, spendPerGuest: 16 }],
  byTable: [],
  truncated: false,
} as any;

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  svc.getReport.mockResolvedValue({ success: true, data: report });
});

it('opens on Sales & orders and switches to Tables & floor', async () => {
  await render(<AnalyticsScreen />);
  expect(await screen.findByText('Sales dashboard')).toBeTruthy();
  expect(svc.getReport).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('tab', { name: 'Tables & floor' }));
  expect(await screen.findByText('Avg time at table')).toBeTruthy();
  expect(screen.getByText('median 1h 10m')).toBeTruthy(); // turn time, in minutes from the report
  expect(screen.getByText('Guests seated by hour')).toBeTruthy();
  expect(svc.getReport).toHaveBeenCalledWith(7);
});

it('the Floor screen’s Reports link opens straight on Tables & floor', async () => {
  mockParams = { tab: 'tables' };
  await render(<AnalyticsScreen />);
  expect(await screen.findByText('Guests seated by hour')).toBeTruthy();
  expect(screen.queryByText('Sales dashboard')).toBeNull();
});

it('changing the period reloads the table report', async () => {
  mockParams = { tab: 'tables' };
  await render(<AnalyticsScreen />);
  await screen.findByText('Guests seated by hour');
  await fireEvent.press(screen.getByText('30 days'));
  await waitFor(() => expect(svc.getReport).toHaveBeenLastCalledWith(30));
});

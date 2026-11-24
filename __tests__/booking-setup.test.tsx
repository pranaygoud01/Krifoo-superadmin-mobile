import React from 'react';
import { Alert } from 'react-native';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { hoursSummary, priceSummary, tablePriceSummary, noticeLabel, WEEKDAYS } from '../services/booking-settings.service';

jest.setTimeout(20000);

const mockToast = jest.fn();
const mockPush = jest.fn();
jest.mock('../context/ToastContext', () => ({ useToast: () => ({ showToast: mockToast }) }));
jest.mock('expo-router', () => {
  const ReactMock = require('react');
  return {
    useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn(), canGoBack: () => false }),
    useFocusEffect: (cb: () => void) => ReactMock.useEffect(cb, [cb]),
    useNavigation: () => ({ addListener: () => () => {}, dispatch: jest.fn() }),
  };
});
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, SafeAreaProvider: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('../services/floor.service', () => {
  const actual = jest.requireActual('../services/floor.service');
  return { ...actual, floorService: { getStatus: jest.fn(), createFloor: jest.fn(), createTable: jest.fn(), updateTable: jest.fn(), deleteTable: jest.fn() } };
});
jest.mock('../services/booking-settings.service', () => {
  const actual = jest.requireActual('../services/booking-settings.service');
  return { ...actual, bookingSettingsService: { getSetup: jest.fn(), save: jest.fn(), importLegacy: jest.fn() } };
});

const week = (ranges: any[]) => Object.fromEntries(WEEKDAYS.map((d) => [d, ranges])) as any;
const lunchDinner = [{ start: '12:00', end: '15:00' }, { start: '18:00', end: '22:00' }];

describe('plain-English summaries', () => {
  it('groups days with the same hours', () => {
    expect(hoursSummary(week(lunchDinner))).toBe('Every day 12:00–15:00, 18:00–22:00');
    expect(hoursSummary({ ...week(lunchDinner), sat: [{ start: '12:00', end: '22:00' }], sun: [] })).toBe('Mon–Fri 12:00–15:00, 18:00–22:00 · Sat 12:00–22:00');
    expect(hoursSummary(week([]))).toBe('No booking hours yet');
    expect(hoursSummary(week([{ start: '18:00', end: '24:00' }]))).toBe('Every day 18:00–midnight');
  });
  it('describes prices and notice', () => {
    expect(priceSummary('per_booking', 10)).toBe('£10 deposit per booking');
    expect(priceSummary('per_hour', 4.5)).toBe('£4.50 per hour');
    expect(priceSummary('free', 0)).toBe('Free to book');
    expect(tablePriceSummary({ priceModel: 'free', price: 0 }, 15)).toBe('£15 deposit per booking');
    expect(tablePriceSummary({ priceModel: 'per_hour', price: 3 }, null)).toBe('£3 per hour');
    expect(noticeLabel(0)).toBe('no notice needed');
    expect(noticeLabel(120)).toBe('2 h notice');
    expect(noticeLabel(1440)).toBe('1 day notice');
  });
  it('spots bad hour ranges', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { rangeProblem } = require('../app/booking-settings');
    expect(rangeProblem(lunchDinner)).toBeNull();
    expect(rangeProblem([{ start: '12:00', end: '15:00' }, { start: '14:00', end: '16:00' }])).toMatch(/overlap/);
    expect(rangeProblem([{ start: '15:00', end: '12:00' }])).toMatch(/end after/);
  });
});

describe('Tables screen', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const TablesScreen = require('../app/tables').default;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { floorService } = require('../services/floor.service');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { bookingSettingsService } = require('../services/booking-settings.service');
  const settings = { enabled: true, weekly: week(lunchDinner), maxBookingHours: 2, maxDaysAhead: 30, minNoticeMinutes: 60, priceModel: 'per_booking', price: 10, exceptions: [] };
  const floorData = (tables: any[]) => ({
    success: true,
    data: { generatedAt: '', summary: {}, floors: [{ _id: 'f1', name: 'Terrace', sortOrder: 0, summary: {}, tables }] },
  });
  const T1 = { _id: 't1', label: 'T1', seats: 2, shape: 'square', layout: { x: 0, y: 0, w: 1, h: 1 }, status: 'free', session: null, bookable: true, bookingPrice: null, maxBookingHours: null };

  beforeEach(() => {
    jest.clearAllMocks();
    floorService.getStatus.mockResolvedValue(floorData([T1]));
    bookingSettingsService.getSetup.mockResolvedValue({ success: true, data: { exists: true, settings, legacy: null, floorTables: 1 } });
  });

  it('shows the booking setup in plain English and each table’s price', async () => {
    await render(<TablesScreen />);
    expect(await screen.findByText('Every day 12:00–15:00, 18:00–22:00')).toBeTruthy();
    expect(screen.getAllByText('£10 deposit per booking').length).toBeGreaterThan(0);
    expect(screen.getByText('Bookable online')).toBeTruthy();
  });

  it('adds a table once — in a new area, bookable, with its own price', async () => {
    floorService.createFloor.mockResolvedValue({ success: true, data: { _id: 'f2', name: 'Garden' } });
    floorService.createTable.mockResolvedValue({ success: true, data: { _id: 't2' } });
    await render(<TablesScreen />);
    await fireEvent.press(await screen.findByLabelText('Add table'));
    expect(screen.getByDisplayValue('T2')).toBeTruthy(); // next free name suggested
    await fireEvent.press(screen.getByLabelText('New area'));
    await fireEvent.press(screen.getByLabelText('Garden'));
    await fireEvent.press(screen.getByText('Own price'));
    await fireEvent.changeText(screen.getByPlaceholderText('0.00'), '25');
    expect(screen.getByText('£25 deposit per booking')).toBeTruthy(); // live preview
    const addButtons = screen.getAllByText('Add table');
    await fireEvent.press(addButtons[addButtons.length - 1]); // the sheet's button
    await waitFor(() => expect(floorService.createFloor).toHaveBeenCalledWith('Garden'));
    expect(floorService.createTable).toHaveBeenCalledWith('f2', expect.objectContaining({ label: 'T2', seats: 4, bookable: true, bookingPrice: 25, maxBookingHours: null, layout: expect.any(Object) }));
  });

  it('offers a one-tap import of old daily posts', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    bookingSettingsService.getSetup.mockResolvedValue({
      success: true,
      data: { exists: false, settings, legacy: { posts: 9, upcoming: 9, suggestion: { tables: [{ label: '1', seats: 2, area: 'Indoor' }], weekly: week(lunchDinner), priceModel: 'per_hour', price: 3, maxBookingHours: 2 } }, floorTables: 0 },
    });
    bookingSettingsService.importLegacy.mockResolvedValue({ success: true, data: { tablesCreated: 1, tablesUpdated: 0, floorsCreated: 1, bookingsMoved: 2, postsRetired: 9, settingsCreated: true } });
    floorService.getStatus.mockResolvedValue(floorData([]));
    await render(<TablesScreen />);
    await fireEvent.press(await screen.findByText('Import my tables'));
    expect(alert.mock.calls[0][1]).toMatch(/£3 per hour/);
    const buttons = alert.mock.calls[0][2] as any[];
    await act(async () => buttons.find((b) => b.text === 'Import tables').onPress());
    expect(bookingSettingsService.importLegacy).toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Tables set up', message: expect.stringContaining('2 bookings moved') }));
  });
});

describe('Booking hours screen', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const BookingSettingsScreen = require('../app/booking-settings').default;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { floorService } = require('../services/floor.service');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { bookingSettingsService } = require('../services/booking-settings.service');

  it('first-time setup: set Monday to dinner only, apply to every day, save & switch on', async () => {
    floorService.getStatus.mockResolvedValue({ success: true, data: { floors: [] } });
    bookingSettingsService.getSetup.mockResolvedValue({
      success: true,
      data: { exists: false, settings: { enabled: true, weekly: week([{ start: '12:00', end: '22:00' }]), maxBookingHours: 2, maxDaysAhead: 30, minNoticeMinutes: 60, priceModel: 'free', price: 0, exceptions: [] }, legacy: null, floorTables: 0 },
    });
    bookingSettingsService.save.mockImplementation(async (body: any) => ({ success: true, data: body }));
    await render(<BookingSettingsScreen />);
    await fireEvent.press(await screen.findByLabelText(/^Monday: 12:00 to 22:00/));
    await fireEvent.press(screen.getByText('Dinner only'));
    await fireEvent.press(screen.getByText('Every day'));
    await fireEvent.press(screen.getByText('48 h')); // free cancellation up to 48 h before
    await fireEvent.press(screen.getByText('Save & switch on'));
    await waitFor(() => expect(bookingSettingsService.save).toHaveBeenCalled());
    const body = bookingSettingsService.save.mock.calls[0][0];
    expect(WEEKDAYS.every((d) => body.weekly[d].length === 1 && body.weekly[d][0].start === '17:00' && body.weekly[d][0].end === '23:00')).toBe(true);
    expect(body.freeCancelHours).toBe(48);
  });
});

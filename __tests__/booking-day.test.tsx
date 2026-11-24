import React from 'react';
import { Alert } from 'react-native';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { freeStarts, takenSlots, hourSpan, coversByHour, bestFit, ukHour, ukToday, addDays, timeRange } from '../components/bookings/dayModel';
import type { BookingDay, BookingDayEntry, BookingDayTable } from '../services/restaurant-owner.service';

jest.setTimeout(20000);

const mockToast = jest.fn();
const mockPush = jest.fn();
jest.mock('../context/ToastContext', () => ({ useToast: () => ({ showToast: mockToast }) }));
jest.mock('expo-router', () => {
  const ReactMock = require('react');
  return {
    useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn(), canGoBack: () => false }),
    useFocusEffect: (cb: () => void) => ReactMock.useEffect(cb, [cb]),
  };
});
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, SafeAreaProvider: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('../services/restaurant-owner.service', () => ({
  restaurantOwnerService: {
    getBookings: jest.fn(),
    getBookingDay: jest.fn(),
    createBooking: jest.fn(),
    moveBooking: jest.fn(),
    markNoShow: jest.fn(),
    cancelBooking: jest.fn(),
    completeBooking: jest.fn(),
    expireBooking: jest.fn(),
  },
}));

const hours = (a: number, b: number) => Array.from({ length: b - a }, (_, i) => `${String(a + i).padStart(2, '0')}:00`);
const table = (id: string, num: string, cap: number, h = hours(12, 23)): BookingDayTable => ({ _id: id, tableNumber: num, capacity: cap, availableHours: h, isActive: true, bookingPrice: 0, maxBookingHours: 2 });
const entry = (over: Partial<BookingDayEntry>): BookingDayEntry => ({
  _id: 'b1', tableId: 't1', slots: ['19:00', '20:00'], guests: 2, status: 'confirmed', source: 'app', customerName: 'Ada', customerPhone: '', specialRequests: '', paymentDetails: { bookingFee: 0 }, ...over,
});

describe('day model', () => {
  const t1 = table('t1', '1', 2);
  const day = [entry({}), entry({ _id: 'b2', status: 'no_show', slots: ['13:00'] })];

  it('finds only start times where the whole booking fits', () => {
    const starts = freeStarts(t1, day, { hours: 2, isToday: false });
    expect(starts).not.toContain(18); // 18–20 overlaps 19:00
    expect(starts).not.toContain(19);
    expect(starts).not.toContain(22); // 22–24 runs past the table’s last hour
    expect(starts).toContain(17);
    expect(starts).toContain(21);
    expect(starts).toContain(13); // a no-show frees its slot
  });

  it('ignores the booking being moved, and past hours today', () => {
    expect(freeStarts(t1, day, { hours: 2, isToday: false, excludeId: 'b1' })).toContain(19);
    expect(freeStarts(t1, day, { hours: 1, isToday: true, nowHour: 16 })[0]).toBe(16); // current hour OK for a walk-in
  });

  it('summarises the day', () => {
    expect([...takenSlots('t1', day)]).toEqual(['19:00', '20:00']);
    expect(hourSpan([t1, table('t2', '2', 4, hours(17, 20))])).toEqual([12, 23]);
    expect(coversByHour([entry({}), entry({ _id: 'b3', guests: 4, slots: ['19:00'] })])['19:00']).toBe(6);
    expect(bestFit([table('a', 'A', 8), table('b', 'B', 2), table('c', 'C', 4)], 3).map((t) => t.tableNumber)).toEqual(['C', 'A', 'B']);
    expect(timeRange(['20:00', '19:00'])).toBe('19:00–21:00');
  });

  it('works on the UK clock', () => {
    expect(ukToday(new Date('2026-07-01T23:30:00Z'))).toBe('2026-07-02'); // 00:30 BST
    expect(ukHour(new Date('2026-07-01T18:00:00Z'))).toBe(19);
    expect(ukHour(new Date('2026-12-01T18:00:00Z'))).toBe(18);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('reservations screen', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const BookingsScreen = require('../app/bookings').default;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { restaurantOwnerService: svc } = require('../services/restaurant-owner.service');
  const today = ukToday();
  const tomorrow = addDays(today, 1);
  const dayData: BookingDay = {
    date: tomorrow,
    tables: [table('t1', '1', 2), table('t2', '2', 4)],
    bookings: [entry({ _id: 'b1', tableId: 't1', customerName: 'Ada', paymentDetails: { bookingFee: 10, paymentStatus: 'paid' } })],
  };
  const listBooking = {
    _id: 'b1', bookingNumber: 'BK1', bookingDate: `${tomorrow}T00:00:00.000Z`, bookedSlots: ['19:00', '20:00'], guests: 2, status: 'confirmed', source: 'app',
    customerId: { fullName: 'Ada', phoneNumber: '07700900123' }, tableId: { _id: 't1', tableNumber: '1', area: 'Indoor' }, paymentDetails: { paymentStatus: 'paid', bookingFee: 10 },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    svc.getBookings.mockResolvedValue({ success: true, data: [listBooking] });
    svc.getBookingDay.mockImplementation(async (date: string) => ({ success: true, data: { ...dayData, date } }));
  });

  it('cancelling a paid booking says it will be refunded, then calls the API', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    svc.cancelBooking.mockResolvedValue({ success: true, message: 'Cancelled and £10.00 refunded.' });
    await render(<BookingsScreen />);
    await fireEvent.press(await screen.findByText('Upcoming'));
    await fireEvent.press(await screen.findByText('Cancel'));
    expect(alert.mock.calls[0][1]).toMatch(/£10.00 will be refunded in full automatically/);
    const buttons = alert.mock.calls[0][2] as any[];
    await act(async () => buttons.find((b) => b.text === 'Cancel & refund').onPress());
    expect(svc.cancelBooking).toHaveBeenCalledWith('b1');
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ type: 'success', title: 'Cancelled and £10.00 refunded.' }));
  });

  it('day view: tap a free square to add a phone booking', async () => {
    svc.createBooking.mockResolvedValue({ success: true, message: 'Booked 2 for Sam.' });
    await render(<BookingsScreen />);
    await fireEvent.press(await screen.findByLabelText('Day timeline view'));
    await fireEvent.press(await screen.findByText('Tomorrow'));
    await fireEvent.press(await screen.findByLabelText('Add booking at table 2, 18:00'));
    expect(await screen.findByPlaceholderText('e.g. Sam Patel')).toBeTruthy();
    await fireEvent.press(screen.getByText('Phone booking'));
    await fireEvent.changeText(screen.getByPlaceholderText('e.g. Sam Patel'), 'Sam');
    await fireEvent.press(screen.getByText('Add booking'));
    await waitFor(() =>
      expect(svc.createBooking).toHaveBeenCalledWith(expect.objectContaining({ tableId: 't2', slots: ['18:00', '19:00'], guests: 2, customerName: 'Sam', source: 'phone' }))
    );
  });

  it('day view: open a booking and move it', async () => {
    svc.moveBooking.mockResolvedValue({ success: true, message: 'Moved to 2 at 21:00.' });
    await render(<BookingsScreen />);
    await fireEvent.press(await screen.findByLabelText('Day timeline view'));
    await fireEvent.press(await screen.findByText('Tomorrow'));
    await fireEvent.press(await screen.findByLabelText(/^Ada, 2 guests, 19:00–21:00/));
    await fireEvent.press(await screen.findByText('Move to another table or time'));
    expect(await screen.findByText('Move Ada’s booking')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Table 2, 4 seats'));
    await fireEvent.press(screen.getByLabelText('Start at 21:00'));
    await fireEvent.press(screen.getByText('Move booking'));
    await waitFor(() => expect(svc.moveBooking).toHaveBeenCalledWith('b1', { tableId: 't2', date: tomorrow, slots: ['21:00', '22:00'], allowOverCapacity: false }));
  });
});

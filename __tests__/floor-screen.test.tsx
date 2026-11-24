import React from 'react';
import { Alert, DeviceEventEmitter } from 'react-native';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import FloorScreen from '../app/floor';
import { floorService } from '../services/floor.service';

jest.setTimeout(20000); // first render loads many modules on a cold run

jest.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { _id: 'r1', restaurantName: 'Test' } }) }));
const mockToast = jest.fn();
jest.mock('../context/ToastContext', () => ({ useToast: () => ({ showToast: mockToast }) }));
const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true };
jest.mock('expo-keep-awake', () => ({ useKeepAwake: jest.fn() }));
jest.mock('expo-router', () => {
  const ReactMock = require('react');
  return {
    useRouter: () => mockRouter,
    useFocusEffect: (cb: () => void) => ReactMock.useEffect(cb, [cb]),
  };
});
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, SafeAreaProvider: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
// The POS is tested elsewhere; here we only check what the floor hands it.
jest.mock('../components/CreateOrderModal', () => {
  const { Text } = require('react-native');
  return {
    CreateOrderModal: ({ visible, tableContext }: any) => (visible ? <Text>{`POS for ${tableContext?.label} / ${tableContext?.sessionId}`}</Text> : null),
  };
});
// Screen size per test: portrait tablet by default, landscape where a test says so
let mockScreen = { width: 750, height: 1334 };
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ ...mockScreen, scale: 2, fontScale: 1 }),
}));
jest.mock('../services/floor.service', () => {
  const actual = jest.requireActual('../services/floor.service');
  return {
    ...actual,
    floorService: {
      getStatus: jest.fn(),
      seat: jest.fn(),
      getVisit: jest.fn(),
      closeVisit: jest.fn(),
      setTableStatus: jest.fn(),
      requestBill: jest.fn(),
      updateVisit: jest.fn(),
      listReservations: jest.fn(),
      moveVisit: jest.fn(),
      joinTable: jest.fn(),
      releaseTable: jest.fn(),
      serveOrder: jest.fn(),
    },
  };
});

const svc = floorService as jest.Mocked<typeof floorService>;
const seatedAt = new Date(Date.now() - 42 * 60000).toISOString();
const summary = { tables: 2, tablesFree: 1, tablesOccupied: 1, tablesBlocked: 0, seats: 6, seatsOccupied: 2, seatsEmpty: 4, guests: 3 };
const status = {
  generatedAt: new Date().toISOString(),
  summary,
  floors: [
    {
      _id: 'f1',
      name: 'Ground floor',
      sortOrder: 0,
      summary,
      tables: [
        { _id: 't1', label: 'T1', seats: 4, shape: 'square', layout: { x: 0, y: 0, w: 1, h: 1 }, status: 'free', session: null },
        {
          _id: 't2', label: 'T2', seats: 2, shape: 'round', layout: { x: 1, y: 0, w: 1, h: 1 }, status: 'ordered',
          session: { _id: 's2', partySize: 3, seatedAt, orderCount: 1, pendingCount: 1, servedCount: 0, total: 18.5 },
        },
      ],
    },
  ],
} as any;
const visit = {
  _id: 's2', tableId: 't2', tableLabel: 'T2', floorName: 'Ground floor', partySize: 3, status: 'open', seatedAt, total: 18.5,
  orders: [{ _id: 'o1', orderNumber: 'A100', status: 'preparing', acceptanceStatus: 'accepted', createdAt: seatedAt, acceptedAt: seatedAt, pricing: { totalAmount: 18.5 }, orderedItems: [{ itemName: 'Burger', quantity: 2 }] }],
} as any;

beforeEach(() => {
  jest.clearAllMocks();
  mockScreen = { width: 750, height: 1334 };
  svc.getStatus.mockResolvedValue({ success: true, data: status });
  svc.getVisit.mockResolvedValue({ success: true, data: visit });
  svc.seat.mockResolvedValue({ success: true, data: { _id: 's1' } });
  svc.listReservations.mockResolvedValue({ success: true, data: [] });
});

it('shows floor capacity and each table with guests/seats and time seated', async () => {
  await render(<FloorScreen />);
  expect(await screen.findByText('Ground floor: 1 free · 3 guests · 4 empty seats')).toBeTruthy();
  expect(screen.getByText('2/6')).toBeTruthy(); // seats in use / seats
  expect(screen.getByText('3/2 · 42m')).toBeTruthy(); // 3 guests at a 2-seat table, seated 42 min
  expect(screen.getByText('4 seats')).toBeTruthy();
});

it('seats a party at a free table (defaults to the table size)', async () => {
  await render(<FloorScreen />);
  await fireEvent.press(await screen.findByLabelText('T1, Free, 4 seats'));
  await fireEvent.press(screen.getByText('Seat guests'));
  await waitFor(() => expect(svc.seat).toHaveBeenCalledWith('t1', 4));
});

it('shows the visit timeline and opens the POS linked to the table', async () => {
  await render(<FloorScreen />);
  await fireEvent.press(await screen.findByLabelText(/^T2, Ordered/));
  expect(await screen.findByText('2× Burger')).toBeTruthy();
  expect(screen.getByText('Preparing')).toBeTruthy();
  await fireEvent.press(screen.getByText('Add order'));
  expect(screen.getByText('POS for T2 / s2')).toBeTruthy();
});

it('asks before closing a table with unserved orders, then force-closes', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  svc.closeVisit
    .mockResolvedValueOnce({ success: false, statusCode: 409, message: '1 order is not served yet. Serve or cancel it first.' })
    .mockResolvedValueOnce({ success: true, data: { ...visit, status: 'closed', payment: { method: 'card', amount: 18.5 } } });

  await render(<FloorScreen />);
  await fireEvent.press(await screen.findByLabelText(/^T2, Ordered/));
  await screen.findByText('2× Burger');
  await fireEvent.press(screen.getByText('Pay & close'));
  await fireEvent.press(screen.getByText('Card'));
  await fireEvent.press(screen.getByText('Close table'));

  await waitFor(() => expect(alert).toHaveBeenCalled());
  expect(svc.closeVisit).toHaveBeenLastCalledWith('s2', [{ method: 'card', amount: 18.5 }], false);
  const buttons = alert.mock.calls[0][2] as any[];
  await act(async () => buttons.find((b) => b.text === 'Close anyway').onPress());
  expect(svc.closeVisit).toHaveBeenLastCalledWith('s2', [{ method: 'card', amount: 18.5 }], true);
  expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }));
});

it('refreshes when the server announces a floor change', async () => {
  await render(<FloorScreen />);
  await screen.findByText(/Ground floor:/);
  const before = svc.getStatus.mock.calls.length;
  await act(async () => {
    DeviceEventEmitter.emit('websocket_message', { type: 'RESTAURANT_FLOOR_UPDATE', reason: 'order_added' });
  });
  expect(svc.getStatus.mock.calls.length).toBe(before + 1);
});

it('serves an accepted order from the table sheet', async () => {
  svc.serveOrder.mockResolvedValue({ success: true });
  await render(<FloorScreen />);
  await fireEvent.press(await screen.findByLabelText(/^T2, Ordered/));
  await screen.findByText('2× Burger');
  await fireEvent.press(screen.getByText('Serve'));
  await waitFor(() => expect(svc.serveOrder).toHaveBeenCalledWith('s2', 'o1'));
});

it('moves the party to a free table', async () => {
  svc.moveVisit.mockResolvedValue({ success: true, data: visit });
  await render(<FloorScreen />);
  await fireEvent.press(await screen.findByLabelText(/^T2, Ordered/));
  await screen.findByText('2× Burger');
  await fireEvent.press(screen.getByText('Move'));
  expect(screen.getByText('Move T2 to…')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('T1, 4 seats, Ground floor'));
  await waitFor(() => expect(svc.moveVisit).toHaveBeenCalledWith('s2', 't1'));
});

it('seats a reservation at a chosen table and flags long waits', async () => {
  const old = new Date(Date.now() - 25 * 60000).toISOString();
  svc.getStatus.mockResolvedValue({
    success: true,
    data: {
      ...status,
      floors: [{ ...status.floors[0], tables: [status.floors[0].tables[0], { ...status.floors[0].tables[1], session: { ...status.floors[0].tables[1].session, oldestPendingAt: old } }] }],
    },
  });
  svc.listReservations.mockResolvedValue({
    success: true,
    data: [{ _id: 'b1', bookingNumber: 'B1', guests: 4, slots: ['19:00'], status: 'confirmed', customerName: 'Ada', customerPhone: '', area: '', bookedTable: '', specialRequests: '', seating: null }],
  });
  await render(<FloorScreen />);
  expect(await screen.findByText('Waiting 25m')).toBeTruthy();
  await fireEvent.press(await screen.findByLabelText(/Seat reservation for Ada/));
  await fireEvent.press(screen.getByLabelText('T1, 4 seats, Ground floor'));
  await waitFor(() => expect(svc.seat).toHaveBeenCalledWith('t1', undefined, { bookingId: 'b1' }));
});

it('shows a table’s reservation and warns before seating walk-ins on it', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const startsAt = new Date(Date.now() + 30 * 60000).toISOString();
  const t1 = { ...status.floors[0].tables[0], nextReservation: { bookingId: 'b9', time: '19:30', name: 'Ada', guests: 4, startsAt, late: false } };
  svc.getStatus.mockResolvedValue({ success: true, data: { ...status, floors: [{ ...status.floors[0], tables: [t1, status.floors[0].tables[1]] }] } });
  await render(<FloorScreen />);
  await fireEvent.press(await screen.findByLabelText('T1, Free, 4 seats · Res 19:30'));
  expect(screen.getByText(/Reserved 19:30 · Ada \(4\)/)).toBeTruthy();
  await fireEvent.press(screen.getByText('Seat guests'));
  expect(alert.mock.calls[0][0]).toBe('T1 is reserved at 19:30');
  expect(svc.seat).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText('Seat now'));
  await waitFor(() => expect(svc.seat).toHaveBeenCalledWith('t1', undefined, { bookingId: 'b9' }));
});

it('takes a reservation deposit off what’s left to pay', async () => {
  svc.getVisit.mockResolvedValue({ success: true, data: { ...visit, depositCredit: 10, due: 8.5 } });
  svc.closeVisit.mockResolvedValue({ success: true, data: { ...visit, status: 'closed', payment: { method: 'cash', amount: 8.5 } } });
  await render(<FloorScreen />);
  await fireEvent.press(await screen.findByLabelText(/^T2, Ordered/));
  await screen.findByText('2× Burger');
  await fireEvent.press(screen.getByText('Pay & close'));
  expect(screen.getByLabelText('Left to pay £8.50')).toBeTruthy();
  expect(screen.getByText(/£10.00 reservation deposit/)).toBeTruthy();
  await fireEvent.press(screen.getByText('Close table'));
  await waitFor(() => expect(svc.closeVisit).toHaveBeenCalledWith('s2', [{ method: 'cash', amount: 8.5 }], false));
});

it('asks before closing when the payments come to less than what’s due', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  svc.closeVisit.mockResolvedValue({ success: true, data: { ...visit, status: 'closed', payment: { method: 'cash', amount: 10 } } });
  await render(<FloorScreen />);
  await fireEvent.press(await screen.findByLabelText(/^T2, Ordered/));
  await screen.findByText('2× Burger');
  await fireEvent.press(screen.getByText('Pay & close'));
  await fireEvent.changeText(screen.getByDisplayValue('18.50'), '10');
  expect(screen.getByText('£8.50 still to pay')).toBeTruthy();
  await fireEvent.press(screen.getByText('Close table'));
  expect(svc.closeVisit).not.toHaveBeenCalled();
  expect(alert.mock.calls[0][0]).toBe('£8.50 still to pay');
  const buttons = alert.mock.calls[0][2] as any[];
  await act(async () => buttons.find((b) => b.text === 'Close anyway').onPress());
  await waitFor(() => expect(svc.closeVisit).toHaveBeenCalledWith('s2', [{ method: 'cash', amount: 10 }], false));
});

it('adds a tip with one tap and records the chosen payment method', async () => {
  svc.closeVisit.mockResolvedValue({ success: true, data: { ...visit, status: 'closed', payment: { method: 'card', amount: 20.35 } } });
  await render(<FloorScreen />);
  await fireEvent.press(await screen.findByLabelText(/^T2, Ordered/));
  await screen.findByText('2× Burger');
  await fireEvent.press(screen.getByText('Pay & close'));
  expect(screen.queryByText('Split bill')).toBeNull();
  await fireEvent.press(screen.getByLabelText('Card'));
  await fireEvent.press(screen.getByText('+10% tip'));
  expect(screen.getByText('Fully paid · £1.85 tip')).toBeTruthy();
  await fireEvent.press(screen.getByText('Close table'));
  await waitFor(() => expect(svc.closeVisit).toHaveBeenCalledWith('s2', [{ method: 'card', amount: 20.35 }], false));
});

describe('landscape', () => {
  beforeEach(() => {
    mockScreen = { width: 1280, height: 800 };
  });

  it('shows a Today panel with reservations beside the floor', async () => {
    svc.listReservations.mockResolvedValue({
      success: true,
      data: [{ _id: 'b9', customerName: 'Ada', guests: 4, slots: ['19:30'], status: 'confirmed', bookingDate: '2026-01-01', seating: null }],
    } as any);
    await render(<FloorScreen />);
    await screen.findByText(/Ground floor:/);
    expect(screen.getByTestId('floor-side-panel')).toBeTruthy();
    expect(screen.getByText('Today')).toBeTruthy();
    expect(await screen.findByLabelText('Seat reservation for Ada, 4 guests at 19:30')).toBeTruthy();
    expect(screen.getByText(/Tap a table to see its orders/)).toBeTruthy();
    // slim summary strip instead of the four cards
    expect(screen.getByLabelText('Seats in use: 2/6')).toBeTruthy();
  });

  it('opens a table in the side panel and works from there', async () => {
    svc.closeVisit.mockResolvedValue({ success: true, data: { ...visit, status: 'closed', payment: { method: 'cash', amount: 18.5 } } } as any);
    await render(<FloorScreen />);
    await fireEvent.press(await screen.findByLabelText(/^T2, Ordered/));
    expect(await screen.findByText('2× Burger')).toBeTruthy();
    expect(screen.queryByText('Today')).toBeNull(); // the panel now shows the table
    expect(screen.getAllByText('T2 · Ordered')).toHaveLength(1); // docked, not also in a sheet
    await fireEvent.press(screen.getByText('Pay & close'));
    await fireEvent.press(screen.getByText('Close table'));
    await waitFor(() => expect(svc.closeVisit).toHaveBeenCalledWith('s2', [{ method: 'cash', amount: 18.5 }], false));
  });

  it('shows each floor’s capacity in Today and switches floor on tap', async () => {
    const terrace = {
      _id: 'f2', name: 'Terrace', sortOrder: 1,
      summary: { tables: 4, tablesFree: 0, tablesOccupied: 3, tablesBlocked: 1, seats: 10, seatsOccupied: 10, seatsEmpty: 0, guests: 11 },
      tables: [{ _id: 't9', label: 'T9', seats: 4, shape: 'square', layout: { x: 0, y: 0, w: 1, h: 1 }, status: 'blocked', session: null }],
    };
    svc.getStatus.mockResolvedValue({ success: true, data: { ...status, floors: [...status.floors, terrace] } });
    await render(<FloorScreen />);
    await screen.findByText(/Ground floor:/);
    expect(screen.getByLabelText('Ground floor: 1 of 2 tables in use, 3 guests, 2 of 6 seats taken, Open')).toBeTruthy();
    expect(screen.getByLabelText('Terrace: 3 of 3 tables in use, 11 guests, 10 of 10 seats taken, Full')).toBeTruthy();
    expect(screen.getByText('1 blocked')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText(/^Terrace: /));
    expect(await screen.findByText(/^Terrace: 0 free/)).toBeTruthy(); // the floor plan now shows the Terrace
  });

  it('closing the table returns the panel to Today', async () => {
    await render(<FloorScreen />);
    await fireEvent.press(await screen.findByLabelText(/^T2, Ordered/));
    await screen.findByText('2× Burger');
    await fireEvent.press(screen.getByLabelText('Close table'));
    expect(screen.getByText('Today')).toBeTruthy();
  });
});

describe('full-screen floor mode', () => {
  it('a quick tap on Exit explains how to leave; holding it leaves', async () => {
    await render(<FloorScreen />);
    await screen.findByText(/Ground floor:/);
    expect(screen.getByText('FLOOR')).toBeTruthy();
    expect(screen.getByText(/1 of 2 tables in use/)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Exit floor'));
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ message: 'Press and hold “Exit” to leave the floor.' }));
    expect(mockRouter.back).not.toHaveBeenCalled();
    await fireEvent(screen.getByLabelText('Exit floor'), 'longPress');
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('has no Reports button (reports live in Analytics)', async () => {
    await render(<FloorScreen />);
    await screen.findByText(/Ground floor:/);
    expect(screen.queryByText('Reports')).toBeNull();
    expect(screen.getByText('Setup')).toBeTruthy();
  });

  it('the Android back button does not leave the floor', async () => {
    const { BackHandler } = require('react-native');
    const spy = jest.spyOn(BackHandler, 'addEventListener');
    await render(<FloorScreen />);
    await screen.findByText(/Ground floor:/);
    const handler = spy.mock.calls.find((c: any[]) => c[0] === 'hardwareBackPress')?.[1] as () => boolean;
    expect(handler).toBeTruthy();
    let handled = false;
    await act(async () => {
      handled = handler();
    });
    expect(handled).toBe(true); // swallowed: shows the hint instead
    expect(mockRouter.back).not.toHaveBeenCalled();
  });
});

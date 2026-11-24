import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import FloorSetupScreen from '../app/floor-setup';
import { floorService } from '../services/floor.service';

jest.setTimeout(20000);

jest.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { _id: 'r1', restaurantName: 'Test' } }) }));
const mockToast = jest.fn();
jest.mock('../context/ToastContext', () => ({ useToast: () => ({ showToast: mockToast }) }));
jest.mock('expo-router', () => {
  const ReactMock = require('react');
  return {
    useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => false }),
    useFocusEffect: (cb: () => void) => ReactMock.useEffect(cb, [cb]),
  };
});
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, SafeAreaProvider: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('expo-print', () => ({ printAsync: jest.fn() }));
// Gestures and SVG aren't needed here: a plain button per table, plus a "drop" helper to simulate dragging
jest.mock('../components/floor/DraggableTable', () => {
  const { TouchableOpacity, Text } = require('react-native');
  return {
    DraggableTable: ({ table, onTap, onDrop }: any) => (
      <>
        <TouchableOpacity onPress={onTap} accessibilityLabel={`Plan ${table.label}`}>
          <Text>{table.label}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onDrop(5, 4)} accessibilityLabel={`Drop ${table.label}`} />
      </>
    ),
  };
});
jest.mock('../components/floor/TableQr', () => ({ TableQr: () => null, qrSheetHtml: () => '<html />' }));

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
      createFloor: jest.fn(),
      updateFloor: jest.fn(),
      deleteFloor: jest.fn(),
      createTable: jest.fn(),
      updateTable: jest.fn(),
      deleteTable: jest.fn(),
      saveLayout: jest.fn(),
      rotateQr: jest.fn(),
    },
  };
});

const svc = floorService as jest.Mocked<typeof floorService>;
const summary = { tables: 2, tablesFree: 2, tablesOccupied: 0, tablesBlocked: 0, seats: 6, seatsOccupied: 0, seatsEmpty: 6, guests: 0 };
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
        { _id: 't1', label: 'T1', seats: 4, shape: 'square', layout: { x: 0, y: 0, w: 1, h: 1 }, status: 'free', session: null, qrToken: 'abcdefgh12' },
        { _id: 't2', label: 'T2', seats: 2, shape: 'round', layout: { x: 2, y: 0, w: 1, h: 1 }, status: 'free', session: null, qrToken: 'abcdefgh34' },
      ],
    },
  ],
} as any;

beforeEach(() => {
  jest.clearAllMocks();
  mockScreen = { width: 750, height: 1334 };
  svc.getStatus.mockResolvedValue({ success: true, data: status });
  svc.saveLayout.mockResolvedValue({ success: true });
  svc.updateTable.mockResolvedValue({ success: true });
});

it('shows the floor with its tables and seats', async () => {
  await render(<FloorSetupScreen />);
  expect(await screen.findByText('2 tables · 6 seats')).toBeTruthy();
  expect(screen.getByLabelText('T1, 4 seats, Square')).toBeTruthy();
  expect(screen.getByLabelText('T2, 2 seats, Round')).toBeTruthy();
});

it('tapping a table shows what you can do with it', async () => {
  await render(<FloorSetupScreen />);
  await fireEvent.press(await screen.findByLabelText('Plan T1'));
  expect(screen.getByText('4 seats · Square · tap a square to move it')).toBeTruthy();
  await fireEvent.press(screen.getByText('Edit'));
  expect(screen.getByText('Edit T1')).toBeTruthy(); // the edit sheet
});

it('keeps unsaved moves in a save bar and saves the layout', async () => {
  await render(<FloorSetupScreen />);
  await fireEvent.press(await screen.findByLabelText('Drop T1'));
  expect(screen.getByText('1 table moved')).toBeTruthy();
  await fireEvent.press(screen.getByText('Save layout'));
  await waitFor(() => expect(svc.saveLayout).toHaveBeenCalledWith('f1', [{ _id: 't1', layout: { x: 5, y: 4, w: 1, h: 1 } }]));
});

it('landscape: tables and the selected table sit in a side panel', async () => {
  mockScreen = { width: 1280, height: 800 };
  await render(<FloorSetupScreen />);
  expect(await screen.findByTestId('setup-side-panel')).toBeTruthy();
  expect(screen.getByText('Tables · 2')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Plan T2'));
  expect(screen.getByText('2 seats · Round · tap a square to move it')).toBeTruthy();
});

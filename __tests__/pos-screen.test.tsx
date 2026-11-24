import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { CreateOrderModal } from '../components/CreateOrderModal';
import { menuService } from '../services/menu.service';
import { orderService } from '../services/order.service';

jest.setTimeout(30000); // the POS is a big module; first render is slow on a cold run

jest.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { _id: 'r1', restaurantName: 'Test', phoneNumber: '07123456789' } }) }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, SafeAreaProvider: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('expo-keep-awake', () => ({ activateKeepAwakeAsync: jest.fn(() => Promise.resolve()), deactivateKeepAwake: jest.fn(() => Promise.resolve()) }));
jest.mock('../services/menu.service', () => ({ menuService: { getRestaurantMenu: jest.fn(), getAllMenuItems: jest.fn() } }));
jest.mock('../services/order.service', () => ({ orderService: { createManualOrder: jest.fn() } }));
jest.mock('../services/thermal-print.service', () => ({ printThermalReceipt: jest.fn() }));
jest.mock('../services/restaurant.service', () => ({ restaurantService: { getRestaurantById: jest.fn(() => Promise.resolve({ success: false })) } }));
// Screen size per test: phone by default, iPad landscape where a test says so
let mockScreen = { width: 390, height: 844 };
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ ...mockScreen, scale: 2, fontScale: 1 }),
}));
jest.mock('../services/restaurant-owner.service', () => ({ restaurantOwnerService: { getRestaurantProfile: jest.fn(() => Promise.resolve({ success: false })) } }));

const menu = [
  { _id: 'm1', itemName: 'Burger', basePrice: 9, eatInPrice: 10, collectionPrice: 8, isAvailable: true, categories: [{ categoryName: 'Mains' }] },
  { _id: 'm2', itemName: 'Chips', basePrice: 3, isAvailable: true, categories: [{ categoryName: 'Sides' }] },
];

describe('POS screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockScreen = { width: 390, height: 844 };
    (menuService.getRestaurantMenu as jest.Mock).mockResolvedValue({ success: true, data: menu });
    (orderService.createManualOrder as jest.Mock).mockResolvedValue({ success: true, data: { orderNumber: 'A1', pricing: { totalAmount: 10 } } });
  });

  const open = async () => {
    await render(<CreateOrderModal visible onClose={jest.fn()} onOrderCreated={jest.fn()} restaurantId="r1" restaurantName="Test" />);
    await waitFor(() => expect(screen.getByLabelText(/^Add Burger/)).toBeTruthy());
  };

  it('shows the order type switch and prices dishes for the chosen type', async () => {
    await open();
    expect(screen.getByRole('radio', { name: 'Dine-in' })).toBeTruthy();
    expect(screen.getByLabelText('Add Burger, £10.00')).toBeTruthy(); // eat-in price
    await fireEvent.press(screen.getByRole('radio', { name: 'Takeaway' }));
    expect(screen.getByLabelText('Add Burger, £8.00')).toBeTruthy(); // collection price
  });

  it('adds a dish to the ticket and places the order', async () => {
    await open();
    await fireEvent.press(screen.getByLabelText('Add Burger, £10.00'));
    // phone layout: open the ticket, then place and confirm on the review step
    await fireEvent.press(screen.getByText('Review & Pay'));
    expect(screen.getByText('Table')).toBeTruthy(); // dine-in asks for the table
    await fireEvent.press(screen.getByText('Place order · £10.00'));
    const confirm = await screen.findAllByText('Place order · £10.00');
    await fireEvent.press(confirm[confirm.length - 1]);
    await waitFor(() => expect(orderService.createManualOrder).toHaveBeenCalled());
    const payload = (orderService.createManualOrder as jest.Mock).mock.calls[0][0];
    expect(payload.orderType).toBe('dine_in');
    expect(payload.items).toEqual([expect.objectContaining({ menuItemId: 'm1', quantity: 1 })]);
  });

  it('pays by the payment method chosen with the radio buttons', async () => {
    await open();
    await fireEvent.press(screen.getByLabelText('Add Burger, £10.00'));
    await fireEvent.press(screen.getByText('Review & Pay'));
    expect(screen.getByRole('radio', { name: 'Cash' }).props.accessibilityState).toEqual(expect.objectContaining({ selected: true }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Card' }));
    await fireEvent.press(screen.getByText('Place order · £10.00'));
    const confirm = await screen.findAllByText('Place order · £10.00');
    await fireEvent.press(confirm[confirm.length - 1]);
    await waitFor(() => expect(orderService.createManualOrder).toHaveBeenCalled());
    expect((orderService.createManualOrder as jest.Mock).mock.calls[0][0].paymentType).toBe('card');
  });

  it('iPad landscape: category sidebar, ticket beside the menu and a full top bar', async () => {
    mockScreen = { width: 1280, height: 890 };
    await open();
    // sidebar categories with counts, no phone tabs
    expect(screen.getByLabelText('Mains, 1 items')).toBeTruthy();
    expect(screen.queryByText('Review & Pay')).toBeNull();
    // top bar keeps the brand and the labelled exit button
    expect(screen.getByText('POS')).toBeTruthy();
    expect(screen.getByText('Hold to exit')).toBeTruthy();
    // ticket is on screen next to the menu
    await fireEvent.press(screen.getByLabelText('Add Burger, £10.00'));
    expect(screen.getByText('Place order · £10.00')).toBeTruthy();
    expect(screen.getByText('Clear order')).toBeTruthy();
    // the ticket keeps its width: a flexBasis of 0 would collapse it to nothing on a real device
    const ticket = StyleSheet.flatten(screen.getByTestId('pos-ticket').props.style);
    expect(ticket.width).toBe(410);
    expect(ticket.flexBasis).toBe('auto');
    expect(ticket.flexGrow).toBe(0);
  });

  it('landscape phone keeps the tabbed phone layout', async () => {
    mockScreen = { width: 844, height: 390 };
    await open();
    expect(screen.getByText('Ticket & Pay')).toBeTruthy(); // Menu / Ticket tabs
    expect(screen.queryByLabelText('Mains, 1 items')).toBeNull();
  });
});

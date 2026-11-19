import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AddressFinderSheet } from '../components/settings/AddressFinderSheet';
import { locationService } from '../services/location.service';

jest.mock('../services/location.service', () => ({
  locationService: { searchAddress: jest.fn() },
}));

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
const wrap = (ui: React.ReactElement) => <SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>;

const match = {
  placeId: 'p1',
  label: '12 Mill Rd, Cambridge CB1 2AD, UK',
  line1: '12 Mill Rd',
  postalCode: 'CB1 2AD',
  city: 'Cambridge',
  lat: 52.2001,
  lon: 0.1312,
};

describe('AddressFinderSheet', () => {
  beforeEach(() => jest.clearAllMocks());

  it('searches a real address and returns it with coordinates', async () => {
    (locationService.searchAddress as jest.Mock).mockResolvedValue({ success: true, data: [match] });
    const onPick = jest.fn();
    const onClose = jest.fn();
    const { getByPlaceholderText, findByText } = await render(
      wrap(<AddressFinderSheet visible onClose={onClose} onPick={onPick} />)
    );

    await fireEvent.changeText(getByPlaceholderText('e.g. CB1 2AD or 12 Mill Road'), 'CB1 2AD');
    await fireEvent.press(await findByText('12 Mill Rd', {}, { timeout: 2000 }));

    expect(locationService.searchAddress).toHaveBeenCalledWith('CB1 2AD');
    expect(onPick).toHaveBeenCalledWith(match);
    expect(onClose).toHaveBeenCalled();
  });

  it('does not search until 3 characters are typed', async () => {
    const { getByPlaceholderText, findByText } = await render(
      wrap(<AddressFinderSheet visible onClose={jest.fn()} onPick={jest.fn()} />)
    );
    await fireEvent.changeText(getByPlaceholderText('e.g. CB1 2AD or 12 Mill Road'), 'CB');
    expect(await findByText('Type at least 3 characters.')).toBeTruthy();
    expect(locationService.searchAddress).not.toHaveBeenCalled();
  });

  it('shows the server message when search fails', async () => {
    (locationService.searchAddress as jest.Mock).mockResolvedValue({ success: false, data: [], message: 'Google Maps API key is not configured' });
    const { getByPlaceholderText, findByText } = await render(
      wrap(<AddressFinderSheet visible onClose={jest.fn()} onPick={jest.fn()} />)
    );
    await fireEvent.changeText(getByPlaceholderText('e.g. CB1 2AD or 12 Mill Road'), 'Mill Road');
    await waitFor(() => expect(locationService.searchAddress).toHaveBeenCalled(), { timeout: 2000 });
    expect(await findByText('Google Maps API key is not configured')).toBeTruthy();
  });
});

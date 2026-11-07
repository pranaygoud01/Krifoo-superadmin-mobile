import React from 'react';
import { render, screen } from '@testing-library/react-native';
import SettingsScreen from '../app/settings';

let mockUser: any = null;

jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, logout: jest.fn() }),
}));
jest.mock('../context/ToastContext', () => ({
  useToast: () => ({ showToast: jest.fn() }),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn(), back: jest.fn(), canGoBack: () => false }),
  useSegments: () => [],
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    SafeAreaView: View,
    SafeAreaProvider: View,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});
jest.mock('../services/orientation.service', () => ({
  getSavedOrientation: jest.fn(() => Promise.resolve('portrait')),
  applyOrientation: jest.fn(() => Promise.resolve(true)),
}));
jest.mock('../services/auth.service', () => ({ authService: { deleteAccount: jest.fn() } }));
jest.mock('../components/Header', () => ({ Header: () => null }));
jest.mock('../components/ConfirmModal', () => ({ ConfirmModal: () => null }));
jest.mock('../app/restaurant-settings', () => {
  const { Text: MockText } = require('react-native');
  return function MockRestaurantSettings() {
    return <MockText>owner-settings</MockText>;
  };
});

it('survives an owner logging out (user -> null) without a hook-order crash', async () => {
  mockUser = { _id: 'r1', userType: 'owner' };
  const { rerender } = await render(<SettingsScreen />);
  expect(screen.getByText('owner-settings')).toBeTruthy();

  // Before the fix this re-render threw "Rendered more hooks than during the previous render"
  mockUser = null;
  await rerender(<SettingsScreen />);
  expect(screen.queryByText('owner-settings')).toBeNull();
});

it('switches from super admin to owner view without crashing', async () => {
  mockUser = { _id: 'a1', userType: 'super_admin', fullName: 'Ada Admin' };
  const { rerender } = await render(<SettingsScreen />);
  expect(screen.getByText('Ada Admin')).toBeTruthy();

  mockUser = { _id: 'r1', userType: 'owner' };
  await rerender(<SettingsScreen />);
  expect(screen.getByText('owner-settings')).toBeTruthy();
});

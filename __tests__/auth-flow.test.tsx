import React from 'react';
import { Text, DeviceEventEmitter } from 'react-native';
import { render, screen, act, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../constants/config';
import { SESSION_EXPIRED_EVENT } from '../services/api';
import { AuthProvider, useAuth } from '../context/AuthContext';

jest.mock('../services/notification', () => ({
  setupPushNotifications: jest.fn(() => Promise.resolve()),
  unregisterPushTokenFromBackend: jest.fn(() => Promise.resolve(true)),
}));

function WhoAmI() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <Text>loading</Text>;
  return <Text>{user ? `user:${user._id}` : 'signed-out'}</Text>;
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

it('signs out and clears storage when the API reports an expired session', async () => {
  await AsyncStorage.setItem(STORAGE_KEYS.ADMIN_TOKEN, 'jwt-123');
  await AsyncStorage.setItem(STORAGE_KEYS.ADMIN_USER, JSON.stringify({ _id: 'u1', userType: 'owner' }));

  await render(
    <AuthProvider>
      <WhoAmI />
    </AuthProvider>
  );
  expect(await screen.findByText('user:u1')).toBeTruthy();

  await act(async () => {
    DeviceEventEmitter.emit(SESSION_EXPIRED_EVENT, { path: '/api/orders' });
  });

  expect(await screen.findByText('signed-out')).toBeTruthy();
  await waitFor(async () => {
    expect(await AsyncStorage.getItem(STORAGE_KEYS.ADMIN_TOKEN)).toBeNull();
    expect(await AsyncStorage.getItem(STORAGE_KEYS.ADMIN_USER)).toBeNull();
  });
});

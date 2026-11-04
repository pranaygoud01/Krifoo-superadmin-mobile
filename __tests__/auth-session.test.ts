import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';
import { STORAGE_KEYS } from '../constants/config';
import { apiRequest, SESSION_EXPIRED_EVENT } from '../services/api';
import { authService } from '../services/auth.service';

jest.mock('../services/notification', () => ({
  unregisterPushTokenFromBackend: jest.fn(() => Promise.resolve(true)),
}));

function jsonResponse(status: number, body: object) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

const fetchMock = jest.fn();
(global as any).fetch = fetchMock;

async function seedSession() {
  await AsyncStorage.setItem(STORAGE_KEYS.ADMIN_TOKEN, 'jwt-123');
  await AsyncStorage.setItem(STORAGE_KEYS.ADMIN_USER, JSON.stringify({ _id: 'u1', userType: 'owner' }));
}

beforeEach(async () => {
  await AsyncStorage.clear();
  fetchMock.mockReset();
});

describe('authService.logout', () => {
  it('clears the persisted session so a relaunch does not auto-login', async () => {
    await seedSession();
    fetchMock.mockResolvedValue(jsonResponse(200, { success: true }));

    await authService.logout();

    expect(await AsyncStorage.getItem(STORAGE_KEYS.ADMIN_TOKEN)).toBeNull();
    expect(await authService.getCurrentAdmin()).toBeNull();
  });

  it('clears the session even when the server is unreachable', async () => {
    await seedSession();
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));

    await authService.logout();

    expect(await AsyncStorage.getItem(STORAGE_KEYS.ADMIN_TOKEN)).toBeNull();
    expect(await AsyncStorage.getItem(STORAGE_KEYS.ADMIN_USER)).toBeNull();
  });
});

describe('apiRequest session expiry', () => {
  let listener: jest.Mock;
  let sub: { remove: () => void };

  beforeEach(() => {
    listener = jest.fn();
    sub = DeviceEventEmitter.addListener(SESSION_EXPIRED_EVENT, listener);
  });
  afterEach(() => sub.remove());

  it('emits session-expired on 401 from a protected endpoint', async () => {
    await seedSession();
    fetchMock.mockResolvedValue(jsonResponse(401, { message: 'jwt expired' }));

    const res = await apiRequest('/api/orders');

    expect(res.success).toBe(false);
    expect(res.errorType).toBe('auth');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('emits session-expired on a non-JSON 401 as well', async () => {
    await seedSession();
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      headers: { get: () => 'text/html' },
      text: async () => 'Unauthorized',
    });

    await apiRequest('/api/orders');

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('does not log out on wrong credentials at the login endpoint', async () => {
    await seedSession();
    fetchMock.mockResolvedValue(jsonResponse(401, { message: 'Invalid credentials' }));

    await apiRequest('/api/auth/admin/login', { method: 'POST', body: {} });

    expect(listener).not.toHaveBeenCalled();
  });

  it('does not emit when no token was sent', async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { message: 'no token' }));

    await apiRequest('/api/orders');

    expect(listener).not.toHaveBeenCalled();
  });

  it('does not emit for other errors such as 403', async () => {
    await seedSession();
    fetchMock.mockResolvedValue(jsonResponse(403, { message: 'forbidden' }));

    await apiRequest('/api/orders');

    expect(listener).not.toHaveBeenCalled();
  });
});

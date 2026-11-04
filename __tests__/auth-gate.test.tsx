import React from 'react';
import { render } from '@testing-library/react-native';
import { AuthGate } from '../components/AuthGate';

const mockReplace = jest.fn();
let mockSegments: string[] = [];
let mockAuth: { user: any; isLoading: boolean } = { user: null, isLoading: false };

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSegments: () => mockSegments,
}));
jest.mock('../context/AuthContext', () => ({
  useAuth: () => mockAuth,
}));

beforeEach(() => {
  mockReplace.mockClear();
});

it.each([['(tabs)'], ['settings'], ['order-details']])(
  'redirects to /login from protected route %s when signed out',
  async (route) => {
    mockSegments = [route];
    mockAuth = { user: null, isLoading: false };
    await render(<AuthGate />);
    expect(mockReplace).toHaveBeenCalledWith('/login');
  }
);

it.each([['login'], ['register'], ['privacy-policy'], ['terms-conditions']])(
  'leaves public route %s alone',
  async (route) => {
    mockSegments = [route];
    mockAuth = { user: null, isLoading: false };
    await render(<AuthGate />);
    expect(mockReplace).not.toHaveBeenCalled();
  }
);

it('does not redirect from the splash index route', async () => {
  mockSegments = [];
  mockAuth = { user: null, isLoading: false };
  await render(<AuthGate />);
  expect(mockReplace).not.toHaveBeenCalled();
});

it('waits while the session is still loading', async () => {
  mockSegments = ['(tabs)'];
  mockAuth = { user: null, isLoading: true };
  await render(<AuthGate />);
  expect(mockReplace).not.toHaveBeenCalled();
});

it('does nothing when signed in', async () => {
  mockSegments = ['(tabs)'];
  mockAuth = { user: { _id: 'u1' }, isLoading: false };
  await render(<AuthGate />);
  expect(mockReplace).not.toHaveBeenCalled();
});

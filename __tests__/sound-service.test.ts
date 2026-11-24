import { AppState, Vibration } from 'react-native';

jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(() => Promise.resolve(null)), setItem: jest.fn() }));
jest.mock('expo-haptics', () => ({ notificationAsync: jest.fn(() => Promise.resolve()), impactAsync: jest.fn(() => Promise.resolve()), NotificationFeedbackType: {}, ImpactFeedbackStyle: {} }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ localUri: 'file://buzz.wav', downloadAsync: jest.fn() }) } }));
jest.mock('@/constants/local-assets', () => ({ LocalSounds: { orderBuzz: 1 }, getOrderBuzzPlaybackSource: jest.fn() }));
const mockCreateAsync = jest.fn();
jest.mock('expo-av', () => ({
  Audio: { setAudioModeAsync: jest.fn(() => Promise.resolve()), Sound: { createAsync: (...a: any[]) => mockCreateAsync(...a) } },
  InterruptionModeIOS: { DoNotMix: 1 },
  InterruptionModeAndroid: { DoNotMix: 1 },
}));

// eslint-disable-next-line import/first
import { playOrderBuzzSound } from '../services/sound.service';

const setAppState = (s: string) => Object.defineProperty(AppState, 'currentState', { value: s, configurable: true });

describe('order buzz sound', () => {
  let errorSpy: jest.SpyInstance;
  beforeEach(() => {
    jest.useFakeTimers();
    mockCreateAsync.mockReset();
    jest.spyOn(Vibration, 'vibrate').mockImplementation(() => {});
    jest.spyOn(Vibration, 'cancel').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('does not try to play while the app is in the background', async () => {
    setAppState('background');
    await expect(playOrderBuzzSound(1000, 'order')).resolves.toBe(false);
    expect(mockCreateAsync).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('treats Android refusing audio focus as expected, not an error', async () => {
    setAppState('active');
    mockCreateAsync.mockResolvedValue({
      sound: {
        playAsync: jest.fn(() => Promise.reject(new Error('expo.modules.av.AudioFocusNotAcquiredException: This experience is currently in the background, so audio focus could not be acquired.'))),
        stopAsync: jest.fn(() => Promise.resolve()),
        unloadAsync: jest.fn(() => Promise.resolve()),
      },
    });
    await expect(playOrderBuzzSound(1000, 'order')).resolves.toBe(false);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('plays when the app is on screen', async () => {
    setAppState('active');
    const playAsync = jest.fn(() => Promise.resolve());
    mockCreateAsync.mockResolvedValue({ sound: { playAsync, stopAsync: jest.fn(() => Promise.resolve()), unloadAsync: jest.fn(() => Promise.resolve()) } });
    await jest.advanceTimersByTimeAsync(2000); // past the duplicate-trigger guard
    await expect(playOrderBuzzSound(1000, 'order')).resolves.toBe(true);
    expect(playAsync).toHaveBeenCalled();
  });
});

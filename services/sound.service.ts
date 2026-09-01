import { Audio } from 'expo-av';
import { Vibration, Platform, AppState } from 'react-native';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const SOUND_SETTINGS_KEY = '@krifoo_admin_sound_settings';

export interface SoundSettings {
  enabled: boolean;
  volume: number; // 0.3, 0.7, 1.0
  durationSeconds: number; // 3, 5, 10, 15
  vibrationEnabled: boolean;
  notifyOrders: boolean;
  notifyBookings: boolean;
  notifyCancellations: boolean;
}

export const DEFAULT_SOUND_SETTINGS: SoundSettings = {
  enabled: true,
  volume: 1.0,
  durationSeconds: 5,
  vibrationEnabled: true,
  notifyOrders: true,
  notifyBookings: true,
  notifyCancellations: true,
};

let activeSound: Audio.Sound | null = null;
let buzzTimeout: any = null;
let iosHapticInterval: any = null;
let currentRequestId = 0;
let lastPlayTimestamp = 0;

/**
 * Retrieve saved sound settings or fallback to defaults
 */
export async function getSoundSettings(): Promise<SoundSettings> {
  try {
    const raw = await AsyncStorage.getItem(SOUND_SETTINGS_KEY);
    if (raw) {
      return { ...DEFAULT_SOUND_SETTINGS, ...JSON.parse(raw) };
    }
  } catch (e) {
    console.warn('[SoundService] Failed to load sound settings:', e);
  }
  return DEFAULT_SOUND_SETTINGS;
}

/**
 * Save updated sound settings
 */
export async function saveSoundSettings(settings: Partial<SoundSettings>): Promise<SoundSettings> {
  try {
    const current = await getSoundSettings();
    const updated = { ...current, ...settings };
    await AsyncStorage.setItem(SOUND_SETTINGS_KEY, JSON.stringify(updated));
    return updated;
  } catch (e) {
    console.warn('[SoundService] Failed to save sound settings:', e);
    return DEFAULT_SOUND_SETTINGS;
  }
}

/**
 * Configure audio mode to ensure sound plays loudly even if device is on silent/vibrate
 */
async function configureAudio() {
  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
  } catch (err) {
    console.warn('[SoundService] Failed to configure audio mode:', err);
  }
}

/**
 * Immediately stop playing the order buzz sound and cancel vibration.
 */
export async function stopOrderBuzzSound(): Promise<void> {
  // Invalidate any in-flight sound creations
  currentRequestId++;

  if (buzzTimeout) {
    clearTimeout(buzzTimeout);
    buzzTimeout = null;
  }
  if (iosHapticInterval) {
    clearInterval(iosHapticInterval);
    iosHapticInterval = null;
  }

  try {
    Vibration.cancel();
  } catch (e) {}

  if (activeSound) {
    const soundToStop = activeSound;
    activeSound = null;
    try {
      await soundToStop.stopAsync();
    } catch (e) {}
    try {
      await soundToStop.unloadAsync();
    } catch (e) {}
  }
}

/**
 * Play an order buzz sound and vibration alert for new orders.
 * Thread-safe with race condition protection & automatic guaranteed termination.
 * @param overrideDurationMs Optional duration override in milliseconds
 * @param eventType Optional event filter ('order' | 'booking' | 'cancellation')
 */
export async function playOrderBuzzSound(
  overrideDurationMs?: number,
  eventType?: 'order' | 'booking' | 'cancellation'
): Promise<void> {
  const settings = await getSoundSettings();

  // Check master switch
  if (!settings.enabled) {
    console.log('[SoundService] Sound alerts are disabled.');
    return;
  }

  // Check event-specific switches
  if (eventType === 'order' && !settings.notifyOrders) return;
  if (eventType === 'booking' && !settings.notifyBookings) return;
  if (eventType === 'cancellation' && !settings.notifyCancellations) return;

  const durationMs = overrideDurationMs || (settings.durationSeconds * 1000);
  const now = Date.now();

  // Debounce rapid duplicate calls (within 1.5s) to avoid overlapping audio loops
  if (now - lastPlayTimestamp < 1500 && activeSound) {
    console.log('[SoundService] Buzz alert already playing, skipping duplicate trigger.');
    return;
  }
  lastPlayTimestamp = now;

  const requestId = ++currentRequestId;

  try {
    // 1. Stop any currently playing audio & vibration first
    if (buzzTimeout) {
      clearTimeout(buzzTimeout);
      buzzTimeout = null;
    }
    if (iosHapticInterval) {
      clearInterval(iosHapticInterval);
      iosHapticInterval = null;
    }

    try {
      Vibration.cancel();
    } catch (e) {}

    if (activeSound) {
      const oldSound = activeSound;
      activeSound = null;
      try {
        await oldSound.stopAsync();
      } catch (e) {}
      try {
        await oldSound.unloadAsync();
      } catch (e) {}
    }

    // If another request started while we were stopping, abort
    if (requestId !== currentRequestId) return;

    console.log(`[SoundService] Triggering ${durationMs}ms order buzz alert (Vol: ${settings.volume})...`);

    // 2. Start vibration pattern if enabled
    if (settings.vibrationEnabled) {
      if (Platform.OS === 'android') {
        Vibration.vibrate([0, 600, 150, 600, 150, 600, 150, 600, 150, 600, 150, 600], false);
      } else {
        Vibration.vibrate();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        iosHapticInterval = setInterval(() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
        }, 700);
      }
    }

    // 3. Audio setup & playback
    await configureAudio();

    if (requestId !== currentRequestId) return;

    const { sound } = await Audio.Sound.createAsync(
      require('../assets/sounds/order_buzz.wav'),
      {
        shouldPlay: false,
        isLooping: true,
        volume: settings.volume,
      }
    );

    // If stopped/cancelled while loading the asset, immediately unload
    if (requestId !== currentRequestId) {
      try {
        await sound.unloadAsync();
      } catch (e) {}
      return;
    }

    activeSound = sound;
    await sound.playAsync();

    // 4. Guaranteed auto-stop buzz after specified duration
    buzzTimeout = setTimeout(async () => {
      if (requestId === currentRequestId) {
        console.log('[SoundService] Auto-stopping buzz after duration expired.');
        await stopOrderBuzzSound();
      }
    }, durationMs);

  } catch (error) {
    console.error('[SoundService] Error playing order buzz sound:', error);
    // Fallback vibration if enabled
    if (settings.vibrationEnabled) {
      if (Platform.OS === 'android') {
        Vibration.vibrate([0, 600, 150, 600, 150, 600, 150, 600, 150, 600, 150, 600], false);
      } else {
        Vibration.vibrate();
      }
    }
    // Ensure timeout cleans up vibration
    buzzTimeout = setTimeout(async () => {
      await stopOrderBuzzSound();
    }, durationMs);
  }
}

// Stop buzz if app goes into background
AppState.addEventListener('change', (state) => {
  if (state !== 'active') {
    stopOrderBuzzSound().catch(() => {});
  }
});

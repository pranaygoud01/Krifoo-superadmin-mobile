import { Audio } from 'expo-av';
import { Vibration, Platform, AppState } from 'react-native';
import * as Haptics from 'expo-haptics';

let activeSound: Audio.Sound | null = null;
let buzzTimeout: any = null;
let iosHapticInterval: any = null;
let currentRequestId = 0;
let lastPlayTimestamp = 0;

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
 * Play a 5-second buzz sound and vibration alert for new orders.
 * Thread-safe with race condition protection & automatic guaranteed termination.
 * @param durationMs Duration in milliseconds (defaults to 5000ms / 5s)
 */
export async function playOrderBuzzSound(durationMs: number = 5000): Promise<void> {
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

    console.log(`[SoundService] Triggering ${durationMs}ms order buzz alert...`);

    // 2. Start vibration pattern
    if (Platform.OS === 'android') {
      Vibration.vibrate([0, 600, 150, 600, 150, 600, 150, 600, 150, 600, 150, 600], false);
    } else {
      Vibration.vibrate();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      iosHapticInterval = setInterval(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
      }, 700);
    }

    // 3. Audio setup & playback
    await configureAudio();

    if (requestId !== currentRequestId) return;

    const { sound } = await Audio.Sound.createAsync(
      require('../assets/sounds/order_buzz.wav'),
      {
        shouldPlay: false,
        isLooping: true,
        volume: 1.0,
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

    // 4. Guaranteed auto-stop buzz after specified duration (5 seconds)
    buzzTimeout = setTimeout(async () => {
      if (requestId === currentRequestId) {
        console.log('[SoundService] Auto-stopping buzz after duration expired.');
        await stopOrderBuzzSound();
      }
    }, durationMs);

  } catch (error) {
    console.error('[SoundService] Error playing order buzz sound:', error);
    // Fallback vibration
    if (Platform.OS === 'android') {
      Vibration.vibrate([0, 600, 150, 600, 150, 600, 150, 600, 150, 600, 150, 600], false);
    } else {
      Vibration.vibrate();
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

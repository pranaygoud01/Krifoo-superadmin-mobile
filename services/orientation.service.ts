import * as ScreenOrientation from 'expo-screen-orientation';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type AppOrientation = 'portrait' | 'landscape' | 'auto';

const ORIENTATION_STORAGE_KEY = '@krifoo_screen_orientation';

/**
 * Get current saved orientation preference (defaults to 'portrait' or current screen)
 */
export async function getSavedOrientation(): Promise<AppOrientation> {
  try {
    const saved = await AsyncStorage.getItem(ORIENTATION_STORAGE_KEY);
    if (saved === 'landscape' || saved === 'portrait' || saved === 'auto') {
      return saved;
    }
    return 'auto';
  } catch {
    return 'auto';
  }
}

/**
 * Apply and lock screen orientation, then save preference
 */
export async function applyOrientation(mode: AppOrientation): Promise<boolean> {
  try {
    if (mode === 'landscape') {
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    } else if (mode === 'portrait') {
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    } else {
      await ScreenOrientation.unlockAsync();
    }

    await AsyncStorage.setItem(ORIENTATION_STORAGE_KEY, mode);
    return true;
  } catch (error) {
    console.error('[Orientation] Failed to change orientation:', error);
    return false;
  }
}

/**
 * Restore saved orientation on app startup
 */
export async function initAppOrientation(): Promise<void> {
  try {
    const saved = await getSavedOrientation();
    if (saved === 'landscape') {
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    } else if (saved === 'portrait') {
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    } else {
      await ScreenOrientation.unlockAsync();
    }
  } catch (error) {
    console.warn('[Orientation] Failed to initialize orientation:', error);
  }
}

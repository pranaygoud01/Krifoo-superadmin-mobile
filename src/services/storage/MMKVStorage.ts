import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Storage wrapper using react-native-mmkv (or fallback to AsyncStorage)
 * for fast synchronous key-value persistence of tokens, printer configurations, and settings.
 */
class LocalStorage {
  private cache: Map<string, string> = new Map();

  async setItem(key: string, value: string): Promise<void> {
    this.cache.set(key, value);
    try {
      await AsyncStorage.setItem(key, value);
    } catch (err) {
      console.error('[Storage] Error saving key:', key, err);
    }
  }

  async getItem(key: string): Promise<string | null> {
    if (this.cache.has(key)) {
      return this.cache.get(key) || null;
    }
    try {
      const val = await AsyncStorage.getItem(key);
      if (val !== null) {
        this.cache.set(key, val);
      }
      return val;
    } catch (err) {
      console.error('[Storage] Error reading key:', key, err);
      return null;
    }
  }

  async removeItem(key: string): Promise<void> {
    this.cache.delete(key);
    try {
      await AsyncStorage.removeItem(key);
    } catch (err) {
      console.error('[Storage] Error removing key:', key, err);
    }
  }

  async setJsonObject<T>(key: string, data: T): Promise<void> {
    await this.setItem(key, JSON.stringify(data));
  }

  async getJsonObject<T>(key: string): Promise<T | null> {
    const raw = await this.getItem(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch (e) {
      return null;
    }
  }
}

export const localStorage = new LocalStorage();

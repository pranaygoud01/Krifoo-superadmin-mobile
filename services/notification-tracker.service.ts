import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';

const READ_NOTIFICATION_IDS_KEY = '@krifoo_read_notification_ids';
const NOTIFICATIONS_LAST_SEEN_KEY = '@krifoo_notifications_last_seen_at';
export const NOTIFICATIONS_BADGE_EVENT = 'notifications_badge_updated';

// In-memory cache for ultra-fast sync across components
let _cachedReadIds: Set<string> | null = null;
let _cachedLastSeenAt: number | null = null;

export async function getReadNotificationIds(): Promise<Set<string>> {
  if (_cachedReadIds) return _cachedReadIds;
  try {
    const raw = await AsyncStorage.getItem(READ_NOTIFICATION_IDS_KEY);
    if (raw) {
      const parsed: string[] = JSON.parse(raw);
      _cachedReadIds = new Set(parsed);
      return _cachedReadIds;
    }
  } catch (err) {
    console.warn('[NotificationTracker] Error loading read IDs:', err);
  }
  _cachedReadIds = new Set();
  return _cachedReadIds;
}

export async function getNotificationsLastSeenAt(): Promise<number> {
  if (_cachedLastSeenAt !== null) return _cachedLastSeenAt;
  try {
    const raw = await AsyncStorage.getItem(NOTIFICATIONS_LAST_SEEN_KEY);
    if (raw) {
      _cachedLastSeenAt = Number(raw) || 0;
      return _cachedLastSeenAt;
    }
  } catch (err) {
    console.warn('[NotificationTracker] Error loading last seen timestamp:', err);
  }
  _cachedLastSeenAt = 0;
  return 0;
}

export async function markNotificationAsRead(id: string): Promise<void> {
  try {
    const readIds = await getReadNotificationIds();
    readIds.add(id);
    _cachedReadIds = readIds;
    await AsyncStorage.setItem(
      READ_NOTIFICATION_IDS_KEY,
      JSON.stringify(Array.from(readIds).slice(-500)) // Keep recent 500
    );
    DeviceEventEmitter.emit(NOTIFICATIONS_BADGE_EVENT);
  } catch (err) {
    console.warn('[NotificationTracker] Error marking notification read:', err);
  }
}

export async function markAllNotificationsAsRead(ids: string[]): Promise<void> {
  try {
    const readIds = await getReadNotificationIds();
    ids.forEach((id) => readIds.add(id));
    _cachedReadIds = readIds;

    const now = Date.now();
    _cachedLastSeenAt = now;

    await Promise.all([
      AsyncStorage.setItem(
        READ_NOTIFICATION_IDS_KEY,
        JSON.stringify(Array.from(readIds).slice(-500))
      ),
      AsyncStorage.setItem(NOTIFICATIONS_LAST_SEEN_KEY, String(now)),
    ]);

    DeviceEventEmitter.emit(NOTIFICATIONS_BADGE_EVENT, 0);
  } catch (err) {
    console.warn('[NotificationTracker] Error marking all notifications read:', err);
  }
}

export async function setNotificationsSeen(): Promise<void> {
  try {
    const now = Date.now();
    _cachedLastSeenAt = now;
    await AsyncStorage.setItem(NOTIFICATIONS_LAST_SEEN_KEY, String(now));
    DeviceEventEmitter.emit(NOTIFICATIONS_BADGE_EVENT, 0);
  } catch (err) {
    console.warn('[NotificationTracker] Error setting notifications seen:', err);
  }
}

/**
 * Computes actual unread notification count, filtering out items that have already been seen or read
 */
export async function computeUnreadCount(
  orders: any[],
  restaurants: any[]
): Promise<number> {
  const [readIds, lastSeenAt] = await Promise.all([
    getReadNotificationIds(),
    getNotificationsLastSeenAt(),
  ]);

  let count = 0;

  // 1. Pending restaurant applications
  if (Array.isArray(restaurants)) {
    for (const r of restaurants) {
      if (r.verificationStatus === 'pending') {
        const id = `rest_${r._id}`;
        const createdAtTime = r.createdAt ? new Date(r.createdAt).getTime() : 0;
        if (!readIds.has(id) && (!lastSeenAt || createdAtTime > lastSeenAt)) {
          count++;
        }
      }
    }
  }

  // 2. Placed / preparing active orders
  if (Array.isArray(orders)) {
    for (const o of orders) {
      if (o.status === 'placed' || o.status === 'preparing') {
        const id = `order_${o._id}`;
        const createdAtTime = o.createdAt ? new Date(o.createdAt).getTime() : 0;
        if (!readIds.has(id) && (!lastSeenAt || createdAtTime > lastSeenAt)) {
          count++;
        }
      }
    }
  }

  return count;
}

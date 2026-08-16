import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { apiRequest } from './api';
import AsyncStorage from '@react-native-async-storage/async-storage';

let Notifications: any = null;
try {
  Notifications = require('expo-notifications');
  if (Notifications && Notifications.setNotificationHandler) {
    // Configure foreground notifications behavior
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });
  }
} catch (error) {
  console.warn('[Push] expo-notifications native module not available. Push notifications will be disabled.');
}

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (!Notifications) {
    console.warn('[Push] Notifications module not loaded.');
    return null;
  }

  let token: string | null = null;

  if (Platform.OS === 'android') {
    try {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF5C39',
      });
    } catch (err) {
      console.warn('[Push] Could not set notification channel:', err);
    }
  }

  if (Device.isDevice) {
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted') {
        console.warn('[Push] Permission denied for native push alerts.');
        return null;
      }

      const tokenData = await Notifications.getExpoPushTokenAsync();
      token = tokenData.data;
      console.log('[Push] Device Push Token captured:', token);
    } catch (error) {
      console.error('[Push] Error fetching Expo push token:', error);
    }
  } else {
    console.warn('[Push] Must use physical device for Push Notifications');
  }

  return token;
}

export async function registerPushTokenWithBackend(token: string): Promise<boolean> {
  try {
    const res = await apiRequest('/api/notifications/register-mobile', {
      method: 'POST',
      body: { token },
    });
    if (res.success) {
      console.log('[Push] Registered push token with backend successfully.');
      await AsyncStorage.setItem('registered_push_token', token);
      return true;
    }
    console.error('[Push] Failed to register push token with backend:', res.message);
    return false;
  } catch (error) {
    console.error('[Push] Network error registering push token with backend:', error);
    return false;
  }
}

export async function setupPushNotifications(): Promise<void> {
  try {
    const token = await registerForPushNotificationsAsync();
    if (token) {
      console.log('[Push] Registering token with backend:', token);
      await registerPushTokenWithBackend(token);
    }
  } catch (err) {
    console.error('[Push] setupPushNotifications failed:', err);
  }
}

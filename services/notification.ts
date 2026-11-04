let TaskManager: any = null;
try {
  TaskManager = require('expo-task-manager');
} catch (e) {
  console.warn('[NotificationService] expo-task-manager module not available in this build environment.');
}

import * as Device from 'expo-device';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { apiRequest } from './api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { playOrderBuzzSound } from './sound.service';
import { printThermalReceipt, isAutoPrintEnabled } from './thermal-print.service';
import { orderService } from './order.service';
import { STORAGE_KEYS } from '../constants/config';
import { claimOrderAlert } from './order-alert-registry';

async function getActiveRestaurantContext(): Promise<{ isOwner: boolean; restaurantId: string | null }> {
  try {
    const userStr = await AsyncStorage.getItem(STORAGE_KEYS.ADMIN_USER);
    if (!userStr) return { isOwner: false, restaurantId: null };
    const user = JSON.parse(userStr);
    return {
      isOwner: user.userType === 'owner',
      restaurantId: user.restaurantId || user._id || user.id || null,
    };
  } catch {
    return { isOwner: false, restaurantId: null };
  }
}

let Notifications: any = null;
let notificationListener: any = null;

export const BACKGROUND_NOTIFICATION_TASK = 'BACKGROUND_NOTIFICATION_TASK';

// Define the background notification task so Android wakes up the app when closed / killed
if (TaskManager && typeof TaskManager.defineTask === 'function') {
  try {
    TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, async ({ data, error }: any) => {
      if (error) {
        console.error('[Background Notification] Task error:', error);
        return;
      }

      try {
        console.log('[Background Notification] Received push in background/closed state:', JSON.stringify(data));
        const autoPrint = await isAutoPrintEnabled();
        if (!autoPrint) {
          console.log('[Background Notification] Auto-print disabled, skipping.');
          return;
        }

        const notification = data?.notification;
        const content = notification?.request?.content || data || {};
        const notificationData = content.data || data?.data || {};

        const status = notificationData.status || notificationData.order?.status || '';
        const isNonNewStatus = ['preparing', 'ready_for_pickup', 'out_for_delivery', 'delivered', 'cancelled'].includes(status);
        if (isNonNewStatus) {
          return;
        }

        const orderObj = notificationData.order || notificationData.data || (notificationData.orderedItems ? notificationData : null);
        const orderId = notificationData.orderId || notificationData.id || orderObj?._id;

        const notifRestId = notificationData.restaurantId || notificationData.order?.restaurantId || orderObj?.restaurantId;
        const parsedNotifRestId = typeof notifRestId === 'object' ? notifRestId?._id : notifRestId;
        const { isOwner, restaurantId: currentRestId } = await getActiveRestaurantContext();

        if (isOwner && currentRestId && parsedNotifRestId && String(currentRestId) !== String(parsedNotifRestId)) {
          console.log(`[Background Notification] Skipping: Order for restaurant ${parsedNotifRestId}, but active is ${currentRestId}`);
          return;
        }

        if (!claimOrderAlert(orderId)) {
          console.log(`[Background Notification] Order ${orderId} already alerted. Skipping print.`);
          return;
        }

        if (orderObj && (orderObj.orderedItems?.length || orderObj.items?.length)) {
          const orderRestId = typeof orderObj.restaurantId === 'object' ? orderObj.restaurantId?._id : orderObj.restaurantId;
          if (isOwner && currentRestId && orderRestId && String(currentRestId) !== String(orderRestId)) {
            console.log(`[Background Notification] Skipping: Payload order restaurant ${orderRestId} !== active ${currentRestId}`);
            return;
          }
          console.log('[Background Notification] Printing receipt directly from push payload...');
          await printThermalReceipt(orderObj);
        } else if (orderId) {
          console.log('[Background Notification] Fetching order for background print, ID:', orderId);
          const res = await orderService.getOrderById(orderId);
          if (res.success && res.data) {
            const fetchedRestId = typeof res.data.restaurantId === 'object' ? (res.data.restaurantId as any)?._id : res.data.restaurantId;
            if (isOwner && currentRestId && fetchedRestId && String(currentRestId) !== String(fetchedRestId)) {
              console.log(`[Background Notification] Skipping print: Fetched order restaurant ${fetchedRestId} !== active ${currentRestId}`);
              return;
            }
            await printThermalReceipt(res.data);
          }
        }
      } catch (err) {
        console.error('[Background Notification] Background print failed:', err);
      }
    });
  } catch (taskDefError) {
    console.warn('[Background Notification] Could not define TaskManager task:', taskDefError);
  }
}

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

    // Listen for incoming notifications in foreground to trigger 5-sec buzz sound and auto-print
    if (Notifications.addNotificationReceivedListener && !notificationListener) {
      notificationListener = Notifications.addNotificationReceivedListener((notification: any) => {
        const title = notification?.request?.content?.title || '';
        const body = notification?.request?.content?.body || '';
        const data = notification?.request?.content?.data || {};

        const status = data.status || data.order?.status || '';
        const isNonNewStatus = ['preparing', 'ready_for_pickup', 'out_for_delivery', 'delivered', 'cancelled'].includes(status);

        const isNewOrderNotification =
          !isNonNewStatus &&
          (
            data.type === 'NEW_ORDER' ||
            data.type === 'ORDER_CREATED' ||
            data.type === 'ORDER_PLACED' ||
            (data.isNew === true && status === 'placed') ||
            title.toLowerCase().includes('new order') ||
            body.toLowerCase().includes('new order')
          );

        if (isNewOrderNotification) {
          const notifRestId = data.restaurantId || data.order?.restaurantId;
          const parsedNotifRestId = typeof notifRestId === 'object' ? notifRestId?._id : notifRestId;

          getActiveRestaurantContext().then(async ({ isOwner, restaurantId: currentRestId }) => {
            if (isOwner && currentRestId && parsedNotifRestId && String(currentRestId) !== String(parsedNotifRestId)) {
              console.log(`[Notification] Skipping alert: Notification is for restaurant ${parsedNotifRestId}, but active restaurant is ${currentRestId}`);
              return;
            }

            const orderObj = data.order || data.data || (data.orderedItems ? data : null);
            const orderId = data.orderId || data.id || orderObj?._id;
            if (!claimOrderAlert(orderId)) {
              console.log(`[Notification] Order ${orderId} already alerted via another channel. Skipping.`);
              return;
            }

            console.log('[Notification] Incoming new order notification received! Triggering 5-sec buzz sound...');
            playOrderBuzzSound(5000).catch(console.error);

            // Auto-print thermal receipt if enabled
            const autoPrint = await isAutoPrintEnabled();
            if (!autoPrint) return;

            if (orderObj && (orderObj.orderedItems?.length || orderObj.items?.length)) {
              const orderRestId = typeof orderObj.restaurantId === 'object' ? orderObj.restaurantId?._id : orderObj.restaurantId;
              if (isOwner && currentRestId && orderRestId && String(currentRestId) !== String(orderRestId)) {
                return;
              }
              await printThermalReceipt(orderObj);
            } else if (orderId) {
              try {
                const res = await orderService.getOrderById(orderId);
                if (res.success && res.data) {
                  const fetchedRestId = typeof res.data.restaurantId === 'object' ? (res.data.restaurantId as any)?._id : res.data.restaurantId;
                  if (isOwner && currentRestId && fetchedRestId && String(currentRestId) !== String(fetchedRestId)) {
                    console.log(`[Notification] Auto-print skipped: Order restaurant ${fetchedRestId} !== active ${currentRestId}`);
                    return;
                  }
                  await printThermalReceipt(res.data);
                }
              } catch (err) {
                console.error('[Notification] Failed to fetch order for auto-print:', err);
              }
            }
          }).catch(console.error);
        }
      });
    }
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
        name: 'Default Alerts',
        importance: Notifications.AndroidImportance.MAX,
        sound: 'order_buzz',
        vibrationPattern: [0, 600, 150, 600, 150, 600, 150, 600, 150, 600, 150, 600],
        lightColor: '#FF5C39',
        enableVibrate: true,
        enableLights: true,
      });

      await Notifications.setNotificationChannelAsync('orders', {
        name: 'Order Alerts',
        importance: Notifications.AndroidImportance.MAX,
        sound: 'order_buzz',
        vibrationPattern: [0, 600, 150, 600, 150, 600, 150, 600, 150, 600, 150, 600],
        lightColor: '#FF5C39',
        enableVibrate: true,
        enableLights: true,
        bypassDnd: true,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
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

      // Register background notification task
      try {
        const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_NOTIFICATION_TASK);
        if (!isRegistered) {
          await Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK);
          console.log('[Push] Registered BACKGROUND_NOTIFICATION_TASK for closed-app printing.');
        }
      } catch (taskRegErr) {
        console.warn('[Push] Could not register background task:', taskRegErr);
      }

      const projectId =
        Constants?.expoConfig?.extra?.eas?.projectId ??
        Constants?.easConfig?.projectId ??
        '8e0c6426-9675-4b81-a428-1642374aa42b';

      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId,
      });
      token = tokenData.data;
      console.log('[Push] Device push token captured.');
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

export async function unregisterPushTokenFromBackend(): Promise<boolean> {
  try {
    const token = await AsyncStorage.getItem('registered_push_token');
    if (!token) return true;
    const res = await apiRequest('/api/notifications/unregister-mobile', {
      method: 'POST',
      body: { token },
    });
    if (res.success) {
      console.log('[Push] Unregistered push token with backend successfully.');
      await AsyncStorage.removeItem('registered_push_token');
      return true;
    }
    return false;
  } catch (error) {
    console.error('[Push] Network error unregistering push token with backend:', error);
    return false;
  }
}

export async function setupPushNotifications(): Promise<void> {
  try {
    const token = await registerForPushNotificationsAsync();
    if (token) {
      console.log('[Push] Registering token with backend.');
      await registerPushTokenWithBackend(token);
    }
  } catch (err) {
    console.error('[Push] setupPushNotifications failed:', err);
  }
}

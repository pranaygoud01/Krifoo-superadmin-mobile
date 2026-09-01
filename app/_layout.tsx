import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '../context/AuthContext';
import { ToastProvider } from '../context/ToastContext';
import { Colors } from '../constants/colors';
import {
  useFonts,
  InterTight_400Regular,
  InterTight_500Medium,
  InterTight_600SemiBold,
  InterTight_700Bold,
  InterTight_800ExtraBold,
  InterTight_900Black,
} from '@expo-google-fonts/inter-tight';
import * as SplashScreen from 'expo-splash-screen';
import { Text, StyleSheet } from 'react-native';

import { FontSizeProvider, globalFontScale } from '../context/FontSizeContext';
import { SocketProvider } from '../context/SocketContext';
import { initAppOrientation } from '../services/orientation.service';

// Initialize screen orientation preference
initAppOrientation().catch(() => {});
SplashScreen.preventAutoHideAsync().catch(() => {});

// Global font family mapper
const getFontFamily = (style: any) => {
  if (!style) return 'InterTight_400Regular';
  const flattened = StyleSheet.flatten(style);
  const weight = flattened?.fontWeight;
  if (weight === 'bold' || weight === '700') return 'InterTight_700Bold';
  if (weight === '800' || weight === '900') return 'InterTight_800ExtraBold';
  if (weight === '600') return 'InterTight_600SemiBold';
  if (weight === '500') return 'InterTight_500Medium';
  return 'InterTight_400Regular';
};

// Global override on React Native's Text.render to apply Inter-Tight font and dynamic font scaling
const oldRender = (Text as any).render;
(Text as any).render = function (...args: any[]) {
  const origin = oldRender.call(this, ...args);
  if (origin && origin.props) {
    const flattened = StyleSheet.flatten(origin.props.style) || {};
    const fontFamily = getFontFamily(origin.props.style);

    const extraStyle: any = { fontFamily };

    if (globalFontScale !== 1.0 && origin.props.allowFontScaling !== false) {
      if (flattened.fontSize !== undefined && typeof flattened.fontSize === 'number') {
        extraStyle.fontSize = Math.round(flattened.fontSize * globalFontScale);
      }
      if (flattened.lineHeight !== undefined && typeof flattened.lineHeight === 'number') {
        extraStyle.lineHeight = Math.round(flattened.lineHeight * globalFontScale);
      }
    }

    return React.cloneElement(origin, {
      style: [origin.props.style, extraStyle],
    });
  }
  return origin;
};

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    InterTight_400Regular,
    InterTight_500Medium,
    InterTight_600SemiBold,
    InterTight_700Bold,
    InterTight_800ExtraBold,
    InterTight_900Black,
  });

  React.useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <FontSizeProvider>
      <AuthProvider>
        <ToastProvider>
          <SocketProvider>
            <StatusBar style="dark" backgroundColor={Colors.background} />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: Colors.background },
                animation: 'fade',
              }}
            >
              <Stack.Screen name="index" />
              <Stack.Screen name="login" />
              <Stack.Screen name="register" options={{ animation: 'slide_from_right' }} />
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="settings" options={{ animation: 'slide_from_right' }} />
              <Stack.Screen name="privacy-policy" options={{ animation: 'slide_from_right' }} />
              <Stack.Screen name="terms-conditions" options={{ animation: 'slide_from_right' }} />
              <Stack.Screen name="order-details" options={{ animation: 'slide_from_right' }} />
              <Stack.Screen name="restaurant-details" options={{ animation: 'slide_from_right' }} />
              <Stack.Screen name="notifications" options={{ animation: 'slide_from_right' }} />
              <Stack.Screen name="tables" options={{ animation: 'slide_from_right' }} />
              <Stack.Screen name="bookings" options={{ animation: 'slide_from_right' }} />
              <Stack.Screen name="marketing" options={{ animation: 'slide_from_right' }} />
              <Stack.Screen name="fleet" options={{ animation: 'slide_from_right' }} />
              <Stack.Screen name="restaurant-settings" options={{ animation: 'slide_from_right' }} />
              <Stack.Screen name="store-profile" options={{ animation: 'slide_from_right' }} />
              <Stack.Screen name="operation-settings" options={{ animation: 'slide_from_right' }} />
              <Stack.Screen name="delivery-settings" options={{ animation: 'slide_from_right' }} />
              <Stack.Screen name="operational-timings" options={{ animation: 'slide_from_right' }} />
              <Stack.Screen name="sound-settings" options={{ animation: 'slide_from_right' }} />
              <Stack.Screen name="payout-settings" options={{ animation: 'slide_from_right' }} />
              <Stack.Screen name="printer-settings" options={{ animation: 'slide_from_right' }} />
              <Stack.Screen name="add-edit-menu" options={{ animation: 'slide_from_right' }} />
            </Stack>
          </SocketProvider>
        </ToastProvider>
      </AuthProvider>
    </FontSizeProvider>
  );
}

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

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync().catch(() => {});

// Global override to apply Inter-Tight font and automatically map weight styles
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

const oldRender = (Text as any).render;
(Text as any).render = function (...args: any[]) {
  const origin = oldRender.call(this, ...args);
  if (origin && origin.props) {
    const fontFamily = getFontFamily(origin.props.style);
    return React.cloneElement(origin, {
      style: [{ fontFamily }, origin.props.style],
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
    <AuthProvider>
      <ToastProvider>
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
          <Stack.Screen name="order-details" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="restaurant-details" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="notifications" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="tables" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="bookings" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="marketing" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="fleet" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="restaurant-settings" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="add-edit-menu" options={{ animation: 'slide_from_right' }} />
        </Stack>
      </ToastProvider>
    </AuthProvider>
  );
}

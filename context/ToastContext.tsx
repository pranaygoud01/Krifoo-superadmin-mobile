import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  Dimensions,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSegments } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from 'lucide-react-native';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastAction {
  label: string;
  onPress: () => void;
}

export interface ToastOptions {
  message: string;
  type?: ToastType;
  title?: string;
  duration?: number;
  action?: ToastAction;
  bottomOffset?: number;
}

interface ToastContextType {
  showToast: (options: ToastOptions) => void;
  hideToast: () => void;
}

const ToastContext = createContext<ToastContextType>({
  showToast: () => {},
  hideToast: () => {},
});

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [visible, setVisible] = useState(false);
  const [toastData, setToastData] = useState<ToastOptions>({ message: '', type: 'info' });
  const timeoutRef = useRef<any>(null);
  const insets = useSafeAreaInsets();
  const segments = useSegments();

  // Animations
  const slideAnim = useRef(new Animated.Value(140)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.96)).current;

  // Detect whether we are on a bottom-tab screen
  const isTabBarRoute = Array.isArray(segments) && segments[0] === '(tabs)';

  const hideToast = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 140,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 0.95,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setVisible(false);
    });
  }, [slideAnim, opacityAnim, scaleAnim]);

  const showToast = useCallback(
    ({
      message,
      type = 'info',
      title = '',
      duration = 3500,
      action,
      bottomOffset,
    }: ToastOptions) => {
      // Clear previous timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      setToastData({ message, type, title, duration, action, bottomOffset });
      setVisible(true);

      // Trigger subtle tactile haptic feedback
      try {
        if (Platform.OS !== 'web') {
          if (type === 'success') {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          } else if (type === 'error') {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
          } else if (type === 'warning') {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
          } else {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          }
        }
      } catch {
        // Ignore haptics on unsupported environments
      }

      // Calculate anchored bottom clearance:
      // On tab bar routes, offset above tab bar (+64px).
      // On stack / full screens (like printer settings), dock safely just above home gesture bar.
      const resolvedBottomOffset =
        bottomOffset !== undefined
          ? bottomOffset
          : isTabBarRoute
          ? (insets.bottom > 0 ? insets.bottom : 8) + 64
          : Math.max(insets.bottom, 12) + 12;

      // Animate smoothly into view with spring physics
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: -resolvedBottomOffset,
          damping: 20,
          mass: 0.85,
          stiffness: 140,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          damping: 18,
          stiffness: 150,
          useNativeDriver: true,
        }),
      ]).start();

      // Auto dismiss after specified duration
      if (duration > 0) {
        timeoutRef.current = setTimeout(() => {
          hideToast();
        }, duration);
      }
    },
    [isTabBarRoute, insets.bottom, slideAnim, opacityAnim, scaleAnim, hideToast]
  );

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const type = toastData.type || 'info';

  const getTheme = () => {
    switch (type) {
      case 'success':
        return {
          accentColor: '#10B981',
          iconColor: '#059669',
          iconBg: '#ECFDF5',
          iconBorder: '#A7F3D0',
          titleColor: '#0F172A',
          borderColor: '#E2E8F0',
          icon: <CheckCircle2 size={19} color="#059669" strokeWidth={2.4} />,
        };
      case 'error':
        return {
          accentColor: '#EF4444',
          iconColor: '#DC2626',
          iconBg: '#FEF2F2',
          iconBorder: '#FECACA',
          titleColor: '#0F172A',
          borderColor: '#E2E8F0',
          icon: <XCircle size={19} color="#DC2626" strokeWidth={2.4} />,
        };
      case 'warning':
        return {
          accentColor: '#F59E0B',
          iconColor: '#D97706',
          iconBg: '#FFFBEB',
          iconBorder: '#FDE68A',
          titleColor: '#0F172A',
          borderColor: '#E2E8F0',
          icon: <AlertTriangle size={19} color="#D97706" strokeWidth={2.4} />,
        };
      default:
        return {
          accentColor: '#3B82F6',
          iconColor: '#2563EB',
          iconBg: '#EFF6FF',
          iconBorder: '#BFDBFE',
          titleColor: '#0F172A',
          borderColor: '#E2E8F0',
          icon: <Info size={19} color="#2563EB" strokeWidth={2.4} />,
        };
    }
  };

  const theme = getTheme();

  return (
    <ToastContext.Provider value={{ showToast, hideToast }}>
      {children}
      {visible && (
        <Animated.View
          style={[
            styles.toastWrapper,
            {
              transform: [{ translateY: slideAnim }, { scale: scaleAnim }],
              opacity: opacityAnim,
            },
          ]}
          pointerEvents="box-none"
        >
          <View style={[styles.toastCard, { borderColor: theme.borderColor }]}>
            {/* Left Status Accent Line */}
            <View style={[styles.leftAccentBar, { backgroundColor: theme.accentColor }]} />

            {/* Icon Tile */}
            <View
              style={[
                styles.iconTile,
                {
                  backgroundColor: theme.iconBg,
                  borderColor: theme.iconBorder,
                },
              ]}
            >
              {theme.icon}
            </View>

            {/* Content Body */}
            <View style={styles.contentColumn}>
              {toastData.title ? (
                <View style={styles.titleRow}>
                  <Text style={[styles.titleText, { color: theme.titleColor }]} numberOfLines={1}>
                    {toastData.title}
                  </Text>
                  <View style={[styles.statusDot, { backgroundColor: theme.accentColor }]} />
                </View>
              ) : null}
              <Text
                style={[
                  styles.messageText,
                  !toastData.title && styles.singleMessageText,
                ]}
                numberOfLines={3}
              >
                {toastData.message}
              </Text>
            </View>

            {/* Optional Action Button */}
            {toastData.action && (
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => {
                  toastData.action?.onPress();
                  hideToast();
                }}
                activeOpacity={0.7}
              >
                <Text style={[styles.actionBtnText, { color: theme.accentColor }]}>
                  {toastData.action.label}
                </Text>
              </TouchableOpacity>
            )}

            {/* Dismiss Close Icon */}
            <TouchableOpacity
              onPress={hideToast}
              style={styles.closeBtn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              activeOpacity={0.7}
              accessibilityLabel="Dismiss notification"
            >
              <X size={14} color="#64748B" strokeWidth={2.4} />
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
};

export const useToast = () => useContext(ToastContext);

const styles = StyleSheet.create({
  toastWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 99999,
    paddingHorizontal: 16,
  },
  toastCard: {
    width: '100%',
    maxWidth: 480,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1.5,
    paddingVertical: 12,
    paddingLeft: 14,
    paddingRight: 10,
    overflow: 'hidden',
    // High-end subtle drop shadow
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 8,
  },
  leftAccentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
  },
  iconTile: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 2,
    marginRight: 10,
  },
  contentColumn: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  titleText: {
    fontSize: 13.5,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginLeft: 6,
  },
  messageText: {
    fontSize: 12.5,
    fontWeight: '500',
    color: '#475569',
    lineHeight: 17,
  },
  singleMessageText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
    lineHeight: 18,
  },
  actionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    marginLeft: 8,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
});


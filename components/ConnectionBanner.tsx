import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  DeviceEventEmitter,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WifiOff, ServerOff, CheckCircle, X } from 'lucide-react-native';
import { ApiErrorType } from '../services/api';

interface ConnectionStatusEvent {
  isOnline: boolean;
  errorType?: ApiErrorType;
  message?: string;
  baseUrl?: string;
  statusCode?: number;
  url?: string;
}

export const ConnectionBanner: React.FC = () => {
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<ConnectionStatusEvent | null>(null);

  const slideAnim = useRef(new Animated.Value(-80)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const hideTimerRef = useRef<any>(null);

  const showPill = () => {
    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 80,
        friction: 10,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const hidePill = () => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: -80,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setStatus(null);
    });
  };

  const scheduleAutoDismiss = () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    // Dismiss after exactly 3 seconds (3s only)
    hideTimerRef.current = setTimeout(() => {
      hidePill();
    }, 3000);
  };

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(
      'api_connection_status',
      (event: ConnectionStatusEvent) => {
        if (!event.isOnline) {
          if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
          setStatus(event);
          showPill();
          scheduleAutoDismiss();
        } else if (event.isOnline && status && !status.isOnline) {
          // Connection restored
          if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
          setStatus({ isOnline: true, baseUrl: event.baseUrl });
          showPill();
          scheduleAutoDismiss();
        }
      }
    );

    return () => {
      sub.remove();
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [status]);

  if (!status) {
    return null;
  }

  const isSuccess = status.isOnline;
  const isServer = status.errorType === 'server';

  // Compact pill colors
  const pillBg = isSuccess ? '#ECFDF5' : isServer ? '#FEF2F2' : '#FFFBEB';
  const pillBorder = isSuccess ? '#A7F3D0' : isServer ? '#FECACA' : '#FDE68A';
  const iconColor = isSuccess ? '#059669' : isServer ? '#DC2626' : '#D97706';
  const titleColor = isSuccess ? '#065F46' : isServer ? '#991B1B' : '#92400E';
  const subColor = isSuccess ? '#047857' : isServer ? '#B91C1C' : '#B45309';

  const pillTitle = isSuccess
    ? 'Connected'
    : isServer
    ? `Server Error ${status.statusCode ? `(${status.statusCode})` : ''}`
    : 'Server Unreachable';

  const pillDesc = isSuccess
    ? 'Backend active'
    : isServer
    ? 'Internal server issue'
    : 'Check connection';

  const topOffset = insets.top > 0 ? insets.top + 10 : 16;

  return (
    <Animated.View
      style={[
        styles.pillContainer,
        {
          top: topOffset,
          backgroundColor: pillBg,
          borderColor: pillBorder,
          transform: [{ translateY: slideAnim }],
          opacity: opacityAnim,
        },
      ]}
    >
      <TouchableOpacity
        style={styles.pillContent}
        onPress={hidePill}
        activeOpacity={0.85}
      >
        {/* Status Icon */}
        <View style={styles.iconWrap}>
          {isSuccess ? (
            <CheckCircle size={15} color={iconColor} />
          ) : isServer ? (
            <ServerOff size={15} color={iconColor} />
          ) : (
            <WifiOff size={15} color={iconColor} />
          )}
        </View>

        {/* Texts */}
        <View style={styles.textWrap}>
          <Text style={[styles.titleText, { color: titleColor }]}>
            {pillTitle}
            <Text style={[styles.descText, { color: subColor }]}> · {pillDesc}</Text>
          </Text>
        </View>

        {/* Close Button */}
        <TouchableOpacity onPress={hidePill} style={styles.closeBtn} hitSlop={8}>
          <X size={13} color={subColor} />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  pillContainer: {
    position: 'absolute',
    alignSelf: 'center',
    zIndex: 99999,
    borderRadius: 25, // Small Capsule Pill
    borderWidth: 1,
    paddingVertical: 7,
    paddingHorizontal: 14,
    maxWidth: '92%',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 6,
  },
  pillContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrap: {
    marginRight: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: {
    marginRight: 6,
  },
  titleText: {
    fontSize: 12.5,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  descText: {
    fontSize: 11.5,
    fontWeight: '500',
  },
  closeBtn: {
    padding: 3,
    marginLeft: 2,
  },
});

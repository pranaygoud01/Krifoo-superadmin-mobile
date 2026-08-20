import React, { createContext, useContext, useState, useRef, useEffect } from 'react';
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
import { Colors } from '../constants/colors';
import { CheckCircle, XCircle, Info, AlertTriangle, X } from 'lucide-react-native';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastOptions {
  message: string;
  type?: ToastType;
  title?: string;
  duration?: number;
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
  const [message, setMessage] = useState('');
  const [type, setType] = useState<ToastType>('info');
  const [title, setTitle] = useState('');
  const timeoutRef = useRef<any>(null);
  const insets = useSafeAreaInsets();

  const slideAnim = useRef(new Animated.Value(150)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  const showToast = ({ message, type = 'info', title: customTitle, duration = 3000 }: ToastOptions) => {
    // Clear any active timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    setMessage(message);
    setType(type);
    setTitle(customTitle || '');
    setVisible(true);

    const safeBottom = insets.bottom > 0 ? insets.bottom + 72 : 80;

    // Animation: Slide Up & Fade In
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: -safeBottom,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();

    // Auto dismiss
    timeoutRef.current = setTimeout(() => {
      hideToast();
    }, duration);
  };

  const hideToast = () => {
    // Animation: Slide Down & Fade Out
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 150,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setVisible(false);
    });
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const getIcon = () => {
    switch (type) {
      case 'success':
        return <CheckCircle size={16} color="#16A34A" />;
      case 'error':
        return <XCircle size={16} color="#DC2626" />;
      case 'warning':
        return <AlertTriangle size={16} color="#D97706" />;
      default:
        return <Info size={16} color="#2563EB" />;
    }
  };

  const getStatusColor = () => {
    switch (type) {
      case 'success':
        return '#16A34A';
      case 'error':
        return '#DC2626';
      case 'warning':
        return '#D97706';
      default:
        return '#2563EB';
    }
  };

  return (
    <ToastContext.Provider value={{ showToast, hideToast }}>
      {children}
      {visible && (
        <Animated.View
          style={[
            styles.toastContainer,
            {
              transform: [{ translateY: slideAnim }],
              opacity: opacityAnim,
            },
          ]}
        >
          <View style={styles.toastContent}>
            <View style={styles.iconContainer}>{getIcon()}</View>
            <View style={styles.textContainer}>
              <Text style={styles.messageText}>
                {title ? (
                  <Text style={[styles.titleText, { color: getStatusColor() }]}>
                    {title}:{' '}
                  </Text>
                ) : null}
                {message}
              </Text>
            </View>
            <TouchableOpacity onPress={hideToast} style={styles.closeButton} hitSlop={10}>
              <X size={14} color="#94A3B8" />
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
};

export const useToast = () => useContext(ToastContext);

const styles = StyleSheet.create({
  toastContainer: {
    position: 'absolute',
    bottom: 0, // Bottom-aligned
    alignSelf: 'center',
    width: '92%',
    maxWidth: 480,
    zIndex: 9999,
    borderRadius: 30, // Minimal Capsule Pill
    borderWidth: 1,
    borderColor: '#EEEEEE', // Minimal clean border
    backgroundColor: '#FFFFFF', // Solid white background
    paddingVertical: 10,
    paddingHorizontal: 16,
    // Soft elegant drop shadow
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 5,
  },
  toastContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconContainer: {
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    flex: 1,
    marginRight: 8,
  },
  titleText: {
    fontSize: 13,
    fontWeight: '800',
  },
  messageText: {
    color: '#334155', // Slate 700 text color for excellent readability
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  closeButton: {
    marginLeft: 6,
    padding: 2,
  },
});

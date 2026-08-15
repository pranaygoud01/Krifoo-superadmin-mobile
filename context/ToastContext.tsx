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

  const slideAnim = useRef(new Animated.Value(-200)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  const showToast = ({ message, type = 'info', title: customTitle, duration = 3000 }: ToastOptions) => {
    // Clear any active timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    setMessage(message);
    setType(type);
    setTitle(customTitle || type.toUpperCase());
    setVisible(true);

    const safeTop = insets.top > 0 ? insets.top + 8 : (Platform.OS === 'ios' ? 48 : 16);

    // Animation: Slide Down & Fade In
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: safeTop,
        duration: 350,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start();

    // Auto dismiss
    timeoutRef.current = setTimeout(() => {
      hideToast();
    }, duration);
  };

  const hideToast = () => {
    // Animation: Slide Up & Fade Out
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: -200,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 200,
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
        return <CheckCircle size={20} color={Colors.success} />;
      case 'error':
        return <XCircle size={20} color={Colors.danger} />;
      case 'warning':
        return <AlertTriangle size={20} color={Colors.warning} />;
      default:
        return <Info size={20} color={Colors.info} />;
    }
  };

  const getBorderColor = () => {
    switch (type) {
      case 'success':
        return Colors.success;
      case 'error':
        return Colors.danger;
      case 'warning':
        return Colors.warning;
      default:
        return Colors.info;
    }
  };

  const getBgColor = () => {
    switch (type) {
      case 'success':
        return '#F0FDF4';
      case 'error':
        return '#FEF2F2';
      case 'warning':
        return '#FFFBEB';
      default:
        return '#EFF6FF';
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
              backgroundColor: getBgColor(),
              borderColor: getBorderColor(),
            },
          ]}
        >
          <View style={styles.toastContent}>
            <View style={styles.iconContainer}>{getIcon()}</View>
            <View style={styles.textContainer}>
              <Text style={[styles.titleText, { color: getBorderColor() }]}>{title}</Text>
              <Text style={styles.messageText}>{message}</Text>
            </View>
            <TouchableOpacity onPress={hideToast} style={styles.closeButton}>
              <X size={16} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
};

export const useToast = () => useContext(ToastContext);

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  toastContainer: {
    position: 'absolute',
    top: 0,
    left: 16,
    right: 16,
    zIndex: 9999,
    borderRadius: 12,
    borderWidth: 1.5,
    paddingVertical: 12,
    paddingHorizontal: 16,
    shadowColor: '#11181C',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
  },
  toastContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    flex: 1,
  },
  titleText: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  messageText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 18,
  },
  closeButton: {
    marginLeft: 8,
    padding: 4,
  },
});

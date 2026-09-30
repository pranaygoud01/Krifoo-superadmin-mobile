import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Colors } from '../constants/colors';
import { ApiErrorType } from '../services/api';
import {
  WifiOff,
  ServerOff,
  AlertTriangle,
  RefreshCw,
  Lock,
} from 'lucide-react-native';

export interface ErrorStateProps {
  errorType?: ApiErrorType | 'unknown';
  title?: string;
  message?: string;
  statusCode?: number;
  url?: string;
  onRetry?: () => void | Promise<void>;
  isRetrying?: boolean;
  compact?: boolean;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  errorType = 'unknown',
  title,
  message,
  statusCode,
  url,
  onRetry,
  isRetrying = false,
  compact = false,
}) => {
  const [localRetrying, setLocalRetrying] = useState(false);

  const isNetwork = errorType === 'network';
  const isServer = errorType === 'server';
  const isAuth = errorType === 'auth';

  // Dynamic titles and subtitles based on error classification
  const displayTitle =
    title ||
    (isNetwork
      ? 'Cannot Reach Backend Server'
      : isServer
      ? `Server Error (${statusCode || 500})`
      : isAuth
      ? 'Session Expired'
      : 'Failed to Load Data');

  const displayMessage =
    message ||
    (isNetwork
      ? 'Could not connect to the API server. Please check your internet connection or verify the backend server is running.'
      : isServer
      ? 'The backend server encountered an error while processing this request. Please try again in a moment.'
      : isAuth
      ? 'Your admin session has expired. Please sign out and sign in again.'
      : 'An unexpected issue occurred while fetching data. Please try again.');

  const handleRetryPress = async () => {
    if (!onRetry) return;
    setLocalRetrying(true);
    try {
      await onRetry();
    } finally {
      setLocalRetrying(false);
    }
  };

  const retrying = isRetrying || localRetrying;

  const renderIcon = () => {
    if (isNetwork) return <WifiOff size={compact ? 24 : 34} color="#D97706" />;
    if (isServer) return <ServerOff size={compact ? 24 : 34} color="#DC2626" />;
    if (isAuth) return <Lock size={compact ? 24 : 34} color="#7C3AED" />;
    return <AlertTriangle size={compact ? 24 : 34} color="#EA580C" />;
  };

  const iconBg = isNetwork
    ? '#FEF3C7'
    : isServer
    ? '#FEE2E2'
    : isAuth
    ? '#EDE9FE'
    : '#FFEDD5';

  return (
    <View style={[styles.container, compact && styles.compactContainer]}>
      {/* Icon Badge */}
      <View style={[styles.iconCircle, { backgroundColor: iconBg }, compact && styles.compactIconCircle]}>
        {renderIcon()}
      </View>

      {/* Title & Description */}
      <Text style={[styles.title, compact && styles.compactTitle]}>{displayTitle}</Text>
      <Text style={[styles.message, compact && styles.compactMessage]}>{displayMessage}</Text>

      {/* Diagnostics Meta Badge */}
      {(statusCode || url) ? (
        <View style={styles.diagBadge}>
          {statusCode ? (
            <Text style={styles.diagStatus}>Status: {statusCode}</Text>
          ) : null}
          {url ? (
            <Text style={styles.diagUrl} numberOfLines={1}>
              {url}
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* Action Buttons */}
      {onRetry ? (
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.retryBtn, retrying && { opacity: 0.7 }]}
            onPress={handleRetryPress}
            disabled={retrying}
            activeOpacity={0.8}
          >
            {retrying ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <RefreshCw size={15} color="#FFFFFF" />
                <Text style={styles.retryBtnText}>Try Again</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingVertical: 40,
  },
  compactContainer: {
    flex: 0,
    paddingVertical: 20,
    paddingHorizontal: 16,
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    margin: 12,
  },
  iconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  compactIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginBottom: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.4,
  },
  compactTitle: {
    fontSize: 15,
    marginBottom: 4,
  },
  message: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 19,
    maxWidth: 380,
    marginBottom: 16,
  },
  compactMessage: {
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 12,
  },
  diagBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 18,
    maxWidth: 340,
  },
  diagStatus: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DC2626',
  },
  diagUrl: {
    fontSize: 11,
    color: '#64748B',
    flex: 1,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0F172A',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Image } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { ArrowLeft, Bell, Settings, User } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import { orderService } from '../services/order.service';
import { restaurantService } from '../services/restaurant.service';
import { useAuth } from '../context/AuthContext';
import { useFontSize } from '../context/FontSizeContext';

interface HeaderProps {
  title: string;
  subtitle?: string;
  rightElement?: React.ReactNode;
  showBackButton?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  subtitle,
  rightElement,
  showBackButton,
}) => {
  const router = useRouter();
  const segments = useSegments();
  const { user } = useAuth();
  const isSuperAdmin = user?.userType === 'super_admin';
  const [unreadCount, setUnreadCount] = React.useState<number>(0);

  const getRestaurantName = () => {
    if (user?.restaurantName) return user.restaurantName;
    if (typeof user?.restaurantId === 'object' && user?.restaurantId?.restaurantName) {
      return user.restaurantId.restaurantName;
    }
    return undefined;
  };

  const getOwnerName = () => {
    if (user?.ownerFullName) return user.ownerFullName;
    if (user?.fullName) return user.fullName;
    return undefined;
  };

  // Fetch pending applications and active orders to compute live badge count
  React.useEffect(() => {
    let isMounted = true;
    const fetchBadgeCount = async () => {
      try {
        const [orderRes, restRes] = await Promise.all([
          orderService.getAllOrders().catch(() => ({ success: false, data: [] })),
          restaurantService.getRestaurants().catch(() => ({ success: false, data: [] })),
        ]);

        let count = 0;
        if (restRes.success && restRes.data) {
          count += restRes.data.filter((r) => r.verificationStatus === 'pending').length;
        }
        if (orderRes.success && orderRes.data) {
          count += orderRes.data.filter((o) => o.status === 'placed' || o.status === 'preparing').length;
        }

        if (isMounted) {
          setUnreadCount(count);
        }
      } catch (e) {
        // Silently handle count errors
      }
    };

    fetchBadgeCount();
    return () => {
      isMounted = false;
    };
  }, []);

  // Determine if we are currently on a top-level tab screen in (tabs) layout
  const isTabScreen = segments[0] === '(tabs)';

  // On tab screens, we never want to show a back button (it would disrupt tab switching)
  // Otherwise, fallback to the navigation stack state
  const canGoBack = showBackButton !== undefined
    ? showBackButton
    : (isTabScreen ? false : router.canGoBack());

  // Show default action buttons (bell & settings) on all tab screens
  const showDefaultActions = isTabScreen;

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    }
  };

  const handleNotificationPress = () => {
    router.push('/notifications');
  };

  const handleSettingsPress = () => {
    if (isSuperAdmin) {
      router.push('/settings');
    } else {
      router.push('/restaurant-settings');
    }
  };

  const { scaleLabel, increaseFontSize, decreaseFontSize, scaleIndex } = useFontSize();

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <View style={styles.header}>
        <View style={styles.leftContainer}>
          {canGoBack && (
            <TouchableOpacity
              style={styles.backButton}
              onPress={handleBack}
              activeOpacity={0.7}
            >
              <ArrowLeft size={20} color={Colors.text} />
            </TouchableOpacity>
          )}
          <View style={styles.titleContainer}>
            {title === 'Krifoo Admin' ? (
              <View style={styles.profileSection}>
                <Image
                  source={require('../assets/logo.png')}
                  style={styles.headerLogo}
                  resizeMode="contain"
                />
                <View style={styles.greetingTextContainer}>
                  <Text style={styles.greetingText}>
                    {isSuperAdmin
                      ? `Hello, ${user?.fullName?.split(' ')[0] || 'Admin'} 👋`
                      : (getRestaurantName() || 'Restaurant Partner')}
                  </Text>
                  <Text style={styles.greetingRole}>
                    {isSuperAdmin
                      ? 'Admin'
                      : (getOwnerName() || 'Restaurant Partner')}
                  </Text>
                </View>
              </View>
            ) : (
              <Text style={styles.title} numberOfLines={1}>
                {title}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.rightContainer}>
          {/* Global Font Size Controller (A- / A+) */}
          <View style={styles.fontScaleContainer}>
            <TouchableOpacity
              style={[styles.fontBtn, scaleIndex === 0 && styles.fontBtnDisabled]}
              onPress={decreaseFontSize}
              disabled={scaleIndex === 0}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            >
              <Text style={[styles.fontBtnText, scaleIndex === 0 && styles.fontBtnTextDisabled]}>A-</Text>
            </TouchableOpacity>

            <View style={styles.fontScaleBadge}>
              <Text style={styles.fontScaleBadgeText}>{scaleLabel}</Text>
            </View>

            <TouchableOpacity
              style={[styles.fontBtn, scaleIndex === 3 && styles.fontBtnDisabled]}
              onPress={increaseFontSize}
              disabled={scaleIndex === 3}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            >
              <Text style={[styles.fontBtnText, scaleIndex === 3 && styles.fontBtnTextDisabled]}>A+</Text>
            </TouchableOpacity>
          </View>

          {rightElement ? (
            rightElement
          ) : (
            showDefaultActions && (
              <View style={styles.defaultActions}>
                <TouchableOpacity
                  style={styles.actionIconButton}
                  onPress={handleNotificationPress}
                  activeOpacity={0.7}
                >
                  <View>
                    <Bell size={20} color={Colors.text} strokeWidth={1.8} />
                    {unreadCount > 0 && (
                      <View style={styles.badgeContainer}>
                        <Text style={styles.badgeText}>
                          {unreadCount > 99 ? '99+' : unreadCount}
                        </Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actionIconButton}
                  onPress={handleSettingsPress}
                  activeOpacity={0.7}
                >
                  <Settings size={20} color={Colors.text} strokeWidth={1.8} />
                </TouchableOpacity>
              </View>
            )
          )}
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: Colors.background,
    // softer light outline
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
  leftContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.cardSurface,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  titleContainer: {
    flex: 1,
  },
  title: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  profileSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerLogo: {
    width: 36,
    height: 36,
  },
  greetingTextContainer: {
    justifyContent: 'center',
  },
  greetingText: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  greetingRole: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  rightContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  fontScaleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardSurface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    paddingHorizontal: 4,
    paddingVertical: 3,
    height: 38,
    gap: 2,
  },
  fontBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  fontBtnDisabled: {
    opacity: 0.35,
    backgroundColor: 'transparent',
  },
  fontBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.primary,
  },
  fontBtnTextDisabled: {
    color: Colors.textMuted,
  },
  fontScaleBadge: {
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 34,
  },
  fontScaleBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.textMuted,
  },
  defaultActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionIconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.cardSurface,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeContainer: {
    position: 'absolute',
    top: -3,
    right: -3,
    backgroundColor: '#EF4444',
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.cardSurface,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
});

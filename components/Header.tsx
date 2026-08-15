import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Image } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { ArrowLeft, Bell, Settings } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import { orderService } from '../services/order.service';
import { restaurantService } from '../services/restaurant.service';

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
  const [unreadCount, setUnreadCount] = React.useState<number>(0);

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
    router.push('/settings');
  };

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
              <View style={styles.logoTitleContainer}>
                <Image
                  source={require('../assets/logo.png')}
                  style={styles.headerLogo}
                  resizeMode="contain"
                />
                <Text style={styles.titleAdminText}>SUPERADMIN</Text>
              </View>
            ) : (
              <Text style={styles.title} numberOfLines={1}>
                {title}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.rightContainer}>
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
                    <Bell size={24} color={Colors.text} strokeWidth={1.8} />
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
                  <Settings size={24} color={Colors.text} strokeWidth={1.8} />
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
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
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
    width: 36,
    height: 36,
    borderRadius: 18,
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
  logoTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerLogo: {
    width: 28,
    height: 28,
  },
  titleAdminText: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  subtitle: {
    color: Colors.textMuted,
    fontSize: 11,
    marginTop: 1,
  },
  rightContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  defaultActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  actionIconButton: {
    padding: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeContainer: {
    position: 'absolute',
    top: -4,
    right: -6,
    backgroundColor: '#EF4444',
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.background,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
});

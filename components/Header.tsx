import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  DeviceEventEmitter,
  useWindowDimensions,
  Animated,
  Easing,
  type ImageSourcePropType,
} from 'react-native';
import { resolveImageUrl, resolveMediaImageSource } from '../services/image.helper';
import { useFocusEffect, useRouter, useSegments } from 'expo-router';
import { ArrowLeft, Bell, Settings, User, MapPin } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import { orderService } from '../services/order.service';
import { restaurantService } from '../services/restaurant.service';
import { restaurantOwnerService, STORE_STATUS_CHANGED_EVENT } from '../services/restaurant-owner.service';
import { useAuth } from '../context/AuthContext';
import { useFontSize } from '../context/FontSizeContext';
import { computeUnreadCount, NOTIFICATIONS_BADGE_EVENT } from '../services/notification-tracker.service';

/** Compact Online / Offline pill shown beside the store name on the Home header. */
const StoreStatusPill: React.FC<{ isActive: boolean; isTablet: boolean; onPress: () => void }> = ({
  isActive,
  isTablet,
  onPress,
}) => {
  // Soft "live" pulse ring around the dot while the store is online
  const pulse = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (!isActive) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1600,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [isActive, pulse]);

  const dotSize = isTablet ? 8 : 7;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
      accessibilityRole="button"
      accessibilityLabel={isActive ? 'Store is online' : 'Store is offline'}
      accessibilityHint="Opens store settings to change your store status"
      style={[
        styles.statusPill,
        isTablet && styles.statusPillTablet,
        isActive ? styles.statusPillOnline : styles.statusPillOffline,
      ]}
    >
      <View style={{ width: dotSize, height: dotSize, alignItems: 'center', justifyContent: 'center' }}>
        {isActive && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.statusPulse,
              {
                width: dotSize,
                height: dotSize,
                borderRadius: dotSize / 2,
                opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
                transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] }) }],
              },
            ]}
          />
        )}
        <View
          style={{
            width: dotSize,
            height: dotSize,
            borderRadius: dotSize / 2,
            backgroundColor: isActive ? Colors.success : Colors.textSubtle,
          }}
        />
      </View>
      <Text
        style={[
          styles.statusPillText,
          isTablet && styles.statusPillTextTablet,
          { color: isActive ? Colors.statusApproved.text : Colors.textMuted },
        ]}
        numberOfLines={1}
      >
        {isActive ? 'Online' : 'Offline'}
      </Text>
    </TouchableOpacity>
  );
};

interface HeaderProps {
  title: string;
  subtitle?: string;
  rightElement?: React.ReactNode;
  rightAction?: React.ReactNode;
  showBackButton?: boolean;
  restaurantLogo?: string;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  subtitle,
  rightElement,
  rightAction,
  showBackButton,
  restaurantLogo: propRestaurantLogo,
}) => {
  const router = useRouter();
  const segments = useSegments();
  const { user } = useAuth();
  const isSuperAdmin = user?.userType === 'super_admin';
  const [unreadCount, setUnreadCount] = React.useState<number>(0);

  const { width: windowWidth } = useWindowDimensions();
  const isTablet = windowWidth >= 768;

  // Restaurant location (city / area) shown under the store name — read from the user object,
  // otherwise fetched once from the store profile.
  const formatLocation = (addr: any): string | undefined => {
    if (!addr) return undefined;
    if (typeof addr === 'string') return addr.trim() || undefined;
    const parts = [addr.area, addr.city].filter((p: any) => typeof p === 'string' && p.trim());
    // "area" holds the postcode for UK stores — show "City · POSTCODE" when both exist.
    if (addr.city && addr.area) return `${addr.city} · ${String(addr.area).toUpperCase()}`;
    return parts[0] || addr.formattedAddress || undefined;
  };

  const locationFromUser = React.useMemo((): string | undefined => {
    if (isSuperAdmin || !user) return undefined;
    const rest = typeof user.restaurantId === 'object' ? user.restaurantId : user.restaurant;
    return formatLocation(rest?.address) || formatLocation(user.address);
  }, [isSuperAdmin, user]);

  const [storeLocation, setStoreLocation] = React.useState<string | undefined>(locationFromUser);

  // Store online / offline status (restaurant `isActive`) — restaurant owners on the Home header only.
  const showStoreStatus = !isSuperAdmin && !!user && title === 'Krifoo Admin';
  const statusFromUser = React.useMemo((): boolean | undefined => {
    if (!showStoreStatus) return undefined;
    const rest = typeof user?.restaurantId === 'object' ? user.restaurantId : user?.restaurant;
    return typeof rest?.isActive === 'boolean' ? rest.isActive : undefined;
  }, [showStoreStatus, user]);
  const [storeActive, setStoreActive] = React.useState<boolean | undefined>(statusFromUser);

  React.useEffect(() => {
    if (locationFromUser) setStoreLocation(locationFromUser);
  }, [locationFromUser]);

  // Load the store profile each time the Home screen comes into view, so the status
  // (and location, if not on the user object) is always current.
  useFocusEffect(
    React.useCallback(() => {
      if (!showStoreStatus) return;
      let isMounted = true;
      restaurantOwnerService
        .getRestaurantProfile()
        .then((res) => {
          if (!isMounted || !res.success || !res.data) return;
          if (typeof res.data.isActive === 'boolean') setStoreActive(res.data.isActive);
          if (!locationFromUser) setStoreLocation(formatLocation(res.data.address));
        })
        .catch(() => {
          // Status & location are optional — keep whatever we already show
        });
      return () => {
        isMounted = false;
      };
    }, [showStoreStatus, locationFromUser])
  );

  // Instant update when the status is switched elsewhere (e.g. Store settings)
  React.useEffect(() => {
    if (!showStoreStatus) return;
    const sub = DeviceEventEmitter.addListener(STORE_STATUS_CHANGED_EVENT, (isActive: boolean) => {
      if (typeof isActive === 'boolean') setStoreActive(isActive);
    });
    return () => sub.remove();
  }, [showStoreStatus]);

  const getRestaurantName = () => {
    if (user?.restaurantName) return user.restaurantName;
    if (typeof user?.restaurantId === 'object' && user?.restaurantId?.restaurantName) {
      return user.restaurantId.restaurantName;
    }
    return undefined;
  };

  // Fetch pending applications and active orders to compute live badge count, respecting seen/read state
  React.useEffect(() => {
    let isMounted = true;
    const fetchBadgeCount = async () => {
      try {
        const [orderRes, restRes] = await Promise.all([
          orderService.fetchAllOrders({ status: 'placed,preparing' }).catch(() => ({ success: false, data: [] })),
          restaurantService.getRestaurants({ limit: 1000 }).catch(() => ({ success: false, data: [] })),
        ]);

        const count = await computeUnreadCount(
          orderRes.success && Array.isArray(orderRes.data) ? orderRes.data : [],
          restRes.success && Array.isArray(restRes.data) ? restRes.data : []
        );

        if (isMounted) {
          setUnreadCount(count);
        }
      } catch (e) {
        // Silently handle count errors
      }
    };

    fetchBadgeCount();

    // Listen for live badge updates when notifications are seen or marked read
    const badgeSub = DeviceEventEmitter.addListener(NOTIFICATIONS_BADGE_EVENT, (customCount?: number) => {
      if (typeof customCount === 'number') {
        if (isMounted) setUnreadCount(customCount);
      } else {
        fetchBadgeCount();
      }
    });

    return () => {
      isMounted = false;
      badgeSub.remove();
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
    try {
      if (isSuperAdmin) {
        router.push('/settings');
      } else {
        router.push('/restaurant-settings');
      }
    } catch {
      router.push('/settings');
    }
  };

  const { scaleLabel, increaseFontSize, decreaseFontSize, scaleIndex } = useFontSize();

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <View style={[styles.header, isTablet && styles.headerTablet]}>
        <View style={styles.leftContainer}>
          {canGoBack && (
            <TouchableOpacity
              style={styles.backButton}
              onPress={handleBack}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <ArrowLeft size={isTablet ? 22 : 20} color={Colors.text} />
            </TouchableOpacity>
          )}
          <View style={styles.titleContainer}>
            {title === 'Krifoo Admin' ? (
              <View style={[styles.profileSection, isTablet && styles.profileSectionTablet]}>
                <View style={styles.greetingTextContainer}>
                  <View style={styles.nameRow}>
                    <Text
                      style={[styles.greetingText, styles.nameText, isTablet && styles.greetingTextTablet]}
                      numberOfLines={1}
                    >
                      {isSuperAdmin
                        ? `Hello, Krifoo Admin`
                        : (getRestaurantName() || 'Restaurant Partner')}
                    </Text>
                    {showStoreStatus && storeActive !== undefined && (
                      <StoreStatusPill
                        isActive={storeActive}
                        isTablet={isTablet}
                        onPress={() => router.push('/restaurant-settings')}
                      />
                    )}
                  </View>
                  {isSuperAdmin ? (
                    <Text style={[styles.greetingRole, isTablet && styles.greetingRoleTablet]}>Manage Stores</Text>
                  ) : storeLocation ? (
                    <View style={styles.locationRow} accessibilityLabel={`Location: ${storeLocation}`}>
                      <MapPin size={isTablet ? 14 : 12} color={Colors.textMuted} />
                      <Text style={[styles.greetingRole, isTablet && styles.greetingRoleTablet]} numberOfLines={1}>
                        {storeLocation}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            ) : (
              <Text style={[styles.title, isTablet && styles.titleTablet]} numberOfLines={1}>
                {title}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.rightContainer}>
          {/* Global Font Size Controller (A- / A+) */}
          
          {(rightElement || rightAction) ? (
            (rightElement || rightAction)
          ) : (
            showDefaultActions && (
              <View style={styles.defaultActions}>
                <TouchableOpacity
                  style={styles.actionIconButton}
                  onPress={handleNotificationPress}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <View>
                    <Bell size={20} color={Colors.text} strokeWidth={1.8} />
                    {unreadCount > 0 && (
                      <View style={styles.badgeContainer}>
                        <Text style={styles.badgeText}>
                          {unreadCount > 9 ? '9+' : unreadCount}
                        </Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
                  {/* <TouchableOpacity
                  style={styles.actionIconButton}
                  onPress={handleSettingsPress}
                  activeOpacity={0.7}
                >
                  <Settings size={20} color={Colors.text} strokeWidth={1.8} />
                </TouchableOpacity> */}
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
  headerTablet: {
    maxWidth: 1200,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 28,
    paddingTop: 16,
    paddingBottom: 16,
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
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  titleTablet: {
    fontSize: 20,
  },
  profileSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  profileSectionTablet: {
    gap: 14,
  },
  headerLogo: {
    width: 36,
    height: 36,
  },
  headerLogoTablet: {
    width: 44,
    height: 44,
  },
  headerRestaurantLogo: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.cardSurface,
  },
  greetingTextContainer: {
    justifyContent: 'center',
    flexShrink: 1,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  nameText: {
    flexShrink: 1, // long store names truncate; the status pill always stays visible
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    flexShrink: 0,
  },
  statusPillTablet: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 6,
  },
  statusPillOnline: {
    backgroundColor: Colors.statusApproved.bg,
    borderColor: '#A7F3D0',
  },
  statusPillOffline: {
    backgroundColor: Colors.cardSurface,
    borderColor: Colors.cardBorder,
  },
  statusPulse: {
    position: 'absolute',
    backgroundColor: Colors.success,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  statusPillTextTablet: {
    fontSize: 12,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  greetingText: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  greetingTextTablet: {
    fontSize: 18,
    letterSpacing: -0.4,
  },
  greetingRole: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 1,
  },
  greetingRoleTablet: {
    fontSize: 12.5,
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
    top: -10,
    right: -10,
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

import React from 'react';
import { Tabs } from 'expo-router';
import { Colors } from '../../constants/colors';
import { Home, Store, Receipt, Users, Menu as MenuIcon, Settings } from 'lucide-react-native';
import { StatusBar } from 'expo-status-bar';
import {
  Pressable,
  StyleSheet,
  View,
  Text,
  Platform,
  Animated,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../../context/AuthContext';

/**
 * Bottom navigation — Material 3 "Navigation bar" pattern
 * ───────────────────────────────────────────────────────
 *  • Icon sits inside a pill-shaped active indicator, label always visible below.
 *  • Bar is docked full-width; content area = 64–80dp, plus the device safe-area
 *    inset (home indicator / gesture bar). When the device has no inset
 *    (Android 3-button nav, Touch ID iPhones) a minimum bottom padding is applied.
 *  • Tablets / iPads: items are grouped and centred with a max width so they
 *    don't stretch edge-to-edge on wide screens.
 */

const ACTIVE_COLOR = Colors.primary;
const INACTIVE_COLOR = '#49454F';
const INDICATOR_COLOR = Colors.primaryLight;
const BAR_BG = '#FFFFFF';

interface Metrics {
  barHeight: number;
  indicatorWidth: number;
  indicatorHeight: number;
  iconSize: number;
  fontSize: number;
  labelGap: number;
}

interface TabButtonProps {
  isFocused: boolean;
  label: string;
  onPress: () => void;
  onLongPress: () => void;
  renderIcon: (color: string) => React.ReactNode;
  metrics: Metrics;
  maxItemWidth?: number;
}

const TabButton: React.FC<TabButtonProps> = ({
  isFocused,
  label,
  onPress,
  onLongPress,
  renderIcon,
  metrics,
  maxItemWidth,
}) => {
  const progress = React.useRef(new Animated.Value(isFocused ? 1 : 0)).current;

  React.useEffect(() => {
    Animated.spring(progress, {
      toValue: isFocused ? 1 : 0,
      useNativeDriver: true,
      tension: 160,
      friction: 18,
    }).start();
  }, [isFocused, progress]);

  // Indicator grows horizontally from the centre (M3 motion)
  const indicatorScaleX = progress.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });
  const indicatorOpacity = progress;

  const color = isFocused ? ACTIVE_COLOR : INACTIVE_COLOR;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: isFocused }}
      accessibilityLabel={label}
      style={[styles.tabItem, maxItemWidth ? { maxWidth: maxItemWidth } : null]}
    >
      {({ pressed }) => (
        <>
          <View
            style={[
              styles.indicatorWrap,
              {
                width: metrics.indicatorWidth,
                height: metrics.indicatorHeight,
                borderRadius: metrics.indicatorHeight / 2,
              },
            ]}
          >
            {/* Pressed state layer (shown on inactive tabs for touch feedback) */}
            {pressed && !isFocused && (
              <View
                style={[
                  StyleSheet.absoluteFillObject,
                  styles.pressedLayer,
                  { borderRadius: metrics.indicatorHeight / 2 },
                ]}
              />
            )}
            <Animated.View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFillObject,
                styles.indicator,
                {
                  borderRadius: metrics.indicatorHeight / 2,
                  opacity: indicatorOpacity,
                  transform: [{ scaleX: indicatorScaleX }],
                },
              ]}
            />
            {renderIcon(color)}
          </View>

          <Text
            style={[
              styles.tabLabel,
              {
                fontSize: metrics.fontSize,
                lineHeight: Math.round(metrics.fontSize * 1.34),
                marginTop: metrics.labelGap,
                color,
              },
              isFocused ? styles.tabLabelActive : styles.tabLabelInactive,
            ]}
            numberOfLines={1}
            ellipsizeMode="tail"
            maxFontSizeMultiplier={1.3}
          >
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
};

function AdminTabBar({ state, descriptors, navigation }: any) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  const isSuperAdmin = user?.userType === 'super_admin';

  // Device classes
  const isTablet = width >= 768;
  const isLargeTablet = width >= 1024;
  const isSmallDevice = width < 360;
  const isPhoneLandscape = !isTablet && width > height;

  // Compact sizing (scaled down from the Material 3 80dp bar / 64×32 indicator / 24dp icon)
  const metrics: Metrics = isTablet
    ? { barHeight: 66, indicatorWidth: 56, indicatorHeight: 28, iconSize: 20, fontSize: 12, labelGap: 3 }
    : isPhoneLandscape
    ? { barHeight: 54, indicatorWidth: 48, indicatorHeight: 24, iconSize: 18, fontSize: 11, labelGap: 2 }
    : isSmallDevice
    ? { barHeight: 58, indicatorWidth: 46, indicatorHeight: 26, iconSize: 18, fontSize: 10.5, labelGap: 3 }
    : { barHeight: 62, indicatorWidth: 52, indicatorHeight: 28, iconSize: 20, fontSize: 11.5, labelGap: 3 };

  // Bottom padding: honour the safe area (home indicator / gesture bar);
  // fall back to a minimum on devices without an inset.
  const minBottom = Platform.OS === 'ios' ? 8 : 6;
  const paddingBottom = Math.max(insets.bottom, minBottom);

  // On wide screens keep items grouped in the centre instead of spreading edge-to-edge
  const groupMaxWidth = isLargeTablet ? 720 : isTablet ? 600 : undefined;
  const maxItemWidth = isTablet ? 168 : undefined;

  const visibleRoutes = state.routes.filter((route: any) => {
    if (isSuperAdmin && route.name === 'menu') return false;
    if (!isSuperAdmin && (route.name === 'restaurants' || route.name === 'users')) return false;
    return true;
  });

  return (
    <View
      style={[
        styles.tabBar,
        {
          paddingBottom,
          paddingLeft: Math.max(insets.left, isSmallDevice ? 4 : 8),
          paddingRight: Math.max(insets.right, isSmallDevice ? 4 : 8),
        },
      ]}
    >
      <View
        accessibilityRole="tablist"
        style={[
          styles.tabRow,
          { height: metrics.barHeight },
          groupMaxWidth ? { maxWidth: groupMaxWidth } : null,
        ]}
      >
        {visibleRoutes.map((route: any) => {
          const isFocused = state.routes.indexOf(route) === state.index;
          const { options } = descriptors[route.key];
          const label = options.title !== undefined ? options.title : route.name;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              try {
                Haptics.selectionAsync();
              } catch (e) {
                // Haptics not supported in this environment
              }
              navigation.navigate(route.name, route.params);
            }
          };

          const onLongPress = () => {
            navigation.emit({ type: 'tabLongPress', target: route.key });
          };

          const renderIcon = (color: string) => {
            const size = metrics.iconSize;
            const stroke = isFocused ? 2.2 : 1.9;
            switch (route.name) {
              case 'index':
                return <Home size={size} color={color} strokeWidth={stroke} />;
              case 'restaurants':
                return <Store size={size} color={color} strokeWidth={stroke} />;
              case 'orders':
                return <Receipt size={size} color={color} strokeWidth={stroke} />;
              case 'users':
                return <Users size={size} color={color} strokeWidth={stroke} />;
              case 'menu':
                return <MenuIcon size={size} color={color} strokeWidth={stroke} />;
              case 'settings':
                return <Settings size={size} color={color} strokeWidth={stroke} />;
              default:
                return null;
            }
          };

          return (
            <TabButton
              key={route.key}
              isFocused={isFocused}
              label={label}
              onPress={onPress}
              onLongPress={onLongPress}
              renderIcon={renderIcon}
              metrics={metrics}
              maxItemWidth={maxItemWidth}
            />
          );
        })}
      </View>
    </View>
  );
}

export default function TabLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <Tabs
        tabBar={(props) => <AdminTabBar {...props} />}
        screenOptions={{
          headerShown: false,
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Home' }} />
        <Tabs.Screen name="restaurants" options={{ title: 'Stores' }} />
        <Tabs.Screen name="orders" options={{ title: 'Orders' }} />
        <Tabs.Screen name="users" options={{ title: 'Users' }} />
        <Tabs.Screen name="menu" options={{ title: 'Menu' }} />
        <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
      </Tabs>
    </>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: BAR_BG,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.tabBorder,
    alignItems: 'center',
    // Soft elevation upward
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 12,
  },
  tabRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabItem: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  indicatorWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  indicator: {
    backgroundColor: INDICATOR_COLOR,
  },
  pressedLayer: {
    backgroundColor: 'rgba(17, 24, 28, 0.06)',
  },
  tabLabel: {
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  tabLabelActive: {
    fontWeight: '700',
  },
  tabLabelInactive: {
    fontWeight: '500',
  },
});

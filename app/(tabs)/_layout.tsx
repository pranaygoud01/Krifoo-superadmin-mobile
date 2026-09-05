import React from 'react';
import { Tabs } from 'expo-router';
import { Colors } from '../../constants/colors';
import { Home, Store, Receipt, Users, Menu as MenuIcon, Settings } from 'lucide-react-native';
import { StatusBar } from 'expo-status-bar';
import {
  TouchableOpacity,
  StyleSheet,
  View,
  Text,
  Platform,
  LayoutAnimation,
  UIManager,
  Animated,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../../context/AuthContext';

if (Platform.OS === 'android') {
  if (UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }
}

interface TabButtonProps {
  route: any;
  isFocused: boolean;
  label: string;
  onPress: () => void;
  renderIcon: () => React.ReactNode;
  itemHeight: number;
  fontSize: number;
  iconGap: number;
  activeFlex: number;
}

const TabButton: React.FC<TabButtonProps> = ({
  route,
  isFocused,
  label,
  onPress,
  renderIcon,
  itemHeight,
  fontSize,
  iconGap,
  activeFlex,
}) => {
  const animation = React.useRef(new Animated.Value(isFocused ? 1 : 0)).current;

  React.useEffect(() => {
    Animated.spring(animation, {
      toValue: isFocused ? 1 : 0,
      useNativeDriver: true,
      tension: 120,
      friction: 14,
    }).start();
  }, [isFocused]);

  const scale = animation.interpolate({
    inputRange: [0, 1],
    outputRange: [0.85, 1],
  });

  const opacity = animation.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[
        styles.tabItem,
        { height: itemHeight, borderRadius: itemHeight / 2 },
        isFocused ? [styles.tabItemActive, { flex: activeFlex }] : styles.tabItemInactive,
      ]}
    >
      <Animated.View
        style={[
          styles.pillBackground,
          {
            borderRadius: itemHeight / 2,
            opacity,
            transform: [{ scale }],
          },
        ]}
      />
      <View style={[styles.tabContent, { gap: iconGap }]}>
        {renderIcon()}
        {isFocused && (
          <Text
            style={[styles.tabLabel, { fontSize }]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {label}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
};

function AdminTabBar({ state, descriptors, navigation }: any) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const isSuperAdmin = user?.userType === 'super_admin';

  // Responsive device classifications
  const isTablet = width >= 768;
  const isSmallDevice = width < 360;

  // Dynamic bottom margin respecting safe area insets:
  // On devices with notches/home indicators (iOS) or edge-to-edge navigation bars (Android gesture or 3-button),
  // insets.bottom > 0. We float cleanly above the system UI.
  // On devices with hardware buttons / zero inset, we provide comfortable breathing room.
  const bottomMargin = insets.bottom > 0
    ? insets.bottom + (Platform.OS === 'ios' ? 8 : 10)
    : (Platform.OS === 'ios' ? 18 : 14);

  // Responsive sizing
  const tabBarHeight = isTablet ? 60 : (isSmallDevice ? 52 : 56);
  const tabItemHeight = isTablet ? 50 : (isSmallDevice ? 44 : 48);
  const iconSize = isTablet ? 22 : (isSmallDevice ? 18 : 20);
  const fontSize = isTablet ? 13 : (isSmallDevice ? 10.5 : 12);
  const iconGap = isSmallDevice ? 5 : 7;

  // Horizontal margins:
  // On tablets, center floating dock up to max 560dp
  // On small phones, give 12dp side margin so 5 tabs fit comfortably
  // On standard phones, give 16dp side margin
  const horizontalMargin = isTablet
    ? Math.max(24, Math.round((width - 560) / 2))
    : (isSmallDevice ? 12 : 16);

  // Filter visible tabs to compute active expansion flex accurately
  const visibleRoutes = state.routes.filter((route: any) => {
    if (isSuperAdmin && route.name === 'menu') return false;
    if (!isSuperAdmin && (route.name === 'restaurants' || route.name === 'users')) return false;
    return true;
  });
  const totalTabs = visibleRoutes.length;
  const activeFlex = isSmallDevice
    ? (totalTabs >= 5 ? 1.35 : 1.5)
    : (totalTabs >= 5 ? 1.45 : 1.6);

  return (
    <View
      style={[
        styles.tabBar,
        {
          bottom: bottomMargin,
          left: horizontalMargin,
          right: horizontalMargin,
          height: tabBarHeight,
          borderRadius: tabBarHeight / 2,
        },
      ]}
    >
      {state.routes.map((route: any) => {
        // Dynamically hide tabs based on user role
        if (isSuperAdmin && route.name === 'menu') {
          return null;
        }
        if (!isSuperAdmin && (route.name === 'restaurants' || route.name === 'users')) {
          return null;
        }

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
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            } catch (e) {
              // Silently handle if haptics not supported in env
            }
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            navigation.navigate(route.name, route.params);
          }
        };

        const color = isFocused ? '#FF5C39' : '#687076';

        const renderIcon = () => {
          const stroke = isFocused ? 2.2 : 1.8;
          switch (route.name) {
            case 'index':
              return <Home size={iconSize} color={color} strokeWidth={stroke} />;
            case 'restaurants':
              return <Store size={iconSize} color={color} strokeWidth={stroke} />;
            case 'orders':
              return <Receipt size={iconSize} color={color} strokeWidth={stroke} />;
            case 'users':
              return <Users size={iconSize} color={color} strokeWidth={stroke} />;
            case 'menu':
              return <MenuIcon size={iconSize} color={color} strokeWidth={stroke} />;
            case 'settings':
              return <Settings size={iconSize} color={color} strokeWidth={stroke} />;
            default:
              return null;
          }
        };

        return (
          <TabButton
            key={route.key}
            route={route}
            isFocused={isFocused}
            label={label}
            onPress={onPress}
            renderIcon={renderIcon}
            itemHeight={tabItemHeight}
            fontSize={fontSize}
            iconGap={iconGap}
            activeFlex={activeFlex}
          />
        );
      })}
    </View>
  );
}

export default function TabLayout() {
  return (
    <>
      <StatusBar style="dark" backgroundColor={Colors.background} />
      <Tabs
        tabBar={(props) => <AdminTabBar {...props} />}
        screenOptions={{
          headerShown: false,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
          }}
        />
        <Tabs.Screen
          name="restaurants"
          options={{
            title: 'Stores',
          }}
        />
        <Tabs.Screen
          name="orders"
          options={{
            title: 'Orders',
          }}
        />
        <Tabs.Screen
          name="users"
          options={{
            title: 'Users',
          }}
        />
        <Tabs.Screen
          name="menu"
          options={{
            title: 'Menu',
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: 'Settings',
          }}
        />
      </Tabs>
    </>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: 'rgba(241, 245, 249, 0.95)',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 100,
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabItemInactive: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  tabItemActive: {
    marginHorizontal: 2,
  },
  pillBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFF0EC', // soft brand orange background matching colors.ts
  },
  tabContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  tabLabel: {
    fontWeight: '800',
    color: '#FF5C39',
  },
});

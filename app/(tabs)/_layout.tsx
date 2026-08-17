import React from 'react';
import { Tabs } from 'expo-router';
import { Colors } from '../../constants/colors';
import { Home, Store, Receipt, Users, Menu as MenuIcon } from 'lucide-react-native';
import { StatusBar } from 'expo-status-bar';
import { TouchableOpacity, StyleSheet, View, Text, Platform, LayoutAnimation, UIManager, Animated } from 'react-native';
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
}

const TabButton: React.FC<TabButtonProps> = ({
  route,
  isFocused,
  label,
  onPress,
  renderIcon,
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
        isFocused ? styles.tabItemActive : styles.tabItemInactive,
      ]}
    >
      <Animated.View
        style={[
          styles.pillBackground,
          {
            opacity,
            transform: [{ scale }],
          },
        ]}
      />
      <View style={styles.tabContent}>
        {renderIcon()}
        {isFocused && (
          <Text style={styles.tabLabel}>{label}</Text>
        )}
      </View>
    </TouchableOpacity>
  );
};

function AdminTabBar({ state, descriptors, navigation }: any) {
  const { user } = useAuth();
  const isSuperAdmin = user?.userType === 'super_admin';

  return (
    <View style={styles.tabBar}>
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
          const size = 20;
          switch (route.name) {
            case 'index':
              return <Home size={size} color={color} strokeWidth={isFocused ? 2.2 : 1.8} />;
            case 'restaurants':
              return <Store size={size} color={color} strokeWidth={isFocused ? 2.2 : 1.8} />;
            case 'orders':
              return <Receipt size={size} color={color} strokeWidth={isFocused ? 2.2 : 1.8} />;
            case 'users':
              return <Users size={size} color={color} strokeWidth={isFocused ? 2.2 : 1.8} />;
            case 'menu':
              return <MenuIcon size={size} color={color} strokeWidth={isFocused ? 2.2 : 1.8} />;
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
            title: 'Restaurants',
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
      </Tabs>
    </>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 28 : 20,
    left: 20,
    right: 20,
    height: 56,
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderRadius: 28,
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: 'rgba(241, 245, 249, 0.95)',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 8,
  },
  tabItem: {
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabItemInactive: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  tabItemActive: {
    flex: 1.6, // active tab expands to fill remaining space beautifully
    marginHorizontal: 2,
  },
  pillBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFF0EC', // soft brand orange background matching colors.ts
    borderRadius: 24,
  },
  tabContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FF5C39',
  },
});

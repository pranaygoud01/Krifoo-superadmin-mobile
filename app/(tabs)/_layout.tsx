import React from 'react';
import { Tabs } from 'expo-router';
import { Colors } from '../../constants/colors';
import { Home, Store, Receipt, Users } from 'lucide-react-native';
import { StatusBar } from 'expo-status-bar';
import { TouchableOpacity, StyleSheet, View, Text, Platform } from 'react-native';

function AdminTabBar({ state, descriptors, navigation }: any) {
  return (
    <View style={styles.tabBar}>
      {state.routes.map((route: any) => {
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
            default:
              return null;
          }
        };

        return (
          <TouchableOpacity
            key={route.key}
            onPress={onPress}
            activeOpacity={0.85}
            style={[
              styles.tabItem,
              isFocused && styles.tabItemActive
            ]}
          >
            {renderIcon()}
            <Text style={[styles.tabLabel, { color }]}>{label}</Text>
          </TouchableOpacity>
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
      </Tabs>
    </>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    height: Platform.OS === 'ios' ? 88 : 72,
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#EEEEEE',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 12,
    paddingBottom: Platform.OS === 'ios' ? 16 : 0,
  },
  tabItem: {
    flex: 1,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 6,
    gap: 3,
  },
  tabItemActive: {
    // backgroundColor: '#FF5C39', // Vibrant orange container matching reference UI exactly
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '700',
  },
});

import React from 'react';
import RestaurantSettingsScreen from '../restaurant-settings';
import SettingsScreen from '../settings';
import { useAuth } from '../../context/AuthContext';

export default function SettingsTab() {
  const { user } = useAuth();
  const isSuperAdmin = user?.userType === 'super_admin';

  if (isSuperAdmin) {
    return <SettingsScreen />;
  }

  return <RestaurantSettingsScreen />;
}

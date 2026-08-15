import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authService } from '../services/auth.service';
import { STORAGE_KEYS } from '../constants/config';
import { setupPushNotifications } from '../services/notification';

interface AuthContextType {
  user: any | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  registerOwner: (formData: FormData) => Promise<{ success: boolean; message?: string }>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  login: async () => ({ success: false }),
  logout: async () => {},
  refreshUser: async () => {},
  registerOwner: async () => ({ success: false }),
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  /** One-time migration: strip stale /api suffix from stored base URL */
  const migrateApiUrl = async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEYS.API_BASE_URL);
      if (stored && stored.endsWith('/api')) {
        const fixed = stored.slice(0, -4);
        await AsyncStorage.setItem(STORAGE_KEYS.API_BASE_URL, fixed);
        console.warn(`[AuthContext] Migrated API URL: "${stored}" → "${fixed}"`);
      }
    } catch {
      // ignore
    }
  };

  const loadUser = async () => {
    try {
      const admin = await authService.getCurrentAdmin();
      setUser(admin);
      if (admin) {
        setupPushNotifications().catch(console.error);
      }
    } catch (e) {
      console.error('Failed loading admin user:', e);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    migrateApiUrl().then(loadUser);
  }, []);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    const res = await authService.adminLogin(email, password);
    if (res.success && res.data) {
      setUser(res.data);
      setupPushNotifications().catch(console.error);
    }
    setIsLoading(false);
    return res;
  };

  const logout = async () => {
    setIsLoading(true);
    await authService.logout();
    setUser(null);
    setIsLoading(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        login,
        logout,
        refreshUser: loadUser,
        registerOwner: authService.registerOwner,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

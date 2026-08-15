import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiRequest } from './api';
import { STORAGE_KEYS } from '../constants/config';
import { SuperAdminUser } from '../types';

export const authService = {
  /**
   * Login super admin.
   * 
   * The backend (loginSuperAdmin) returns:
   *   { success: true, message: "...", data: { _id, fullName, email, userType } }
   *
   * The JWT is set as a cookie `token_admin` (httpOnly).
   * React Native fetch does NOT persist cookies automatically — we store
   * the token from the Authorization header workaround or from the response.
   *
   * Since the backend only returns cookie-based auth, we send the token
   * back in the Authorization header on subsequent requests via AsyncStorage.
   * The `validateSuperAdmin` middleware reads `req.headers.authorization`
   * as a fallback when the cookie is absent — so Bearer token works fine.
   */
  async adminLogin(email: string, password: string) {
    // 1. Try Super Admin Login
    let res = await apiRequest('/api/auth/admin/login', {
      method: 'POST',
      body: { email, password },
    });

    if (res.success && res.data) {
      const adminData = {
        ...res.data,
        userType: 'super_admin' as const,
      };

      const token: string | undefined =
        res.token || res.accessToken || res.data.token || res.data?.token;

      if (token) {
        await AsyncStorage.setItem(STORAGE_KEYS.ADMIN_TOKEN, token);
      }
      await AsyncStorage.setItem(STORAGE_KEYS.ADMIN_USER, JSON.stringify(adminData));
      return { success: true, data: adminData };
    }

    // 2. Fallback to Restaurant Owner (Admin) Login
    const ownerRes = await apiRequest('/api/auth/owner/login', {
      method: 'POST',
      body: { email, password },
    });

    if (ownerRes.owner) {
      const ownerData = {
        ...ownerRes.owner,
        id: ownerRes.owner._id,
        userType: 'owner' as const,
      };

      const token: string | undefined =
        ownerRes.token || ownerRes.accessToken || ownerRes.owner.token || ownerRes.data?.token;

      if (token) {
        await AsyncStorage.setItem(STORAGE_KEYS.ADMIN_TOKEN, token);
      }
      await AsyncStorage.setItem(STORAGE_KEYS.ADMIN_USER, JSON.stringify(ownerData));
      return { success: true, data: ownerData };
    }

    return ownerRes.message ? { ...ownerRes, success: false } : res;
  },

  async getCurrentAdmin(): Promise<any | null> {
    try {
      const userStr = await AsyncStorage.getItem(STORAGE_KEYS.ADMIN_USER);
      if (!userStr) return null;
      return JSON.parse(userStr);
    } catch {
      return null;
    }
  },

  async registerOwner(formData: FormData): Promise<{ success: boolean; message?: string }> {
    return apiRequest('/api/owner-registrations/register', {
      method: 'POST',
      body: formData,
    });
  },

  async logout() {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    await AsyncStorage.removeItem(STORAGE_KEYS.ADMIN_TOKEN);
    await AsyncStorage.removeItem(STORAGE_KEYS.ADMIN_USER);
  },
};

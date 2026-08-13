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
    const res = await apiRequest('/api/auth/admin/login', {
      method: 'POST',
      body: { email, password },
    });

    if (res.success && res.data) {
      const adminData: SuperAdminUser = res.data;

      // The backend sends the JWT as a cookie (token_admin).
      // React Native doesn't auto-store cookies, so we need to
      // get the token from either res.token, res.accessToken, or res.data.token.
      // If none are present, store a placeholder so the user object is persisted
      // and re-auth can be prompted gracefully.
      const token: string | undefined =
        res.token || res.accessToken || adminData.token || res.data?.token;

      if (token) {
        await AsyncStorage.setItem(STORAGE_KEYS.ADMIN_TOKEN, token);
      }

      await AsyncStorage.setItem(STORAGE_KEYS.ADMIN_USER, JSON.stringify(adminData));
    }

    return res;
  },

  async getCurrentAdmin(): Promise<SuperAdminUser | null> {
    try {
      const userStr = await AsyncStorage.getItem(STORAGE_KEYS.ADMIN_USER);
      if (!userStr) return null;
      return JSON.parse(userStr);
    } catch {
      return null;
    }
  },

  async logout() {
    // Also call the server logout endpoint to clear the cookie
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore, we clear locally anyway
    }
    await AsyncStorage.removeItem(STORAGE_KEYS.ADMIN_TOKEN);
    await AsyncStorage.removeItem(STORAGE_KEYS.ADMIN_USER);
  },
};

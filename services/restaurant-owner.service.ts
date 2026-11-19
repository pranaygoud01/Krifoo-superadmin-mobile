import { apiRequest } from './api';
import { Platform } from 'react-native';

export interface RestaurantUpdate {
  _id: string;
  title: string;
  body: string;
  category: 'info' | 'important' | 'maintenance';
  createdAt: string;
  isRead: boolean;
}

/**
 * DeviceEventEmitter event fired after the store is switched online/offline.
 * Payload: `isActive: boolean`. Lets the header status pill update instantly.
 */
export const STORE_STATUS_CHANGED_EVENT = 'krifoo:store-status-changed';

export const restaurantOwnerService = {
  // --- Dining Tables ---
  async getTables(): Promise<{ success: boolean; data?: any[]; message?: string }> {
    return apiRequest('/api/tables', { method: 'GET' });
  },
  async addTable(data: any): Promise<{ success: boolean; data?: any; message?: string }> {
    return apiRequest('/api/tables', {
      method: 'POST',
      body: data,
    });
  },
  async updateTable(tableId: string, data: any): Promise<{ success: boolean; data?: any; message?: string }> {
    return apiRequest(`/api/tables/${tableId}`, {
      method: 'PUT',
      body: data,
    });
  },
  async deleteTable(tableId: string): Promise<{ success: boolean; message?: string }> {
    return apiRequest(`/api/tables/${tableId}`, { method: 'DELETE' });
  },
  async toggleTableStatus(tableId: string): Promise<{ success: boolean; data?: any; message?: string }> {
    return apiRequest(`/api/tables/${tableId}/toggle-active`, { method: 'PATCH' });
  },

  // --- Reservations / Bookings ---
  async getBookings(): Promise<{ success: boolean; data?: any[]; message?: string }> {
    return apiRequest('/api/bookings/restaurant', { method: 'GET' });
  },
  async cancelBooking(bookingId: string): Promise<{ success: boolean; message?: string }> {
    return apiRequest(`/api/bookings/restaurant/${bookingId}/cancel`, { method: 'PATCH' });
  },
  async completeBooking(bookingId: string): Promise<{ success: boolean; message?: string }> {
    return apiRequest(`/api/bookings/restaurant/${bookingId}/complete`, { method: 'PATCH' });
  },
  async expireBooking(bookingId: string): Promise<{ success: boolean; message?: string }> {
    return apiRequest(`/api/bookings/restaurant/${bookingId}/expire`, { method: 'PATCH' });
  },

  // --- Marketing / Campaigns ---
  async getAnnouncements(): Promise<{ success: boolean; data?: any[]; message?: string }> {
    return apiRequest('/api/announcements/owner/all', { method: 'GET' });
  },
  async getAnnouncementStats(): Promise<{ success: boolean; data?: any; message?: string }> {
    return apiRequest('/api/announcements/stats', { method: 'GET' });
  },
  async createAnnouncement(data: FormData): Promise<{ success: boolean; message?: string }> {
    return apiRequest('/api/announcements', {
      method: 'POST',
      body: data,
    });
  },
  async toggleAnnouncement(announcementId: string): Promise<{ success: boolean; message?: string }> {
    return apiRequest(`/api/announcements/${announcementId}/toggle-active`, { method: 'PATCH' });
  },
  async deleteAnnouncement(announcementId: string): Promise<{ success: boolean; message?: string }> {
    return apiRequest(`/api/announcements/${announcementId}`, { method: 'DELETE' });
  },

  // --- Fleet Management ---
  async getFleet(): Promise<{ success: boolean; data?: any[]; message?: string }> {
    return apiRequest('/api/owner/delivery-partners', { method: 'GET' });
  },
  async createDriver(data: any): Promise<{ success: boolean; message?: string }> {
    return apiRequest('/api/owner/delivery-partners', {
      method: 'POST',
      body: data,
    });
  },
  async linkDriver(username: string): Promise<{ success: boolean; message?: string }> {
    return apiRequest('/api/owner/delivery-partners/link', {
      method: 'POST',
      body: { username },
    });
  },
  async unlinkDriver(partnerId: string): Promise<{ success: boolean; message?: string }> {
    return apiRequest(`/api/owner/delivery-partners/${partnerId}`, { method: 'DELETE' });
  },

  // --- Timings & Settings Profile ---
  async getRestaurantTimings(): Promise<{
    success: boolean;
    data?: {
      timings: any[];
      hasCustomDeliveryTimings: boolean;
      deliveryTimings: any[];
      hasCustomExternalDeliveryTimings: boolean;
      externalDeliveryTimings: any[];
    };
    message?: string;
  }> {
    return apiRequest('/api/restaurants/timings', { method: 'GET' });
  },
  async getRestaurantProfile(): Promise<{ success: boolean; data?: any; message?: string }> {
    return apiRequest('/api/restaurants/me', { method: 'GET' });
  },
  /** Krifoo service updates sent to this restaurant (GET /api/restaurants/updates). */
  async getUpdates(): Promise<{ success: boolean; data?: RestaurantUpdate[]; unreadCount?: number; message?: string }> {
    return apiRequest('/api/restaurants/updates', { method: 'GET' });
  },
  /** Mark all Krifoo updates as read. */
  async markUpdatesRead(): Promise<{ success: boolean; message?: string }> {
    return apiRequest('/api/restaurants/updates/read', { method: 'POST' });
  },
  /** Upload / replace the restaurant logo (PUT /api/restaurants/logo, multipart field "image"). */
  async uploadLogo(uri: string): Promise<{ success: boolean; data?: { logoUrl: string }; message?: string }> {
    const form = new FormData();
    const ext = (uri.split('?')[0].split('.').pop() || 'jpg').toLowerCase();
    const safeExt = ['jpg', 'jpeg', 'png', 'webp'].includes(ext) ? ext : 'jpg';
    const mime = `image/${safeExt === 'jpg' ? 'jpeg' : safeExt}`;
    if (Platform.OS === 'web') {
      const blob = await (await fetch(uri)).blob();
      form.append('image', blob, `logo.${safeExt}`);
    } else {
      form.append('image', {
        uri: Platform.OS === 'android' ? uri : uri.replace('file://', ''),
        name: `logo.${safeExt}`,
        type: mime,
      } as any);
    }
    return apiRequest('/api/restaurants/logo', { method: 'PUT', body: form, timeoutMs: 60000 });
  },
  /** Remove the restaurant logo (DELETE /api/restaurants/logo). */
  async removeLogo(): Promise<{ success: boolean; message?: string }> {
    return apiRequest('/api/restaurants/logo', { method: 'DELETE' });
  },
  async updateRestaurantProfile(payload: any): Promise<{ success: boolean; data?: any; message?: string }> {
    return apiRequest('/api/restaurants/profile', {
      method: 'PUT',
      body: payload,
    });
  },
  async toggleRestaurantStatus(isActive?: boolean): Promise<{ success: boolean; data?: any; message?: string }> {
    return apiRequest('/api/restaurants/toggle-status', {
      method: 'PATCH',
      body: typeof isActive === 'boolean' ? { isActive } : undefined,
    });
  },
  async updateRestaurantSettings(payload: any): Promise<{ success: boolean; message?: string }> {
    return apiRequest('/api/restaurants/settings', {
      method: 'PUT',
      body: payload,
    });
  },
  async updateRestaurantTimings(payload: any): Promise<{ success: boolean; message?: string }> {
    const body = Array.isArray(payload) ? { timings: payload } : payload;
    return apiRequest('/api/restaurants/timings', {
      method: 'PUT',
      body,
    });
  },
  async syncStripeAccount(): Promise<{ success: boolean; message?: string }> {
    return apiRequest('/api/owner/stripe-connect/sync', { method: 'POST' });
  },
  async getStripeOnboardingLink(): Promise<{ success: boolean; data?: { url: string }; message?: string }> {
    return apiRequest('/api/owner/stripe-connect/onboarding-link', { method: 'POST' });
  },
  async getStripeLoginLink(): Promise<{ success: boolean; data?: { url: string }; message?: string }> {
    return apiRequest('/api/owner/stripe-connect/login-link', { method: 'POST' });
  },
  async deleteAccount(): Promise<{ success: boolean; message?: string }> {
    return apiRequest('/api/restaurants/me', { method: 'DELETE' });
  },
};

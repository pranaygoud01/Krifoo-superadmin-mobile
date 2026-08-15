import { apiRequest } from './api';

export const restaurantOwnerService = {
  // --- Dining Tables ---
  async getTables(): Promise<{ success: boolean; data?: any[]; message?: string }> {
    return apiRequest('/api/tables', { method: 'GET' });
  },
  async addTable(data: { tableNumber: string; capacity: number }): Promise<{ success: boolean; message?: string }> {
    return apiRequest('/api/tables', {
      method: 'POST',
      body: data,
    });
  },
  async updateTable(tableId: string, data: { tableNumber: string; capacity: number }): Promise<{ success: boolean; message?: string }> {
    return apiRequest(`/api/tables/${tableId}`, {
      method: 'PUT',
      body: data,
    });
  },
  async deleteTable(tableId: string): Promise<{ success: boolean; message?: string }> {
    return apiRequest(`/api/tables/${tableId}`, { method: 'DELETE' });
  },
  async toggleTableStatus(tableId: string): Promise<{ success: boolean; message?: string }> {
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
  async getRestaurantProfile(): Promise<{ success: boolean; data?: any; message?: string }> {
    return apiRequest('/api/restaurants/me', { method: 'GET' });
  },
  async updateRestaurantProfile(payload: any): Promise<{ success: boolean; message?: string }> {
    return apiRequest('/api/restaurants/profile', {
      method: 'PUT',
      body: payload,
    });
  },
  async updateRestaurantSettings(payload: any): Promise<{ success: boolean; message?: string }> {
    return apiRequest('/api/restaurants/settings', {
      method: 'PUT',
      body: payload,
    });
  },
  async updateRestaurantTimings(timings: any[]): Promise<{ success: boolean; message?: string }> {
    return apiRequest('/api/restaurants/timings', {
      method: 'PUT',
      body: { timings },
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
};

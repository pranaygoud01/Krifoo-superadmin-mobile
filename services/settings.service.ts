import { apiRequest } from './api';
import { Category, DeliveryChargeTier } from '../types';

export const settingsService = {
  // ---- Categories ----
  async getCategories(search?: string): Promise<{ success: boolean; data?: Category[]; message?: string }> {
    const query = search ? `?search=${encodeURIComponent(search)}` : '';
    return apiRequest(`/api/admin/categories${query}`);
  },

  async createCategory(payload: {
    categoryName: string;
    description?: string;
    isActive?: boolean;
    categoryType?: 'food' | 'table' | 'both';
  }): Promise<{ success: boolean; data?: Category; message?: string }> {
    return apiRequest('/api/admin/categories', {
      method: 'POST',
      body: payload,
    });
  },

  async updateCategory(
    categoryId: string,
    payload: Partial<{
      categoryName: string;
      description: string;
      isActive: boolean;
      categoryType: string;
    }>
  ): Promise<{ success: boolean; data?: Category; message?: string }> {
    return apiRequest(`/api/admin/categories/${categoryId}`, {
      method: 'PUT',
      body: payload,
    });
  },

  async deleteCategory(categoryId: string): Promise<{ success: boolean; message?: string }> {
    return apiRequest(`/api/admin/categories/${categoryId}`, {
      method: 'DELETE',
    });
  },

  // ---- Delivery Charges ----
  async getDeliveryCharges(): Promise<{ success: boolean; data?: DeliveryChargeTier[]; message?: string }> {
    return apiRequest('/api/admin/delivery-charges');
  },

  async createDeliveryCharge(
    maxDistance: number,
    charge: number
  ): Promise<{ success: boolean; data?: DeliveryChargeTier; message?: string }> {
    return apiRequest('/api/admin/delivery-charges', {
      method: 'POST',
      body: { maxDistance, charge },
    });
  },

  async updateDeliveryCharge(
    chargeId: string,
    payload: { maxDistance?: number; charge?: number }
  ): Promise<{ success: boolean; data?: DeliveryChargeTier; message?: string }> {
    return apiRequest(`/api/admin/delivery-charges/${chargeId}`, {
      method: 'PUT',
      body: payload,
    });
  },

  async deleteDeliveryCharge(chargeId: string): Promise<{ success: boolean; message?: string }> {
    return apiRequest(`/api/admin/delivery-charges/${chargeId}`, {
      method: 'DELETE',
    });
  },

  // ---- Global Settings ----
  async getSettings(): Promise<{ success: boolean; data?: { orderNotificationEmails: string[] }; message?: string }> {
    return apiRequest('/api/admin/settings');
  },

  async updateSettings(
    orderNotificationEmails: string[]
  ): Promise<{ success: boolean; data?: { orderNotificationEmails: string[] }; message?: string }> {
    return apiRequest('/api/admin/settings', {
      method: 'PUT',
      body: { orderNotificationEmails },
    });
  },
};

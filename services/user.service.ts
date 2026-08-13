import { apiRequest } from './api';
import { UserAccount, Category, DeliveryChargeTier } from '../types';

export const userService = {
  async getAllUsers(
    userType?: string,
    search?: string
  ): Promise<{ success: boolean; data?: UserAccount[]; message?: string }> {
    const params = new URLSearchParams();
    if (userType && userType !== 'all') params.append('userType', userType);
    if (search) params.append('search', search);

    const queryString = params.toString() ? `?${params.toString()}` : '';
    const res = await apiRequest(`/api/admin/users${queryString}`, {
      method: 'GET',
    });
    return res;
  },

  async toggleUserActive(
    userId: string,
    isActive: boolean
  ): Promise<{ success: boolean; message?: string }> {
    const res = await apiRequest(`/api/admin/users/${userId}/toggle-active`, {
      method: 'PATCH',
      body: { isActive },
    });
    return res;
  },

  async deleteUser(userId: string): Promise<{ success: boolean; message?: string }> {
    const res = await apiRequest(`/api/admin/users/${userId}`, {
      method: 'DELETE',
    });
    return res;
  },

  async getCategories(): Promise<{ success: boolean; data?: Category[]; message?: string }> {
    const res = await apiRequest('/api/admin/categories', {
      method: 'GET',
    });
    return res;
  },

  async getDeliveryCharges(): Promise<{ success: boolean; data?: DeliveryChargeTier[]; message?: string }> {
    const res = await apiRequest('/api/admin/delivery-charges', {
      method: 'GET',
    });
    return res;
  },
};

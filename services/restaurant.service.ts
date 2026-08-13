import { apiRequest } from './api';
import { Restaurant, VerificationStatus } from '../types';

export const restaurantService = {
  async getRestaurants(status?: string): Promise<{ success: boolean; data?: Restaurant[]; message?: string }> {
    const query = status && status !== 'all' ? `?status=${encodeURIComponent(status)}` : '';
    const res = await apiRequest(`/api/admin/restaurants${query}`, {
      method: 'GET',
    });
    return res;
  },

  async getRestaurantById(id: string): Promise<{ success: boolean; data?: Restaurant; message?: string }> {
    const res = await apiRequest(`/api/admin/restaurants/${id}`, {
      method: 'GET',
    });
    return res;
  },

  async verifyRestaurant(
    id: string,
    verificationStatus: VerificationStatus,
    remarks?: string
  ): Promise<{ success: boolean; message?: string; restaurantDoc?: Restaurant }> {
    const res = await apiRequest(`/api/admin/restaurants/${id}/verify`, {
      method: 'PATCH',
      body: {
        verificationStatus,
        remarks: remarks || '',
      },
    });
    return res;
  },

  async toggleActiveStatus(
    id: string,
    isActive: boolean
  ): Promise<{ success: boolean; message?: string }> {
    const res = await apiRequest(`/api/admin/restaurants/${id}/toggle-active`, {
      method: 'PATCH',
      body: { isActive },
    });
    return res;
  },

  async deleteRestaurant(id: string): Promise<{ success: boolean; message?: string }> {
    const res = await apiRequest(`/api/admin/restaurants/${id}`, {
      method: 'DELETE',
    });
    return res;
  },
};

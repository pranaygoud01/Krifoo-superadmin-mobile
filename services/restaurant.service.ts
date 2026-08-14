import { apiRequest } from './api';
import { Restaurant, VerificationStatus } from '../types';

export const restaurantService = {
  async getRestaurants(filters?: {
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    success: boolean;
    data?: Restaurant[];
    totalPages?: number;
    currentPage?: number;
    message?: string;
  }> {
    const params = new URLSearchParams();
    if (filters?.status && filters.status !== 'all') params.append('status', filters.status);
    if (filters?.page) params.append('page', String(filters.page));
    if (filters?.limit) params.append('limit', String(filters.limit));

    const queryString = params.toString() ? `?${params.toString()}` : '';
    const res = await apiRequest(`/api/admin/restaurants${queryString}`, {
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

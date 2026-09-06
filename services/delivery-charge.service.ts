import { apiRequest } from './api';
import { DeliveryChargeTier } from '../types';

export const deliveryChargeService = {
  async getDeliveryCharges(): Promise<{
    success: boolean;
    data?: DeliveryChargeTier[];
    message?: string;
  }> {
    const res = await apiRequest('/api/admin/delivery-charges', {
      method: 'GET',
    });
    return res;
  },

  async createDeliveryCharge(data: {
    maxDistance: number;
    charge: number;
  }): Promise<{
    success: boolean;
    data?: DeliveryChargeTier;
    message?: string;
  }> {
    const res = await apiRequest('/api/admin/delivery-charges', {
      method: 'POST',
      body: data,
    });
    return res;
  },

  async updateDeliveryCharge(
    id: string,
    data: {
      maxDistance: number;
      charge: number;
    }
  ): Promise<{
    success: boolean;
    data?: DeliveryChargeTier;
    message?: string;
  }> {
    const res = await apiRequest(`/api/admin/delivery-charges/${id}`, {
      method: 'PUT',
      body: data,
    });
    return res;
  },

  async deleteDeliveryCharge(id: string): Promise<{
    success: boolean;
    message?: string;
  }> {
    const res = await apiRequest(`/api/admin/delivery-charges/${id}`, {
      method: 'DELETE',
    });
    return res;
  },
};

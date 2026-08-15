import { apiRequest } from './api';
import { MenuItem, Category } from '../types';

export const menuService = {
  async getRestaurantMenu(restaurantId: string): Promise<{ success: boolean; data?: MenuItem[]; message?: string }> {
    return apiRequest(`/api/menu-items/restaurant/${restaurantId}`, {
      method: 'GET',
    });
  },

  async getAllCategories(): Promise<{ success: boolean; data?: Category[]; message?: string }> {
    return apiRequest('/api/menu-items/categories', {
      method: 'GET',
    });
  },

  async addMenuItem(data: any): Promise<{ success: boolean; message?: string; data?: MenuItem }> {
    return apiRequest('/api/menu-items', {
      method: 'POST',
      body: data,
    });
  },

  async updateMenuItem(itemId: string, data: any): Promise<{ success: boolean; message?: string; data?: MenuItem }> {
    return apiRequest(`/api/menu-items/${itemId}`, {
      method: 'PUT',
      body: data,
    });
  },

  async deleteMenuItem(itemId: string): Promise<{ success: boolean; message?: string }> {
    return apiRequest(`/api/menu-items/${itemId}`, {
      method: 'DELETE',
    });
  },
};

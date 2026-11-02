import { apiRequest } from './api';
import { Category } from '../types';

export const categoryService = {
  async getCategories(status?: string): Promise<{
    success: boolean;
    data?: Category[];
    message?: string;
  }> {
    const query = status && status !== 'all' ? `?status=${status}` : '';
    const res = await apiRequest(`/api/admin/categories${query}`, {
      method: 'GET',
    });
    return res;
  },

  async createCategory(formData: FormData): Promise<{
    success: boolean;
    data?: Category;
    message?: string;
  }> {
    const res = await apiRequest('/api/admin/categories', {
      method: 'POST',
      body: formData,
      isFormData: true,
    });
    return res;
  },

  async updateCategory(id: string, formData: FormData): Promise<{
    success: boolean;
    data?: Category;
    message?: string;
  }> {
    const res = await apiRequest(`/api/admin/categories/${id}`, {
      method: 'PUT',
      body: formData,
      isFormData: true,
    });
    return res;
  },

  async deleteCategory(id: string): Promise<{
    success: boolean;
    message?: string;
  }> {
    const res = await apiRequest(`/api/admin/categories/${id}`, {
      method: 'DELETE',
    });
    return res;
  },
};

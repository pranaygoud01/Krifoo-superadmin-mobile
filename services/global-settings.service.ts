import { apiRequest } from './api';
import { GlobalSettings } from '../types';

export const globalSettingsService = {
  async getSettings(): Promise<{
    success: boolean;
    data?: GlobalSettings;
    message?: string;
  }> {
    const res = await apiRequest('/api/admin/settings', {
      method: 'GET',
    });
    return res;
  },

  async updateSettings(data: GlobalSettings): Promise<{
    success: boolean;
    data?: GlobalSettings;
    message?: string;
  }> {
    const res = await apiRequest('/api/admin/settings', {
      method: 'PUT',
      body: data,
    });
    return res;
  },
};

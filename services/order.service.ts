import { apiRequest } from './api';
import { Order } from '../types';

export const orderService = {
  /**
   * GET /api/admin/orders
   * Supports: status (comma-separated), search, startDate, endDate, page, limit
   * Returns: { success, data: Order[], totalPages, currentPage, totalOrders }
   */
  async getAllOrders(filters?: {
    status?: string;      // single or comma-separated e.g. 'pending,confirmed'
    search?: string;
    startDate?: string;   // ISO string
    endDate?: string;     // ISO string
    page?: number;
    limit?: number;
  }): Promise<{
    success: boolean;
    data?: Order[];
    totalPages?: number;
    currentPage?: number;
    totalOrders?: number;
    message?: string;
  }> {
    const params = new URLSearchParams();
    if (filters?.status && filters.status !== 'all') params.append('status', filters.status);
    if (filters?.search) params.append('search', filters.search);
    if (filters?.startDate) params.append('startDate', filters.startDate);
    if (filters?.endDate) params.append('endDate', filters.endDate);
    if (filters?.page) params.append('page', String(filters.page));
    if (filters?.limit) params.append('limit', String(filters.limit));

    const queryString = params.toString() ? `?${params.toString()}` : '';
    return apiRequest(`/api/admin/orders${queryString}`);
  },

  /**
   * PATCH /api/admin/orders/:orderId/assign-delivery
   * Body: { deliveryPartnerId }
   */
  async assignDeliveryPartner(
    orderId: string,
    deliveryPartnerId: string
  ): Promise<{ success: boolean; message?: string; data?: Order }> {
    return apiRequest(`/api/admin/orders/${orderId}/assign-delivery`, {
      method: 'PATCH',
      body: { deliveryPartnerId },
    });
  },

  /**
   * PATCH /api/admin/orders/:orderId/status
   * Body: { status }
   * Super Admin can force-update any order's status.
   */
  async updateOrderStatus(
    orderId: string,
    status: string
  ): Promise<{ success: boolean; message?: string; data?: Order }> {
    return apiRequest(`/api/admin/orders/${orderId}/status`, {
      method: 'PATCH',
      body: { status },
    });
  },
};

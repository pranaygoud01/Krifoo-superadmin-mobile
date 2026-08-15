import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiRequest } from './api';
import { STORAGE_KEYS } from '../constants/config';
import { Order } from '../types';

async function getUserContext(): Promise<{ isOwner: boolean; restaurantId: string | null }> {
  try {
    const userStr = await AsyncStorage.getItem(STORAGE_KEYS.ADMIN_USER);
    if (!userStr) return { isOwner: false, restaurantId: null };
    const user = JSON.parse(userStr);
    return {
      isOwner: user.userType === 'owner',
      restaurantId: user.restaurantId || user._id || user.id || null,
    };
  } catch {
    return { isOwner: false, restaurantId: null };
  }
}

export const orderService = {
  /**
   * GET orders.
   * If Super Admin: calls /api/admin/orders
   * If Restaurant Owner: calls /api/orders/restaurant
   */
  async getAllOrders(filters?: {
    status?: string;      // single or comma-separated e.g. 'placed,preparing'
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
    const { isOwner } = await getUserContext();

    const url = isOwner
      ? `/api/orders/restaurant${queryString}`
      : `/api/admin/orders${queryString}`;

    return apiRequest(url);
  },

  /**
   * GET order details by ID.
   * If Super Admin: calls /api/admin/orders/:orderId
   * If Restaurant Owner: calls /api/orders/restaurant/:orderId
   */
  async getOrderById(orderId: string): Promise<{ success: boolean; data?: Order; message?: string }> {
    const { isOwner } = await getUserContext();
    const url = isOwner
      ? `/api/orders/restaurant/${orderId}`
      : `/api/admin/orders/${orderId}`;
    return apiRequest(url);
  },

  /**
   * Assign delivery partner to order.
   * If Super Admin: calls PATCH /api/admin/orders/:orderId/assign-delivery
   * If Restaurant Owner: calls PATCH /api/orders/:orderId/assign-delivery
   */
  async assignDeliveryPartner(
    orderId: string,
    deliveryPartnerId: string
  ): Promise<{ success: boolean; message?: string; data?: Order }> {
    const { isOwner } = await getUserContext();
    const url = isOwner
      ? `/api/orders/${orderId}/assign-delivery`
      : `/api/admin/orders/${orderId}/assign-delivery`;

    return apiRequest(url, {
      method: 'PATCH',
      body: { deliveryPartnerId },
    });
  },

  /**
   * Update order status.
   * If Super Admin: calls PUT /api/admin/orders/:orderId/status (body: { status })
   * If Restaurant Owner: calls PATCH /api/orders/:orderId/status (body: { status })
   */
  async updateOrderStatus(
    orderId: string,
    status: string
  ): Promise<{ success: boolean; message?: string; data?: Order }> {
    const { isOwner } = await getUserContext();
    const url = isOwner
      ? `/api/orders/${orderId}/status`
      : `/api/admin/orders/${orderId}/status`;

    return apiRequest(url, {
      method: isOwner ? 'PATCH' : 'PUT',
      body: { status },
    });
  },

  /**
   * GET restaurant dashboard stats.
   * Restaurant Owner only.
   */
  async getRestaurantStats(): Promise<{ success: boolean; data?: any; message?: string }> {
    return apiRequest('/api/orders/restaurant/stats');
  },
};

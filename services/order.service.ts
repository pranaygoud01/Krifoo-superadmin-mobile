import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiRequest } from './api';
import { STORAGE_KEYS } from '../constants/config';
import { Order } from '../types';

export type ManualPaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';

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

const inFlightFetchAll: Record<string, Promise<any> | undefined> = {};

export const orderService = {
  /**
   * GET orders.
   * If Super Admin: calls /api/admin/orders
   * If Restaurant Owner: calls /api/orders/restaurant
   */
  async getAllOrders(filters?: {
    status?: string;      // single or comma-separated e.g. 'placed,preparing'
    search?: string;
    channel?: string;
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
    pagination?: {
      total: number;
      pages: number;
      currentPage: number;
    };
    message?: string;
  }> {
    const params = new URLSearchParams();
    if (filters?.status && filters.status !== 'all') params.append('status', filters.status);
    if (filters?.search) params.append('search', filters.search);
    if (filters?.channel && filters.channel !== 'all') params.append('channel', filters.channel);
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
   * GET orders with deduplication and fast operational paging (default limit=150).
   * Shares identical in-flight requests across components (Header, Orders, Dashboard).
   */
  async fetchAllOrders(filters?: {
    status?: string;
    search?: string;
    channel?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    /**
     * Fetch every page, not just the newest PAGE_LIMIT orders. Needed wherever orders are
     * totalled (analytics): with only page 1, "All time" and busy date ranges silently dropped
     * everything older than the newest 150 orders. Off by default — live screens poll this often.
     */
    allPages?: boolean;
  }): Promise<{
    success: boolean;
    data: Order[];
    totalOrders: number;
    message?: string;
  }> {
    const cacheKey = JSON.stringify(filters || {});
    if (inFlightFetchAll[cacheKey]) {
      return inFlightFetchAll[cacheKey];
    }

    const { allPages, ...queryFilters } = filters || {};
    const PAGE_LIMIT = queryFilters.limit || (allPages ? 200 : 150);
    /** Safety cap for allPages (200 × 100 = 20,000 orders). */
    const MAX_PAGES = 100;

    const promise = (async () => {
      try {
        const firstRes = await this.getAllOrders({
          ...queryFilters,
          page: 1,
          limit: PAGE_LIMIT,
        });

        if (!firstRes.success) {
          return {
            success: false,
            data: [],
            totalOrders: 0,
            message: firstRes.message || 'Failed to fetch orders',
          };
        }

        const firstList: Order[] = firstRes.data || (firstRes as any).orders || [];
        const totalCount: number =
          firstRes.totalOrders ??
          firstRes.pagination?.total ??
          firstList.length;

        if (!allPages) {
          return {
            success: true,
            data: firstList,
            totalOrders: totalCount,
          };
        }

        const pageCount = Math.min(
          MAX_PAGES,
          firstRes.pagination?.pages ?? firstRes.totalPages ?? Math.ceil(totalCount / PAGE_LIMIT)
        );
        const all: Order[] = [...firstList];
        // A few pages at a time: quick, without flooding the server
        const BATCH = 4;
        for (let start = 2; start <= pageCount; start += BATCH) {
          const pages = Array.from({ length: Math.min(BATCH, pageCount - start + 1) }, (_, i) => start + i);
          const results = await Promise.all(
            pages.map((page) => this.getAllOrders({ ...queryFilters, page, limit: PAGE_LIMIT }))
          );
          const failed = results.find((r) => !r.success);
          if (failed) {
            // Partial totals would just be wrong numbers — report the failure instead
            return {
              success: false,
              data: [],
              totalOrders: 0,
              message: failed.message || 'Failed to fetch all orders',
            };
          }
          results.forEach((r) => all.push(...((r.data || (r as any).orders || []) as Order[])));
        }

        // Orders placed while paging shift the pages by one: drop the duplicates that causes
        const seen = new Set<string>();
        const unique = all.filter((o) => {
          const id = String(o._id || '');
          if (!id) return true;
          if (seen.has(id)) return false;
          seen.add(id);
          return true;
        });

        return {
          success: true,
          data: unique,
          totalOrders: totalCount,
        };
      } catch (e: any) {
        console.warn('Error in fetchAllOrders:', e);
        return {
          success: false,
          data: [],
          totalOrders: 0,
          message: e?.message || 'Failed to fetch orders',
        };
      } finally {
        setTimeout(() => {
          delete inFlightFetchAll[cacheKey];
        }, 1500);
      }
    })();

    inFlightFetchAll[cacheKey] = promise;
    return promise;
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
   * Manually set an order's payment status (cash, pay at counter, POS card machine).
   * Restaurant Owner only. The server refuses orders paid online via Stripe.
   * PATCH /api/orders/:orderId/payment-status  (body: { paymentStatus })
   */
  async updatePaymentStatus(
    orderId: string,
    paymentStatus: ManualPaymentStatus
  ): Promise<{ success: boolean; message?: string; data?: Order }> {
    return apiRequest(`/api/orders/${orderId}/payment-status`, {
      method: 'PATCH',
      body: { paymentStatus },
    });
  },

  /**
   * Update expected delivery time for an order.
   * If Super Admin: calls PATCH /api/admin/orders/:orderId/delivery-time
   * If Restaurant Owner: calls PATCH /api/orders/:orderId/delivery-time
   */
  async updateOrderDeliveryTime(
    orderId: string,
    deliveryTime: number
  ): Promise<{ success: boolean; message?: string; data?: Order }> {
    const { isOwner } = await getUserContext();
    const url = isOwner
      ? `/api/orders/${orderId}/delivery-time`
      : `/api/admin/orders/${orderId}/delivery-time`;

    return apiRequest(url, {
      method: 'PATCH',
      body: { deliveryTime, expectedDeliveryTime: deliveryTime },
    });
  },

  /**
   * GET restaurant dashboard stats.
   * Restaurant Owner only.
   */
  async getRestaurantStats(): Promise<{ success: boolean; data?: any; message?: string }> {
    return apiRequest('/api/orders/restaurant/stats');
  },

  /**
   * GET restaurant sales report for date range.
   * Restaurant Owner only.
   */
  async getSalesReport(params?: { startDate?: string; endDate?: string }): Promise<{ success: boolean; data?: any; message?: string }> {
    const q = new URLSearchParams();
    if (params?.startDate) q.append('startDate', params.startDate);
    if (params?.endDate) q.append('endDate', params.endDate);
    const qs = q.toString() ? `?${q.toString()}` : '';
    return apiRequest(`/api/orders/restaurant/reports/sales${qs}`);
  },

  /**
   * GET top menu item performance.
   * Restaurant Owner only.
   */
  async getMenuPerformanceReport(): Promise<{ success: boolean; data?: any[]; message?: string }> {
    return apiRequest('/api/orders/restaurant/reports/menu-performance');
  },

  /**
   * GET orders status & type distribution report.
   * Restaurant Owner only.
   */
  async getOrderDistributionReport(): Promise<{ success: boolean; data?: any; message?: string }> {
    return apiRequest('/api/orders/restaurant/reports/orders');
  },

  /**
   * Place manual POS / cash order.
   * Calls POST /api/orders/place-cash-order
   */
  async createManualOrder(orderData: any): Promise<{ success: boolean; data?: any; message?: string }> {
    return apiRequest('/api/orders/place-cash-order', {
      method: 'POST',
      body: orderData,
    });
  },
};

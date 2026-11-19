import { apiRequest } from './api';
import type { Order } from '../types';

/** Super admin: restaurant payouts & settlement (GET/PATCH /api/admin/payouts…). */

export type PayoutStatusFilter = 'unsettled' | 'settled' | 'all';
export type PayoutPaymentFilter = 'all' | 'card' | 'cash';

export interface PayoutFilters {
  restaurantId?: string; // 'all' or an id
  payoutStatus?: PayoutStatusFilter;
  paymentType?: PayoutPaymentFilter;
  startDate?: string; // YYYY-MM-DD
  endDate?: string;
  search?: string;
}

export interface PayoutOrder extends Order {
  payoutStatus?: 'settled' | 'unsettled';
  settledAt?: string | null;
  settledBy?: { fullName?: string; email?: string } | string | null;
  settlementReference?: string;
}

export interface PayoutSummary {
  totalOrders: number;
  totalCompletedOrders: number;
  totalItemsCost: number;
  totalGrossAmount: number;
  totalDeliveryFee: number;
  totalDiscountAmount: number;
  cardItemsCost: number;
  cashItemsCost: number;
  unsettledItemsCost: number;
  settledItemsCost: number;
  unsettledOrdersCount: number;
  settledOrdersCount: number;
  unsettledCardItemsCost?: number;
  unsettledCardOrdersCount?: number;
  unsettledCashItemsCost?: number;
  unsettledCashOrdersCount?: number;
  averageItemsValue: number;
}

export interface PayoutRestaurant {
  _id: string;
  restaurantName: string;
}

export interface PayoutListResponse {
  success: boolean;
  message?: string;
  data?: PayoutOrder[];
  pagination?: { total: number; page: number; limit: number; totalPages: number };
  summary?: PayoutSummary;
  restaurants?: PayoutRestaurant[];
}

const toQuery = (params: Record<string, string | number | undefined>) => {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '' && v !== 'all')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
};

/** Items cost of one order — same rule as the server (pricing.subtotal, else sum of items). */
export function getOrderItemsCost(order: Order): number {
  const subtotal = (order as any).pricing?.subtotal;
  if (subtotal !== undefined && subtotal !== null && !isNaN(Number(subtotal))) return Number(subtotal);
  const items: any[] = (order as any).orderedItems || [];
  return items.reduce((sum, it) => sum + (Number(it.itemTotal) || Number(it.basePrice) * Number(it.quantity) || 0), 0);
}

export const payoutService = {
  list(filters: PayoutFilters, page = 1, limit = 50): Promise<PayoutListResponse> {
    return apiRequest(`/api/admin/payouts${toQuery({ ...filters, page, limit })}`);
  },

  /** Settle / unsettle specific orders. */
  settleOrders(orderIds: string[], action: 'settle' | 'unsettle', settlementReference = '') {
    return apiRequest('/api/admin/payouts/settle-orders', {
      method: 'PATCH',
      body: { orderIds, action, settlementReference },
    });
  },

  /** Settle every unsettled order matching the filters. */
  settleByFilter(filters: PayoutFilters, settlementReference = '') {
    const { payoutStatus, search, ...filter } = filters;
    return apiRequest('/api/admin/payouts/settle-orders', {
      method: 'PATCH',
      body: { filter, action: 'settle', settlementReference },
    });
  },

  toggle(orderId: string, settlementReference = '') {
    return apiRequest<PayoutOrder>(`/api/admin/payouts/${orderId}/toggle-settle`, {
      method: 'PATCH',
      body: { settlementReference },
    });
  },
};

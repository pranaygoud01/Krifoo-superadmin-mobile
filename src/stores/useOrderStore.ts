import { create } from 'zustand';
import { Order, OrderStatus } from '../types';
import { audioAlertService } from '../services/sound/AudioAlertService';

interface OrderState {
  orders: Order[];
  activeFilter: OrderStatus | 'ALL';
  selectedOrderId: string | null;
  isLoading: boolean;
  error: string | null;

  setOrders: (orders: Order[]) => void;
  addOrder: (order: Order) => void;
  updateOrderStatusOptimistic: (
    orderId: string,
    newStatus: OrderStatus,
    apiUpdateFn: (id: string, status: OrderStatus) => Promise<boolean>
  ) => Promise<boolean>;
  setActiveFilter: (filter: OrderStatus | 'ALL') => void;
  setSelectedOrderId: (id: string | null) => void;
  acceptOrder: (orderId: string, apiUpdateFn: (id: string, status: OrderStatus) => Promise<boolean>) => Promise<boolean>;
  rejectOrder: (orderId: string, apiUpdateFn: (id: string, status: OrderStatus) => Promise<boolean>) => Promise<boolean>;
}

export const useOrderStore = create<OrderState>((set, get) => ({
  orders: [],
  activeFilter: 'ALL',
  selectedOrderId: null,
  isLoading: false,
  error: null,

  setOrders: (orders) => {
    set({ orders });
  },

  addOrder: (order) => {
    set((state) => {
      // Avoid duplicate orders
      if (state.orders.some((o) => o._id === order._id)) {
        return state;
      }
      return { orders: [order, ...state.orders] };
    });
  },

  setActiveFilter: (filter) => set({ activeFilter: filter }),
  setSelectedOrderId: (id) => set({ selectedOrderId: id }),

  updateOrderStatusOptimistic: async (orderId, newStatus, apiUpdateFn) => {
    const currentOrders = get().orders;
    const targetOrder = currentOrders.find((o) => o._id === orderId);
    if (!targetOrder) return false;

    const previousStatus = targetOrder.status;

    // 1. Apply Optimistic Update locally
    set({
      orders: currentOrders.map((o) => (o._id === orderId ? { ...o, status: newStatus } : o)),
    });

    // 2. Perform API call
    try {
      const success = await apiUpdateFn(orderId, newStatus);
      if (!success) {
        throw new Error('Server returned unsuccessful status change');
      }
      return true;
    } catch (err) {
      console.error(`[OrderStore] Status update failed for ${orderId}. Rolling back...`, err);
      // 3. Rollback on failure
      set({
        orders: currentOrders.map((o) => (o._id === orderId ? { ...o, status: previousStatus } : o)),
      });
      return false;
    }
  },

  acceptOrder: async (orderId, apiUpdateFn) => {
    // Immediately stop looping audio alert tone
    await audioAlertService.stopAlert();
    return get().updateOrderStatusOptimistic(orderId, 'preparing', apiUpdateFn);
  },

  rejectOrder: async (orderId, apiUpdateFn) => {
    // Immediately stop looping audio alert tone
    await audioAlertService.stopAlert();
    return get().updateOrderStatusOptimistic(orderId, 'cancelled', apiUpdateFn);
  },
}));

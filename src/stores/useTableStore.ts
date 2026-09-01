import { create } from 'zustand';
import { Table, TableStatus, Order } from '../types';

interface TableState {
  tables: Table[];
  selectedTable: Table | null;
  isLoading: boolean;

  setTables: (tables: Table[]) => void;
  setSelectedTable: (table: Table | null) => void;
  updateTableStatus: (tableId: string, status: TableStatus, currentOrderId?: string) => void;
  transferOrderBetweenTables: (
    fromTableId: string,
    toTableId: string,
    apiTransferFn: (from: string, to: string) => Promise<boolean>
  ) => Promise<boolean>;
  splitCheck: (
    tableId: string,
    splitCount: number
  ) => Array<{ splitIndex: number; amount: number }>;
}

export const useTableStore = create<TableState>((set, get) => ({
  tables: [
    { _id: 't1', tableNumber: 'T1', capacity: 2, status: 'AVAILABLE', section: 'Main Dining' },
    { _id: 't2', tableNumber: 'T2', capacity: 4, status: 'OCCUPIED', currentOrderId: 'ord_101', section: 'Main Dining' },
    { _id: 't3', tableNumber: 'T3', capacity: 4, status: 'BILLED', currentOrderId: 'ord_102', section: 'Main Dining' },
    { _id: 't4', tableNumber: 'T4', capacity: 6, status: 'RESERVED', section: 'VIP Lounge' },
    { _id: 't5', tableNumber: 'T5', capacity: 2, status: 'AVAILABLE', section: 'Patio' },
    { _id: 't6', tableNumber: 'T6', capacity: 8, status: 'AVAILABLE', section: 'VIP Lounge' },
  ],
  selectedTable: null,
  isLoading: false,

  setTables: (tables) => set({ tables }),
  setSelectedTable: (table) => set({ selectedTable: table }),

  updateTableStatus: (tableId, status, currentOrderId) => {
    set((state) => ({
      tables: state.tables.map((t) =>
        t._id === tableId
          ? {
              ...t,
              status,
              currentOrderId: status === 'AVAILABLE' ? undefined : currentOrderId || t.currentOrderId,
            }
          : t
      ),
    }));
  },

  transferOrderBetweenTables: async (fromTableId, toTableId, apiTransferFn) => {
    const currentTables = get().tables;
    const fromTable = currentTables.find((t) => t._id === fromTableId);
    const toTable = currentTables.find((t) => t._id === toTableId);

    if (!fromTable || !toTable || !fromTable.currentOrderId || toTable.status === 'OCCUPIED') {
      return false;
    }

    const orderId = fromTable.currentOrderId;

    // Optimistic transfer
    set({
      tables: currentTables.map((t) => {
        if (t._id === fromTableId) {
          return { ...t, status: 'AVAILABLE', currentOrderId: undefined };
        }
        if (t._id === toTableId) {
          return { ...t, status: 'OCCUPIED', currentOrderId: orderId };
        }
        return t;
      }),
    });

    try {
      const success = await apiTransferFn(fromTableId, toTableId);
      if (!success) throw new Error('Table transfer API failed');
      return true;
    } catch (err) {
      console.error('[TableStore] Table transfer failed. Rolling back...', err);
      set({ tables: currentTables });
      return false;
    }
  },

  splitCheck: (tableId, splitCount) => {
    const table = get().tables.find((t) => t._id === tableId);
    if (!table || !table.activeOrder || splitCount <= 1) return [];

    const grandTotal = table.activeOrder.pricing.total || 0;
    const baseSplitAmount = Math.floor((grandTotal / splitCount) * 100) / 100;
    const remainder = Math.round((grandTotal - baseSplitAmount * splitCount) * 100) / 100;

    const splits = [];
    for (let i = 0; i < splitCount; i++) {
      const amount = i === 0 ? baseSplitAmount + remainder : baseSplitAmount;
      splits.push({ splitIndex: i + 1, amount });
    }
    return splits;
  },
}));

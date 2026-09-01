import { create } from 'zustand';
import { MenuItem, Category } from '../types';

interface MenuState {
  items: MenuItem[];
  categories: Category[];
  selectedCategoryId: string | 'ALL';
  searchQuery: string;
  isLoading: boolean;

  setItems: (items: MenuItem[]) => void;
  setCategories: (categories: Category[]) => void;
  setSelectedCategory: (categoryId: string | 'ALL') => void;
  setSearchQuery: (query: string) => void;
  toggle86ItemOptimistic: (
    itemId: string,
    apiToggleFn: (id: string, isAvailable: boolean) => Promise<boolean>
  ) => Promise<boolean>;
}

export const useMenuStore = create<MenuState>((set, get) => ({
  items: [],
  categories: [],
  selectedCategoryId: 'ALL',
  searchQuery: '',
  isLoading: false,

  setItems: (items) => set({ items }),
  setCategories: (categories) => set({ categories }),
  setSelectedCategory: (categoryId) => set({ selectedCategoryId: categoryId }),
  setSearchQuery: (query) => set({ searchQuery: query }),

  toggle86ItemOptimistic: async (itemId, apiToggleFn) => {
    const currentItems = get().items;
    const targetItem = currentItems.find((i) => i._id === itemId);
    if (!targetItem) return false;

    const newAvailableStatus = !targetItem.isAvailable;

    // 1. Optimistic toggle locally
    set({
      items: currentItems.map((item) =>
        item._id === itemId ? { ...item, isAvailable: newAvailableStatus } : item
      ),
    });

    // 2. Perform API call
    try {
      const success = await apiToggleFn(itemId, newAvailableStatus);
      if (!success) throw new Error('API update failed');
      return true;
    } catch (err) {
      console.error(`[MenuStore] 86 toggle failed for item ${itemId}. Rolling back...`, err);
      // 3. Rollback on failure
      set({
        items: currentItems.map((item) =>
          item._id === itemId ? { ...item, isAvailable: !newAvailableStatus } : item
        ),
      });
      return false;
    }
  },
}));

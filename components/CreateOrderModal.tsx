import React, { useState, useEffect, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  useWindowDimensions,
  Platform,
  KeyboardAvoidingView,
  StatusBar,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  X,
  Plus,
  Minus,
  Trash2,
  UtensilsCrossed,
  ShoppingBag,
  Bike,
  Search,
  Check,
  Printer,
  Sparkles,
  CreditCard,
  Banknote,
  ArrowRight,
  ArrowLeft,
} from 'lucide-react-native';
import { Colors } from '../constants/colors';
import { menuService } from '../services/menu.service';
import { orderService } from '../services/order.service';
import { printThermalReceipt } from '../services/thermal-print.service';
import { MenuItem } from '../types';
import { useAuth } from '../context/AuthContext';
import { getCachedStoreProfile, setCachedStoreProfile, getItemOptionsList } from '../services/receipt-customization.service';
import { restaurantOwnerService } from '../services/restaurant-owner.service';
import { restaurantService } from '../services/restaurant.service';

/**
 * Normalizes any phone string to a valid 10-digit UK format (no leading 0, no +44).
 */
const normalizeUKPhone = (raw?: string | null): string | null => {
  if (!raw) return null;
  let digits = String(raw).replace(/\D/g, '');
  if (digits.startsWith('44') && digits.length >= 11) {
    digits = digits.slice(2);
  }
  while (digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  if (digits.length === 10 && !/^(.)\1+$/.test(digits) && !digits.startsWith('0')) {
    return digits;
  }
  return null;
};


export interface CartEntry {
  cartKey: string;
  item: MenuItem;
  quantity: number;
  selectedVariants: {
    groupId: string;
    variantId: string;
    variantName?: string;
    additionalPrice?: number;
    groupTitle?: string;
  }[];
  selectedAddons: {
    groupId: string;
    addonId: string;
    optionTitle?: string;
    price?: number;
    groupTitle?: string;
  }[];
  selectedWeightVariant?: {
    variantId?: string;
    variantName?: string;
    weight?: number;
    unit?: string;
    price?: number;
  };
  instructions?: string;
  unitPrice: number;
}

interface CreateOrderModalProps {
  visible: boolean;
  onClose: () => void;
  onOrderCreated: () => void;
  initialChannel?: 'dine_in' | 'takeaway' | 'delivery';
  restaurantId?: string;
  restaurantName?: string;
  restaurantPhone?: string;
}

export const CreateOrderModal: React.FC<CreateOrderModalProps> = ({
  visible,
  onClose,
  onOrderCreated,
  initialChannel = 'dine_in',
  restaurantId,
  restaurantName,
  restaurantPhone: propRestaurantPhone,
}) => {
  const { user } = useAuth();
  const [storePhone, setStorePhone] = useState<string>('');
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isTablet = windowWidth >= 768;
  const isWideTablet = windowWidth >= 1024;

  const [mobileTab, setMobileTab] = useState<'menu' | 'cart'>('menu');
  const [channel, setChannel] = useState<'dine_in' | 'takeaway' | 'delivery'>(initialChannel);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [tableNumber, setTableNumber] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentType, setPaymentType] = useState<'cash' | 'card'>('cash');
  const [autoPrint, setAutoPrint] = useState(true);

  // Menu items state
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loadingMenu, setLoadingMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Cart: Map of cartKey -> CartEntry
  const [cart, setCart] = useState<Record<string, CartEntry>>({});
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Customization modal state
  const [customizingItem, setCustomizingItem] = useState<MenuItem | null>(null);
  const [customQuantity, setCustomQuantity] = useState(1);
  const [customSelectedWeightVariant, setCustomSelectedWeightVariant] = useState<any>(null);
  const [customSelectedVariants, setCustomSelectedVariants] = useState<Record<string, string>>({});
  const [customSelectedAddons, setCustomSelectedAddons] = useState<Record<string, string[]>>({});
  const [customInstructions, setCustomInstructions] = useState('');
  const [customError, setCustomError] = useState<string | null>(null);

  // Sync initial channel when modal opens
  useEffect(() => {
    if (visible) {
      setChannel(initialChannel);
      setMobileTab('menu');
      setErrorMsg(null);
      loadMenu();

      // Resolve store / restaurant phone number for fallback
      const cached = getCachedStoreProfile();
      const userPhone = user?.phoneNumber || (typeof user?.restaurantId === 'object' ? user?.restaurantId?.phoneNumber : undefined);
      const initialResolvedPhone = propRestaurantPhone || cached?.phoneNumber || userPhone || '';
      if (initialResolvedPhone) {
        setStorePhone(initialResolvedPhone);
      } else {
        if (restaurantId && typeof restaurantId === 'string' && restaurantId.length === 24) {
          restaurantService.getRestaurantById(restaurantId).then((res) => {
            if (res.success && res.data?.phoneNumber) {
              setStorePhone(res.data.phoneNumber);
            }
          }).catch(() => {});
        } else {
          restaurantOwnerService.getRestaurantProfile().then((res) => {
            if (res.success && res.data?.phoneNumber) {
              setStorePhone(res.data.phoneNumber);
              setCachedStoreProfile({
                restaurantName: res.data.restaurantName,
                phoneNumber: res.data.phoneNumber,
                address: res.data.address,
              });
            }
          }).catch(() => {});
        }
      }
    } else {
      // Reset state
      setCart({});
      setCustomerName('');
      setCustomerPhone('');
      setTableNumber('');
      setDeliveryAddress('');
      setNotes('');
      setSearchQuery('');
      setCustomizingItem(null);
      setCustomError(null);
    }
  }, [visible, initialChannel]);

  const loadMenu = async () => {
    setLoadingMenu(true);
    try {
      let res;
      if (restaurantId) {
        res = await menuService.getRestaurantMenu(restaurantId);
      } else {
        res = await menuService.getAllMenuItems();
      }
      if (res.success && res.data) {
        setMenuItems(res.data.filter((item: any) => item.isAvailable !== false));
      }
    } catch (e) {
      console.warn('Failed loading menu for create order:', e);
    } finally {
      setLoadingMenu(false);
    }
  };

  // Categories list
  const categories = useMemo(() => {
    const set = new Set<string>();
    menuItems.forEach((item) => {
      const rawCat: any = item.category || (item as any).categoryId;
      const cat = typeof rawCat === 'object' ? rawCat?.name : rawCat;
      if (cat) set.add(cat);
    });
    return ['all', ...Array.from(set)];
  }, [menuItems]);

  // Filtered menu items
  const filteredItems = useMemo(() => {
    return menuItems.filter((item) => {
      const name = (item.name || item.itemName || '').toLowerCase();
      const matchSearch = !searchQuery || name.includes(searchQuery.toLowerCase().trim());
      const rawCat: any = item.category || (item as any).categoryId;
      const cat = typeof rawCat === 'object' ? rawCat?.name : rawCat;
      const matchCat = selectedCategory === 'all' || cat === selectedCategory;
      return matchSearch && matchCat;
    });
  }, [menuItems, searchQuery, selectedCategory]);

  const getItemBasePrice = (item: MenuItem, channelType: 'dine_in' | 'takeaway' | 'delivery'): number => {
    let p = Number(item.price ?? item.basePrice ?? 0);
    if (channelType === 'delivery' && item.deliveryPrice != null && !isNaN(Number(item.deliveryPrice))) {
      p = Number(item.deliveryPrice);
    } else if (channelType === 'takeaway' && item.collectionPrice != null && !isNaN(Number(item.collectionPrice))) {
      p = Number(item.collectionPrice);
    } else if (channelType === 'dine_in' && item.eatInPrice != null && !isNaN(Number(item.eatInPrice))) {
      p = Number(item.eatInPrice);
    }
    return p;
  };

  const hasCustomizations = (item: MenuItem): boolean => {
    const hasVariants = Array.isArray(item.variantGroups) && item.variantGroups.length > 0;
    const hasAddons = Array.isArray(item.addonGroups) && item.addonGroups.length > 0;
    const hasWeightVariants = Array.isArray(item.weightVariants) && item.weightVariants.length > 1;
    return Boolean(hasVariants || hasAddons || hasWeightVariants);
  };

  const getItemCartCount = (itemId: string): number => {
    return Object.values(cart)
      .filter((entry) => (entry.item._id || (entry.item as any).id) === itemId)
      .reduce((sum, entry) => sum + entry.quantity, 0);
  };

  const generateCartKey = (
    itemId: string,
    wv?: any,
    variants?: { groupId: string; variantId: string }[],
    addons?: { groupId: string; addonId: string }[],
    instructions?: string
  ): string => {
    const wvKey = wv ? (wv.variantId || wv.variantName || '') : '';
    const vKey = (variants || [])
      .map((v) => `${v.groupId}:${v.variantId}`)
      .sort()
      .join('|');
    const aKey = (addons || [])
      .map((a) => `${a.groupId}:${a.addonId}`)
      .sort()
      .join('|');
    const iKey = (instructions || '').trim().toLowerCase();
    return `${itemId}__${wvKey}__${vKey}__${aKey}__${iKey}`;
  };

  const openCustomizationModal = (item: MenuItem) => {
    setCustomizingItem(item);
    setCustomQuantity(1);
    setCustomInstructions('');
    setCustomError(null);

    // Default weight variant
    if (Array.isArray(item.weightVariants) && item.weightVariants.length > 0) {
      const defWv = item.weightVariants.find((w: any) => w.isDefault) || item.weightVariants[0];
      setCustomSelectedWeightVariant(defWv);
    } else {
      setCustomSelectedWeightVariant(null);
    }

    // Default variant for each variant group (first option)
    const initialVariants: Record<string, string> = {};
    if (Array.isArray(item.variantGroups)) {
      item.variantGroups.forEach((vg: any) => {
        if (Array.isArray(vg.variants) && vg.variants.length > 0) {
          initialVariants[vg.groupId] = vg.variants[0].variantId;
        }
      });
    }
    setCustomSelectedVariants(initialVariants);

    // Addons empty initially
    const initialAddons: Record<string, string[]> = {};
    if (Array.isArray(item.addonGroups)) {
      item.addonGroups.forEach((ag: any) => {
        initialAddons[ag.groupId] = [];
      });
    }
    setCustomSelectedAddons(initialAddons);
  };

  const toggleCustomAddon = (group: any, addonId: string) => {
    const groupId = group.groupId;
    const max = group.maxSelection || 0;
    setCustomSelectedAddons((prev) => {
      const list = prev[groupId] || [];
      if (list.includes(addonId)) {
        return { ...prev, [groupId]: list.filter((id) => id !== addonId) };
      }
      if (max === 1) {
        return { ...prev, [groupId]: [addonId] };
      }
      if (max > 1 && list.length >= max) {
        return prev;
      }
      return { ...prev, [groupId]: [...list, addonId] };
    });
  };

  const customUnitPrice = useMemo(() => {
    if (!customizingItem) return 0;
    let base = getItemBasePrice(customizingItem, channel);
    if (customSelectedWeightVariant) {
      if (channel === 'delivery' && customSelectedWeightVariant.deliveryPrice != null && !isNaN(Number(customSelectedWeightVariant.deliveryPrice))) {
        base = Number(customSelectedWeightVariant.deliveryPrice);
      } else if (channel === 'takeaway' && customSelectedWeightVariant.collectionPrice != null && !isNaN(Number(customSelectedWeightVariant.collectionPrice))) {
        base = Number(customSelectedWeightVariant.collectionPrice);
      } else if (channel === 'dine_in' && customSelectedWeightVariant.eatInPrice != null && !isNaN(Number(customSelectedWeightVariant.eatInPrice))) {
        base = Number(customSelectedWeightVariant.eatInPrice);
      } else {
        base = Number(customSelectedWeightVariant.price || 0);
      }
    }

    let variantsAdd = 0;
    if (Array.isArray(customizingItem.variantGroups)) {
      customizingItem.variantGroups.forEach((vg: any) => {
        const selId = customSelectedVariants[vg.groupId];
        if (selId) {
          const v = vg.variants?.find((x: any) => String(x.variantId) === String(selId));
          if (v) variantsAdd += Number(v.additionalPrice || 0);
        }
      });
    }

    let addonsAdd = 0;
    if (Array.isArray(customizingItem.addonGroups)) {
      customizingItem.addonGroups.forEach((ag: any) => {
        const selIds = customSelectedAddons[ag.groupId] || [];
        selIds.forEach((id: string) => {
          const a = ag.addons?.find((x: any) => String(x.addonId) === String(id));
          if (a) addonsAdd += Number(a.price || 0);
        });
      });
    }

    let totalUnit = base + variantsAdd + addonsAdd;
    if (customizingItem.discountPercentage && customizingItem.discountPercentage > 0) {
      totalUnit = totalUnit * (1 - customizingItem.discountPercentage / 100);
    }
    return Math.max(0, totalUnit);
  }, [customizingItem, channel, customSelectedWeightVariant, customSelectedVariants, customSelectedAddons]);

  const handleConfirmCustomization = () => {
    if (!customizingItem) return;

    if (Array.isArray(customizingItem.addonGroups)) {
      for (const group of customizingItem.addonGroups) {
        const isCompulsory = group.customizationBehavior === 'compulsory' || Boolean(group.minSelection && group.minSelection > 0);
        const min = group.minSelection ? Math.max(group.minSelection, 1) : (isCompulsory ? 1 : 0);
        const selectedCount = (customSelectedAddons[group.groupId] || []).length;
        if (isCompulsory && selectedCount < min) {
          setCustomError(`Please select at least ${min} option${min > 1 ? 's' : ''} for "${group.groupTitle}".`);
          return;
        }
      }
    }

    const resolvedVariants: {
      groupId: string;
      variantId: string;
      variantName?: string;
      additionalPrice?: number;
      groupTitle?: string;
    }[] = [];
    if (Array.isArray(customizingItem.variantGroups)) {
      customizingItem.variantGroups.forEach((vg: any) => {
        const selId = customSelectedVariants[vg.groupId];
        if (selId) {
          const v = vg.variants?.find((x: any) => String(x.variantId) === String(selId));
          if (v) {
            resolvedVariants.push({
              groupId: vg.groupId,
              variantId: v.variantId,
              variantName: v.variantName,
              additionalPrice: Number(v.additionalPrice || 0),
              groupTitle: vg.groupTitle,
            });
          }
        }
      });
    }

    const resolvedAddons: {
      groupId: string;
      addonId: string;
      optionTitle?: string;
      price?: number;
      groupTitle?: string;
    }[] = [];
    if (Array.isArray(customizingItem.addonGroups)) {
      customizingItem.addonGroups.forEach((ag: any) => {
        const selIds = customSelectedAddons[ag.groupId] || [];
        selIds.forEach((id: string) => {
          const a = ag.addons?.find((x: any) => String(x.addonId) === String(id));
          if (a) {
            resolvedAddons.push({
              groupId: ag.groupId,
              addonId: a.addonId,
              optionTitle: a.optionTitle,
              price: Number(a.price || 0),
              groupTitle: ag.groupTitle,
            });
          }
        });
      });
    }

    const itemId = customizingItem._id || (customizingItem as any).id;
    const cartKey = generateCartKey(
      itemId,
      customSelectedWeightVariant,
      resolvedVariants,
      resolvedAddons,
      customInstructions
    );

    setCart((prev) => {
      const existing = prev[cartKey];
      const newQty = (existing?.quantity || 0) + customQuantity;
      return {
        ...prev,
        [cartKey]: {
          cartKey,
          item: customizingItem,
          quantity: newQty,
          selectedVariants: resolvedVariants,
          selectedAddons: resolvedAddons,
          selectedWeightVariant: customSelectedWeightVariant || undefined,
          instructions: customInstructions.trim() || undefined,
          unitPrice: customUnitPrice,
        },
      };
    });

    setCustomizingItem(null);
  };

  const handleItemPress = (item: MenuItem) => {
    if (hasCustomizations(item)) {
      openCustomizationModal(item);
    } else {
      addDirectItemToCart(item);
    }
  };

  const addDirectItemToCart = (item: MenuItem) => {
    const id = item._id || (item as any).id;
    const cartKey = id;
    let unitPrice = getItemBasePrice(item, channel);
    if (item.discountPercentage && item.discountPercentage > 0) {
      unitPrice = unitPrice * (1 - item.discountPercentage / 100);
    }

    setCart((prev) => {
      const existing = prev[cartKey];
      return {
        ...prev,
        [cartKey]: {
          cartKey,
          item,
          quantity: (existing?.quantity || 0) + 1,
          selectedVariants: [],
          selectedAddons: [],
          unitPrice,
        },
      };
    });
  };

  const incrementCartItem = (cartKey: string) => {
    setCart((prev) => {
      const existing = prev[cartKey];
      if (!existing) return prev;
      return {
        ...prev,
        [cartKey]: { ...existing, quantity: existing.quantity + 1 },
      };
    });
  };

  const decrementCartItem = (cartKey: string) => {
    setCart((prev) => {
      const existing = prev[cartKey];
      if (!existing) return prev;
      if (existing.quantity <= 1) {
        const next = { ...prev };
        delete next[cartKey];
        return next;
      }
      return {
        ...prev,
        [cartKey]: { ...existing, quantity: existing.quantity - 1 },
      };
    });
  };

  const removeCartItem = (cartKey: string) => {
    setCart((prev) => {
      const next = { ...prev };
      delete next[cartKey];
      return next;
    });
  };

  // Calculations
  const cartEntries = Object.values(cart);
  const totalItemCount = cartEntries.reduce((sum, e) => sum + e.quantity, 0);
  const subtotal = cartEntries.reduce((sum, e) => {
    return sum + e.unitPrice * e.quantity;
  }, 0);

  const handleSubmit = async () => {
    if (cartEntries.length === 0) {
      setErrorMsg('Please select at least 1 menu item to create an order.');
      return;
    }

    // Phone validation & normalization
    let finalPhone = '';
    const trimmedPhone = customerPhone.trim();
    if (trimmedPhone) {
      const validPhone = normalizeUKPhone(trimmedPhone);
      if (!validPhone) {
        setErrorMsg('Please enter a valid UK phone number (e.g. 07123 456789) or leave blank.');
        return;
      }
      finalPhone = validPhone;
    } else {
      // Default phone for POS orders: use store or restaurant phone number
      const candidateStorePhone =
        storePhone ||
        propRestaurantPhone ||
        getCachedStoreProfile()?.phoneNumber ||
        user?.phoneNumber ||
        (typeof user?.restaurantId === 'object' ? user?.restaurantId?.phoneNumber : undefined);

      const resolvedStorePhone = normalizeUKPhone(candidateStorePhone);
      if (channel === 'delivery' && !resolvedStorePhone) {
        setErrorMsg('Phone number is required for delivery orders.');
        return;
      }
      // Use restaurant/store phone number as default (falls back to '7000000001' if restaurant phone not yet configured)
      finalPhone = resolvedStorePhone || '7000000001';
    }

    if (channel === 'delivery' && !deliveryAddress.trim()) {
      setErrorMsg('Delivery address is required for delivery orders.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      const orderPayload: any = {
        cartType: 'foodCart',
        orderType: channel,
        phoneNumber: finalPhone,
        customerName: customerName.trim() || (channel === 'dine_in' ? `Table ${tableNumber || 'Guest'}` : 'Counter Customer'),
        customerEmail: 'pos-counter@krifoo.co.uk',
        notes: [
          channel === 'dine_in' && tableNumber ? `Table: ${tableNumber}` : null,
          notes.trim() || null,
        ]
          .filter(Boolean)
          .join(' • '),
        paymentType: paymentType,
        items: cartEntries.map((e) => ({
          menuItemId: e.item._id || (e.item as any).id,
          quantity: e.quantity,
          selectedWeightVariant: e.selectedWeightVariant,
          selectedVariants: (e.selectedVariants || []).map((v) => ({
            groupId: v.groupId,
            variantId: v.variantId,
          })),
          selectedAddons: (e.selectedAddons || []).map((a) => ({
            groupId: a.groupId,
            addonId: a.addonId,
          })),
          instructions: e.instructions || '',
        })),
      };

      if (channel === 'delivery') {
        orderPayload.deliveryAddress = {
          addressLine1: deliveryAddress.trim(),
          coordinates: [-0.1278, 51.5074], // London fallback coordinates
        };
      }

      const res = await orderService.createManualOrder(orderPayload);
      if (res.success) {
        if (autoPrint && res.data) {
          try {
            printThermalReceipt(res.data, true);
          } catch (pe) {
            console.warn('Auto print receipt error:', pe);
          }
        }
        onOrderCreated();
        onClose();
      } else {
        setErrorMsg(res.message || 'Failed to place order. Please verify input.');
      }
    } catch (e: any) {
      setErrorMsg(e?.message || 'Error occurred while creating order.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom', 'left', 'right']}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
        <KeyboardAvoidingView
          style={styles.fullScreenContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* Header */}
          <View style={[styles.modalHeader, isTablet && styles.modalHeaderTablet]}>
            <View style={styles.headerLeftGroup}>
              <View style={styles.titleRow}>
                <Sparkles size={18} color="#FF5C39" />
                <Text style={[styles.modalTitle, isTablet && styles.modalTitleTablet]} numberOfLines={1}>
                  POS Order Terminal
                </Text>
                <View style={styles.quickLiveBadge}>
                  <Text style={styles.quickLiveBadgeText}>LIVE</Text>
                </View>
              </View>
              <Text style={styles.modalSub} numberOfLines={1}>
                {restaurantName ? `${restaurantName} • Punch & Dispatch Order` : 'Punch In-Store, Takeaway or Delivery Order'}
              </Text>
            </View>

            <View style={styles.headerRightGroup}>
              {cartEntries.length > 0 && (
                <TouchableOpacity
                  onPress={() => setCart({})}
                  style={isTablet ? styles.headerClearBtn : styles.headerClearIconBtn}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Trash2 size={14} color="#EF4444" />
                  {isTablet && <Text style={styles.headerClearText}>Clear Order</Text>}
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={onClose}
                style={styles.closeBtn}
                activeOpacity={0.7}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <X size={20} color="#475569" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Mobile View Switcher Tabs (Menu vs Ticket) */}
          {!isTablet && (
            <View style={styles.mobileSegmentBar}>
              <TouchableOpacity
                style={[
                  styles.mobileSegmentTab,
                  mobileTab === 'menu' && styles.mobileSegmentTabActive,
                ]}
                onPress={() => setMobileTab('menu')}
                activeOpacity={0.8}
              >
                <UtensilsCrossed size={14} color={mobileTab === 'menu' ? '#FF5C39' : '#64748B'} />
                <Text style={[styles.mobileSegmentText, mobileTab === 'menu' && styles.mobileSegmentTextActive]}>
                  Menu ({filteredItems.length})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.mobileSegmentTab,
                  mobileTab === 'cart' && styles.mobileSegmentTabActive,
                ]}
                onPress={() => setMobileTab('cart')}
                activeOpacity={0.8}
              >
                <ShoppingBag size={14} color={mobileTab === 'cart' ? '#FF5C39' : '#64748B'} />
                <Text style={[styles.mobileSegmentText, mobileTab === 'cart' && styles.mobileSegmentTextActive]}>
                  Ticket & Pay
                </Text>
                {totalItemCount > 0 && (
                  <View style={styles.mobileTabBadge}>
                    <Text style={styles.mobileTabBadgeText}>{totalItemCount}</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* Main Body */}
          <View style={[styles.modalBody, isTablet && styles.modalBodyTablet]}>
            {/* Left Column: Menu Items Browser (Shown on Tablet OR Mobile 'menu' tab) */}
            {(isTablet || mobileTab === 'menu') && (
              <View style={[styles.leftColumn, isTablet && styles.leftColumnTablet]}>
                {/* Channel Selector */}
                <View style={styles.channelRow}>
                  <TouchableOpacity
                    style={[styles.channelChip, channel === 'dine_in' && styles.channelChipDineInActive]}
                    onPress={() => setChannel('dine_in')}
                    activeOpacity={0.8}
                  >
                    <UtensilsCrossed size={14} color={channel === 'dine_in' ? '#7C3AED' : '#64748B'} />
                    <Text
                      style={[styles.channelChipText, channel === 'dine_in' && styles.channelChipTextDineInActive]}
                      numberOfLines={1}
                    >
                      {isTablet ? 'In-Store (Dine-In)' : 'Dine-In'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.channelChip, channel === 'takeaway' && styles.channelChipTakeawayActive]}
                    onPress={() => setChannel('takeaway')}
                    activeOpacity={0.8}
                  >
                    <ShoppingBag size={14} color={channel === 'takeaway' ? '#EA580C' : '#64748B'} />
                    <Text
                      style={[styles.channelChipText, channel === 'takeaway' && styles.channelChipTextTakeawayActive]}
                      numberOfLines={1}
                    >
                      Takeaway
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.channelChip, channel === 'delivery' && styles.channelChipDeliveryActive]}
                    onPress={() => setChannel('delivery')}
                    activeOpacity={0.8}
                  >
                    <Bike size={14} color={channel === 'delivery' ? '#2563EB' : '#64748B'} />
                    <Text
                      style={[styles.channelChipText, channel === 'delivery' && styles.channelChipTextDeliveryActive]}
                      numberOfLines={1}
                    >
                      Delivery
                    </Text>
                  </TouchableOpacity>
                </View>

              {/* Menu Search & Categories */}
              <View style={styles.searchRow}>
                <Search size={16} color="#94A3B8" />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search dishes or menu items..."
                  placeholderTextColor="#94A3B8"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
                {searchQuery ? (
                  <TouchableOpacity onPress={() => setSearchQuery('')}>
                    <X size={15} color="#94A3B8" />
                  </TouchableOpacity>
                ) : null}
              </View>

              {/* Category Pills */}
              {categories.length > 1 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
                  {categories.map((cat) => (
                    <TouchableOpacity
                      key={cat}
                      style={[styles.catChip, selectedCategory === cat && styles.catChipActive]}
                      onPress={() => setSelectedCategory(cat)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.catChipText, selectedCategory === cat && styles.catChipTextActive]}>
                        {cat === 'all' ? 'All Dishes' : cat}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}

              {/* Menu Items List */}
              {loadingMenu ? (
                <View style={styles.menuLoadingBox}>
                  <ActivityIndicator size="small" color="#FF5C39" />
                  <Text style={styles.menuLoadingText}>Loading live menu items...</Text>
                </View>
              ) : filteredItems.length === 0 ? (
                <View style={styles.emptyItemsBox}>
                  <Text style={styles.emptyItemsText}>No menu items found.</Text>
                </View>
              ) : (
                <ScrollView
                  style={styles.itemsScrollView}
                  contentContainerStyle={[
                    styles.itemsScrollContent,
                    !isTablet && { paddingBottom: Math.max(insets.bottom, 12) + 80 },
                  ]}
                  showsVerticalScrollIndicator={true}
                >
                  <View style={styles.itemsGrid}>
                    {filteredItems.map((item) => {
                      const id = item._id || (item as any).id;
                      const cartCount = getItemCartCount(id);
                      const price = getItemBasePrice(item, channel);
                      const isCustomizable = hasCustomizations(item);

                      return (
                        <TouchableOpacity
                          key={id}
                          style={[
                            styles.itemCard,
                            isWideTablet && styles.itemCardWide,
                            cartCount > 0 && styles.itemCardSelected,
                          ]}
                          onPress={() => handleItemPress(item)}
                          activeOpacity={0.7}
                        >
                          <View style={styles.itemContent}>
                            <View style={styles.itemTitleRow}>
                              <Text style={styles.itemTitle} numberOfLines={1}>
                                {item.name || item.itemName}
                              </Text>
                              {isCustomizable ? (
                                <View style={styles.customBadge}>
                                  <Text style={styles.customBadgeText}>Options</Text>
                                </View>
                              ) : null}
                            </View>
                            <Text style={styles.itemPriceText}>£{price.toFixed(2)}</Text>
                          </View>

                          {cartCount > 0 ? (
                            <View style={styles.itemQtyBadge}>
                              <Text style={styles.itemQtyBadgeText}>{cartCount}</Text>
                            </View>
                          ) : (
                            <View style={styles.itemAddIcon}>
                              <Plus size={14} color="#FF5C39" />
                            </View>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </ScrollView>
              )}

              {/* Mobile Floating Checkout Bar */}
              {!isTablet && (
                <View
                  style={[
                    styles.mobileFloatingBar,
                    { paddingBottom: Math.max(insets.bottom, 12) + 4 },
                  ]}
                >
                  <View style={styles.mobileFloatingInfo}>
                    <Text style={styles.mobileFloatingCount}>
                      {totalItemCount} {totalItemCount === 1 ? 'item' : 'items'} in ticket
                    </Text>
                    <Text style={styles.mobileFloatingTotal}>£{subtotal.toFixed(2)}</Text>
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.mobileViewCartBtn,
                      cartEntries.length === 0 && styles.mobileViewCartBtnDisabled,
                    ]}
                    onPress={() => setMobileTab('cart')}
                    disabled={cartEntries.length === 0}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.mobileViewCartBtnText}>
                      {cartEntries.length === 0 ? 'Select Dishes' : 'Review & Pay'}
                    </Text>
                    {cartEntries.length > 0 ? <ArrowRight size={14} color="#FFFFFF" /> : null}
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {/* Right Column: Order Details & Cart (Shown on Tablet OR Mobile 'cart' tab) */}
          {(isTablet || mobileTab === 'cart') && (
            <View style={[styles.rightColumn, isTablet && styles.rightColumnTablet]}>
              {!isTablet && (
                <TouchableOpacity
                  style={styles.mobileBackBtn}
                  onPress={() => setMobileTab('menu')}
                  activeOpacity={0.7}
                >
                  <ArrowLeft size={15} color="#FF5C39" />
                  <Text style={styles.mobileBackBtnText}>Back to Menu (Add More)</Text>
                </TouchableOpacity>
              )}
              <ScrollView showsVerticalScrollIndicator={false}>
                {/* Channel Specific Fields */}
                <View style={styles.formSection}>
                  <Text style={styles.formSectionTitle}>
                    {channel === 'dine_in'
                      ? 'Dine-In Details'
                      : channel === 'takeaway'
                      ? 'Takeaway Details'
                      : 'Delivery Address'}
                  </Text>

                  {channel === 'dine_in' && (
                    <View style={styles.fieldRow}>
                      <TextInput
                        style={[styles.inputField, { flex: 1 }]}
                        placeholder="Table No. (e.g. T4)"
                        placeholderTextColor="#94A3B8"
                        value={tableNumber}
                        onChangeText={setTableNumber}
                      />
                      <TextInput
                        style={[styles.inputField, { flex: 1.5 }]}
                        placeholder="Guest Name (Optional)"
                        placeholderTextColor="#94A3B8"
                        value={customerName}
                        onChangeText={setCustomerName}
                      />
                    </View>
                  )}

                  {channel === 'takeaway' && (
                    <View style={styles.fieldRow}>
                      <TextInput
                        style={[styles.inputField, { flex: 1.2 }]}
                        placeholder="Customer Name"
                        placeholderTextColor="#94A3B8"
                        value={customerName}
                        onChangeText={(t) => {
                          setCustomerName(t);
                          if (errorMsg) setErrorMsg(null);
                        }}
                      />
                      <TextInput
                        style={[styles.inputField, { flex: 1.2 }]}
                        placeholder="Phone No. (Optional)"
                        placeholderTextColor="#94A3B8"
                        keyboardType="phone-pad"
                        value={customerPhone}
                        onChangeText={(t) => {
                          setCustomerPhone(t);
                          if (errorMsg) setErrorMsg(null);
                        }}
                      />
                    </View>
                  )}

                  {channel === 'delivery' && (
                    <View style={{ gap: 8 }}>
                      <View style={styles.fieldRow}>
                        <TextInput
                          style={[styles.inputField, { flex: 1 }]}
                          placeholder="Recipient Name"
                          placeholderTextColor="#94A3B8"
                          value={customerName}
                          onChangeText={(t) => {
                            setCustomerName(t);
                            if (errorMsg) setErrorMsg(null);
                          }}
                        />
                        <TextInput
                          style={[styles.inputField, { flex: 1 }]}
                          placeholder="Phone No."
                          placeholderTextColor="#94A3B8"
                          keyboardType="phone-pad"
                          value={customerPhone}
                          onChangeText={(t) => {
                            setCustomerPhone(t);
                            if (errorMsg) setErrorMsg(null);
                          }}
                        />
                      </View>
                      <TextInput
                        style={styles.inputField}
                        placeholder="Delivery Address & Postal Code"
                        placeholderTextColor="#94A3B8"
                        value={deliveryAddress}
                        onChangeText={(t) => {
                          setDeliveryAddress(t);
                          if (errorMsg) setErrorMsg(null);
                        }}
                      />
                    </View>
                  )}

                  {/* Notes / Instructions */}
                  <TextInput
                    style={[styles.inputField, { marginTop: 8 }]}
                    placeholder="Kitchen instructions / allergy notes..."
                    placeholderTextColor="#94A3B8"
                    value={notes}
                    onChangeText={setNotes}
                  />
                </View>

                {/* Cart Items Section */}
                <View style={styles.cartSection}>
                  <View style={styles.cartHeaderRow}>
                    <Text style={styles.cartHeaderTitle}>Ordered Items ({totalItemCount})</Text>
                    {cartEntries.length > 0 && (
                      <TouchableOpacity onPress={() => setCart({})}>
                        <Text style={styles.clearCartText}>Clear</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {cartEntries.length === 0 ? (
                    <View style={styles.emptyCartBox}>
                      <Text style={styles.emptyCartText}>No items added yet.</Text>
                      <Text style={styles.emptyCartSub}>Tap items on the left to add.</Text>
                    </View>
                  ) : (
                    <View style={styles.cartList}>
                      {cartEntries.map((entry) => {
                        const options = getItemOptionsList(entry);

                        return (
                          <View key={entry.cartKey} style={styles.cartItemRow}>
                            <View style={styles.cartItemInfo}>
                              <Text style={styles.cartItemName} numberOfLines={1}>
                                {entry.item.name || entry.item.itemName}
                              </Text>

                              {options.length > 0 ? (
                                <View style={styles.cartItemOptionsList}>
                                  {options.map((opt, idx) => (
                                    <Text key={idx} style={styles.cartItemOptionPill}>
                                      • {opt}
                                    </Text>
                                  ))}
                                </View>
                              ) : null}

                              {entry.instructions ? (
                                <Text style={styles.cartItemInstructions} numberOfLines={1}>
                                  Note: {entry.instructions}
                                </Text>
                              ) : null}

                              <Text style={styles.cartItemPrice}>
                                £{(entry.unitPrice * entry.quantity).toFixed(2)}
                                {entry.quantity > 1 ? ` (£${entry.unitPrice.toFixed(2)} ea)` : ''}
                              </Text>
                            </View>

                            <View style={styles.qtyControlRow}>
                              <TouchableOpacity
                                style={styles.qtyBtn}
                                onPress={() => decrementCartItem(entry.cartKey)}
                                activeOpacity={0.7}
                              >
                                <Minus size={13} color="#64748B" />
                              </TouchableOpacity>
                              <Text style={styles.qtyNumber}>{entry.quantity}</Text>
                              <TouchableOpacity
                                style={styles.qtyBtn}
                                onPress={() => incrementCartItem(entry.cartKey)}
                                activeOpacity={0.7}
                              >
                                <Plus size={13} color="#64748B" />
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={styles.deleteBtn}
                                onPress={() => removeCartItem(entry.cartKey)}
                                activeOpacity={0.7}
                              >
                                <Trash2 size={13} color="#EF4444" />
                              </TouchableOpacity>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>

                {/* Payment Option & Auto-print */}
                <View style={styles.paymentSection}>
                  <Text style={styles.formSectionTitle}>Payment Method</Text>
                  <View style={styles.paymentRow}>
                    <TouchableOpacity
                      style={[styles.paymentBtn, paymentType === 'cash' && styles.paymentBtnCashActive]}
                      onPress={() => setPaymentType('cash')}
                      activeOpacity={0.8}
                    >
                      <Banknote size={15} color={paymentType === 'cash' ? '#059669' : '#64748B'} />
                      <Text style={[styles.paymentBtnText, paymentType === 'cash' && styles.paymentBtnTextCashActive]}>
                        Cash ({channel === 'delivery' ? 'COD' : 'Counter'})
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.paymentBtn, paymentType === 'card' && styles.paymentBtnCardActive]}
                      onPress={() => setPaymentType('card')}
                      activeOpacity={0.8}
                    >
                      <CreditCard size={15} color={paymentType === 'card' ? '#2563EB' : '#64748B'} />
                      <Text style={[styles.paymentBtnText, paymentType === 'card' && styles.paymentBtnTextCardActive]}>
                        Card / Terminal
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity
                    style={styles.autoPrintRow}
                    onPress={() => setAutoPrint(!autoPrint)}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.checkbox, autoPrint && styles.checkboxActive]}>
                      {autoPrint && <Check size={12} color="#FFFFFF" />}
                    </View>
                    <Printer size={15} color="#64748B" />
                    <Text style={styles.autoPrintText}>Auto-print kitchen & customer receipt</Text>
                  </TouchableOpacity>
                </View>

                {/* Error Banner */}
                {Boolean(errorMsg) ? (
                  <View style={styles.errorBox}>
                    <Text style={styles.errorText}>{errorMsg}</Text>
                  </View>
                ) : null}
              </ScrollView>

              {/* Total Summary & Confirm Button */}
              <View style={[styles.footerCheckout, !isTablet && { paddingBottom: Math.max(insets.bottom, 12) + 6 }]}>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Total Due</Text>
                  <Text style={styles.summaryValue}>£{subtotal.toFixed(2)}</Text>
                </View>

                <TouchableOpacity
                  style={[styles.submitOrderBtn, (submitting || cartEntries.length === 0) && styles.submitBtnDisabled]}
                  onPress={handleSubmit}
                  disabled={submitting || cartEntries.length === 0}
                  activeOpacity={0.85}
                >
                  {submitting ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Sparkles size={16} color="#FFFFFF" />
                      <Text style={styles.submitOrderBtnText}>
                        Place & Dispatch Order (£{subtotal.toFixed(2)})
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>

        {/* Item Customization Sub-Modal */}
        {customizingItem ? (
          <Modal
            visible={!!customizingItem}
            animationType="fade"
            transparent={true}
            onRequestClose={() => setCustomizingItem(null)}
          >
            <View style={styles.customModalOverlay}>
              <TouchableOpacity
                style={styles.customModalBackdrop}
                activeOpacity={1}
                onPress={() => setCustomizingItem(null)}
              />
              <View style={[styles.customModalContainer, isTablet && styles.customModalContainerTablet]}>
                {/* Custom Modal Header */}
                <View style={styles.customModalHeader}>
                  <View style={styles.customHeaderTitleWrap}>
                    <Text style={styles.customModalTitle} numberOfLines={1}>
                      {customizingItem.name || customizingItem.itemName}
                    </Text>
                    <Text style={styles.customModalBasePrice}>
                      Base: £{getItemBasePrice(customizingItem, channel).toFixed(2)}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.customCloseBtn}
                    onPress={() => setCustomizingItem(null)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <X size={18} color="#64748B" />
                  </TouchableOpacity>
                </View>

                {/* Custom Error Banner if compulsory not selected */}
                {customError ? (
                  <View style={styles.customErrorBanner}>
                    <Text style={styles.customErrorText}>{customError}</Text>
                  </View>
                ) : null}

                {/* Scrollable Groups */}
                <ScrollView
                  style={styles.customScroll}
                  contentContainerStyle={styles.customScrollContent}
                  showsVerticalScrollIndicator={true}
                >
                  {/* Weight Variants if multiple */}
                  {Array.isArray(customizingItem.weightVariants) && customizingItem.weightVariants.length > 1 ? (
                    <View style={styles.customGroupSection}>
                      <View style={styles.customGroupHeader}>
                        <Text style={styles.customGroupTitle}>Choose Portion / Size</Text>
                        <Text style={styles.customGroupRequiredBadge}>Required</Text>
                      </View>
                      <View style={styles.customOptionsList}>
                        {customizingItem.weightVariants.map((wv: any, idx: number) => {
                          const isSelected =
                            (customSelectedWeightVariant && (
                              customSelectedWeightVariant.variantId === wv.variantId ||
                              customSelectedWeightVariant.variantName === wv.variantName
                            )) ||
                            (!customSelectedWeightVariant && idx === 0);

                          const wvPrice = Number(wv.price || 0);

                          return (
                            <TouchableOpacity
                              key={wv.variantId || idx}
                              style={[
                                styles.customOptionRow,
                                isSelected && styles.customOptionRowSelected,
                              ]}
                              onPress={() => {
                                setCustomSelectedWeightVariant(wv);
                                if (customError) setCustomError(null);
                              }}
                              activeOpacity={0.7}
                            >
                              <View style={styles.customOptionRadio}>
                                {isSelected ? <View style={styles.customOptionRadioInner} /> : null}
                              </View>
                              <View style={styles.customOptionInfo}>
                                <Text style={[styles.customOptionName, isSelected && styles.customOptionNameSelected]}>
                                  {wv.variantName || `${wv.weight} ${wv.unit}`}
                                </Text>
                                {wv.weight ? (
                                  <Text style={styles.customOptionSub}>
                                    {wv.weight} {wv.unit}
                                  </Text>
                                ) : null}
                              </View>
                              <Text style={[styles.customOptionPrice, isSelected && styles.customOptionPriceSelected]}>
                                £{wvPrice.toFixed(2)}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  ) : null}

                  {/* Variant Groups (Single Select per group) */}
                  {Array.isArray(customizingItem.variantGroups) && customizingItem.variantGroups.length > 0 ? (
                    customizingItem.variantGroups.map((vg: any) => {
                      const selectedVariantId = customSelectedVariants[vg.groupId];

                      return (
                        <View key={vg.groupId} style={styles.customGroupSection}>
                          <View style={styles.customGroupHeader}>
                            <Text style={styles.customGroupTitle}>{vg.groupTitle}</Text>
                            <Text style={styles.customGroupRequiredBadge}>Select 1</Text>
                          </View>
                          <View style={styles.customOptionsList}>
                            {Array.isArray(vg.variants) &&
                              vg.variants.map((v: any) => {
                                const isSelected = selectedVariantId === v.variantId;
                                const addPrice = Number(v.additionalPrice || 0);

                                return (
                                  <TouchableOpacity
                                    key={v.variantId}
                                    style={[
                                      styles.customOptionRow,
                                      isSelected && styles.customOptionRowSelected,
                                    ]}
                                    onPress={() => {
                                      setCustomSelectedVariants((prev) => ({
                                        ...prev,
                                        [vg.groupId]: v.variantId,
                                      }));
                                      if (customError) setCustomError(null);
                                    }}
                                    activeOpacity={0.7}
                                  >
                                    <View style={styles.customOptionRadio}>
                                      {isSelected ? <View style={styles.customOptionRadioInner} /> : null}
                                    </View>
                                    <Text style={[styles.customOptionName, isSelected && styles.customOptionNameSelected]}>
                                      {v.variantName}
                                    </Text>
                                    <Text style={[styles.customOptionPrice, isSelected && styles.customOptionPriceSelected]}>
                                      {addPrice > 0 ? `+£${addPrice.toFixed(2)}` : 'Free'}
                                    </Text>
                                  </TouchableOpacity>
                                );
                              })}
                          </View>
                        </View>
                      );
                    })
                  ) : null}

                  {/* Addon Groups (Multi Select) */}
                  {Array.isArray(customizingItem.addonGroups) && customizingItem.addonGroups.length > 0 ? (
                    customizingItem.addonGroups.map((ag: any) => {
                      const selectedIds = customSelectedAddons[ag.groupId] || [];
                      const isCompulsory =
                        ag.customizationBehavior === 'compulsory' || Boolean(ag.minSelection && ag.minSelection > 0);
                      const min = ag.minSelection ? Math.max(ag.minSelection, 1) : (isCompulsory ? 1 : 0);
                      const max = ag.maxSelection || 0;

                      return (
                        <View key={ag.groupId} style={styles.customGroupSection}>
                          <View style={styles.customGroupHeader}>
                            <View>
                              <Text style={styles.customGroupTitle}>{ag.groupTitle}</Text>
                              <Text style={styles.customGroupSub}>
                                {isCompulsory
                                  ? `Required (min ${min}${max ? `, max ${max}` : ''})`
                                  : max
                                  ? `Optional (max ${max})`
                                  : 'Optional (choose any)'}
                              </Text>
                            </View>
                            {isCompulsory ? (
                              <Text style={styles.customGroupCompulsoryBadge}>Required</Text>
                            ) : null}
                          </View>
                          <View style={styles.customOptionsList}>
                            {Array.isArray(ag.addons) &&
                              ag.addons.map((addon: any) => {
                                const isSelected = selectedIds.includes(addon.addonId);
                                const addPrice = Number(addon.price || 0);

                                return (
                                  <TouchableOpacity
                                    key={addon.addonId}
                                    style={[
                                      styles.customOptionRow,
                                      isSelected && styles.customOptionRowSelected,
                                    ]}
                                    onPress={() => {
                                      toggleCustomAddon(ag, addon.addonId);
                                      if (customError) setCustomError(null);
                                    }}
                                    activeOpacity={0.7}
                                  >
                                    <View style={[styles.customOptionCheckbox, isSelected && styles.customOptionCheckboxSelected]}>
                                      {isSelected ? <Check size={12} color="#FFFFFF" strokeWidth={3} /> : null}
                                    </View>
                                    <Text style={[styles.customOptionName, isSelected && styles.customOptionNameSelected]}>
                                      {addon.optionTitle}
                                    </Text>
                                    <Text style={[styles.customOptionPrice, isSelected && styles.customOptionPriceSelected]}>
                                      {addPrice > 0 ? `+£${addPrice.toFixed(2)}` : 'Free'}
                                    </Text>
                                  </TouchableOpacity>
                                );
                              })}
                          </View>
                        </View>
                      );
                    })
                  ) : null}

                  {/* Special Instructions for Dish */}
                  <View style={styles.customGroupSection}>
                    <Text style={styles.customGroupTitle}>Item Instructions (Optional)</Text>
                    <TextInput
                      style={styles.customInstructionsInput}
                      placeholder="e.g. Extra spicy, sauce on the side..."
                      placeholderTextColor="#94A3B8"
                      value={customInstructions}
                      onChangeText={setCustomInstructions}
                    />
                  </View>
                </ScrollView>

                {/* Custom Modal Footer */}
                <View style={styles.customModalFooter}>
                  <View style={styles.customQtyRow}>
                    <TouchableOpacity
                      style={styles.customQtyBtn}
                      onPress={() => setCustomQuantity((q) => Math.max(1, q - 1))}
                      activeOpacity={0.7}
                    >
                      <Minus size={15} color="#475569" />
                    </TouchableOpacity>
                    <Text style={styles.customQtyText}>{customQuantity}</Text>
                    <TouchableOpacity
                      style={styles.customQtyBtn}
                      onPress={() => setCustomQuantity((q) => q + 1)}
                      activeOpacity={0.7}
                    >
                      <Plus size={15} color="#475569" />
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity
                    style={styles.customAddBtn}
                    onPress={handleConfirmCustomization}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.customAddBtnText}>
                      Add to Ticket • £{(customUnitPrice * customQuantity).toFixed(2)}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        ) : null}
    </SafeAreaView>
  </Modal>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  fullScreenContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    backgroundColor: '#FFFFFF',
  },
  modalHeaderTablet: {
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  headerLeftGroup: {
    flex: 1,
    marginRight: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  modalTitleTablet: {
    fontSize: 19,
  },
  quickLiveBadge: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  quickLiveBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#059669',
  },
  modalSub: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '500',
  },
  headerRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerClearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  headerClearIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  headerClearText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#EF4444',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modalBody: {
    flex: 1,
  },
  modalBodyTablet: {
    flexDirection: 'row',
  },
  leftColumn: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 4,
    borderBottomWidth: 0,
    backgroundColor: '#FFFFFF',
  },
  leftColumnTablet: {
    flex: 1.35,
    padding: 18,
    borderRightWidth: 1,
    borderRightColor: '#E2E8F0',
    borderBottomWidth: 0,
  },
  channelRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  channelChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  channelChipDineInActive: {
    backgroundColor: '#F5F3FF',
    borderColor: '#DDD6FE',
  },
  channelChipTakeawayActive: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FED7AA',
  },
  channelChipDeliveryActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  channelChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  channelChipTextDineInActive: {
    color: '#7C3AED',
  },
  channelChipTextTakeawayActive: {
    color: '#EA580C',
  },
  channelChipTextDeliveryActive: {
    color: '#2563EB',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 10,
    marginBottom: 10,
    height: 40,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 12.5,
    color: '#0F172A',
    fontWeight: '500',
  },
  categoryScroll: {
    flexGrow: 0,
    marginBottom: 10,
  },
  catChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    marginRight: 6,
  },
  catChipActive: {
    backgroundColor: '#0F172A',
  },
  catChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  catChipTextActive: {
    color: '#FFFFFF',
  },
  itemsScrollView: {
    flex: 1,
  },
  itemsScrollContent: {
    paddingBottom: 24,
  },
  itemsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  itemCard: {
    flexBasis: '48.5%',
    flexGrow: 1,
    maxWidth: '49%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
  },
  itemCardWide: {
    flexBasis: '31.5%',
    maxWidth: '32.5%',
  },
  itemCardSelected: {
    borderColor: '#FF5C39',
    backgroundColor: '#FFF9F7',
  },
  itemContent: {
    flex: 1,
    marginRight: 6,
  },
  itemTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
  },
  itemPriceText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#059669',
    marginTop: 2,
  },
  itemAddIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFF0EC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemQtyBadge: {
    backgroundColor: '#FF5C39',
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemQtyBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  menuLoadingBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 8,
  },
  menuLoadingText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  emptyItemsBox: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyItemsText: {
    fontSize: 12.5,
    color: '#94A3B8',
    fontWeight: '600',
  },
  rightColumn: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    justifyContent: 'space-between',
  },
  rightColumnTablet: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    maxHeight: '100%',
  },
  formSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    marginBottom: 10,
    marginHorizontal: 16,
    marginTop: 12,
  },
  formSectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 8,
  },
  fieldRow: {
    flexDirection: 'row',
    gap: 8,
  },
  inputField: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 12,
    color: '#0F172A',
  },
  cartSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    marginBottom: 10,
    marginHorizontal: 16,
  },
  cartHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cartHeaderTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  clearCartText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#EF4444',
  },
  emptyCartBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCartText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  emptyCartSub: {
    fontSize: 10.5,
    color: '#94A3B8',
    marginTop: 2,
  },
  cartList: {
    gap: 6,
  },
  cartItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  cartItemInfo: {
    flex: 1,
    marginRight: 8,
  },
  cartItemName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
  },
  cartItemPrice: {
    fontSize: 11,
    fontWeight: '800',
    color: '#059669',
    marginTop: 1,
  },
  qtyControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  qtyBtn: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyNumber: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
    minWidth: 18,
    textAlign: 'center',
  },
  deleteBtn: {
    padding: 5,
    marginLeft: 2,
  },
  paymentSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    marginBottom: 10,
    marginHorizontal: 16,
  },
  paymentRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  paymentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  paymentBtnCashActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  paymentBtnCardActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  paymentBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  paymentBtnTextCashActive: {
    color: '#059669',
  },
  paymentBtnTextCardActive: {
    color: '#2563EB',
  },
  autoPrintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  checkboxActive: {
    backgroundColor: '#FF5C39',
    borderColor: '#FF5C39',
  },
  autoPrintText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#475569',
  },
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    marginHorizontal: 16,
  },
  errorText: {
    fontSize: 11.5,
    color: '#DC2626',
    fontWeight: '600',
  },
  footerCheckout: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  summaryLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#059669',
  },
  submitOrderBtn: {
    backgroundColor: '#FF5C39',
    borderRadius: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#FF5C39',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  submitBtnDisabled: {
    backgroundColor: '#CBD5E1',
    shadowOpacity: 0,
    elevation: 0,
  },
  submitOrderBtnText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '800',
  },
  // Mobile Specific Bar & Tab Styles
  mobileSegmentBar: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    padding: 3,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
    borderRadius: 12,
    gap: 4,
  },
  mobileSegmentTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 10,
  },
  mobileSegmentTabActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  mobileSegmentText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  mobileSegmentTextActive: {
    color: '#FF5C39',
  },
  mobileTabBadge: {
    backgroundColor: '#FF5C39',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  mobileTabBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  mobileFloatingBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingHorizontal: 16,
    paddingTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 8,
  },
  mobileFloatingInfo: {
    flex: 1,
  },
  mobileFloatingCount: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#64748B',
  },
  mobileFloatingTotal: {
    fontSize: 18,
    fontWeight: '800',
    color: '#059669',
    letterSpacing: -0.3,
    marginTop: 1,
  },
  mobileViewCartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FF5C39',
    paddingVertical: 11,
    paddingHorizontal: 18,
    borderRadius: 12,
    shadowColor: '#FF5C39',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  mobileViewCartBtnDisabled: {
    backgroundColor: '#CBD5E1',
    shadowOpacity: 0,
    elevation: 0,
  },
  mobileViewCartBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '800',
  },
  mobileBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: '#FFF0EC',
    borderRadius: 10,
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 4,
  },
  mobileBackBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FF5C39',
  },

  itemTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  customBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  customBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#2563EB',
    textTransform: 'uppercase',
  },
  cartItemOptionsList: {
    marginTop: 2,
    marginBottom: 2,
    gap: 1,
  },
  cartItemOptionPill: {
    fontSize: 10.5,
    color: '#64748B',
    fontWeight: '600',
    lineHeight: 14,
  },
  cartItemInstructions: {
    fontSize: 10,
    fontStyle: 'italic',
    color: '#D97706',
    marginTop: 1,
  },
  // Customization sub-modal styles
  customModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    padding: 16,
  },
  customModalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  customModalContainer: {
    width: '100%',
    maxHeight: '85%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  customModalContainerTablet: {
    maxWidth: 560,
  },
  customModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    backgroundColor: '#FFFFFF',
  },
  customHeaderTitleWrap: {
    flex: 1,
    marginRight: 12,
  },
  customModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  customModalBasePrice: {
    fontSize: 12,
    fontWeight: '700',
    color: '#059669',
    marginTop: 2,
  },
  customCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  customErrorBanner: {
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#FECACA',
  },
  customErrorText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#EF4444',
  },
  customScroll: {
    flexGrow: 0,
  },
  customScrollContent: {
    padding: 16,
    gap: 16,
  },
  customGroupSection: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  customGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  customGroupTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1E293B',
  },
  customGroupSub: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 1,
    fontWeight: '500',
  },
  customGroupRequiredBadge: {
    fontSize: 10,
    fontWeight: '700',
    color: '#7C3AED',
    backgroundColor: '#F5F3FF',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#DDD6FE',
  },
  customGroupCompulsoryBadge: {
    fontSize: 10,
    fontWeight: '700',
    color: '#DC2626',
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  customOptionsList: {
    gap: 8,
  },
  customOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  customOptionRowSelected: {
    borderColor: '#FF5C39',
    backgroundColor: '#FFF9F7',
  },
  customOptionRadio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  customOptionRadioInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF5C39',
  },
  customOptionCheckbox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  customOptionCheckboxSelected: {
    backgroundColor: '#FF5C39',
    borderColor: '#FF5C39',
  },
  customOptionInfo: {
    flex: 1,
  },
  customOptionName: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '600',
    color: '#1E293B',
  },
  customOptionNameSelected: {
    color: '#0F172A',
    fontWeight: '700',
  },
  customOptionSub: {
    fontSize: 10.5,
    color: '#64748B',
  },
  customOptionPrice: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  customOptionPriceSelected: {
    color: '#059669',
    fontWeight: '800',
  },
  customInstructionsInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 12,
    color: '#0F172A',
    marginTop: 8,
  },
  customModalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    backgroundColor: '#FFFFFF',
  },
  customQtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  customQtyBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  customQtyText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    minWidth: 20,
    textAlign: 'center',
  },
  customAddBtn: {
    flex: 1,
    backgroundColor: '#FF5C39',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FF5C39',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  customAddBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
});

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
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import {
  X,
  Plus,
  Minus,
  Trash2,
  UtensilsCrossed,
  ShoppingBag,
  Search,
  Check,
  Printer,
  CreditCard,
  Banknote,
  ArrowRight,
  ArrowLeft,
  ShoppingCart,
  Hash,
  User,
  Phone,
  MessageSquare,
  LogOut,
  Bike,
  MapPin,
} from 'lucide-react-native';
import { Image } from 'expo-image';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useNow } from '../utils/order-timing';
import { DietMark as SharedDietMark } from './DietMark';
import { locationService, type AddressMatch } from '../services/location.service';
import { ConfirmModal } from './ConfirmModal';
import { Colors } from '../constants/colors';
import { resolveMediaImageSource } from '../services/image.helper';
import { menuService } from '../services/menu.service';
import { orderService } from '../services/order.service';
import { printThermalReceipt } from '../services/thermal-print.service';
import { MenuItem } from '../types';
import { useAuth } from '../context/AuthContext';
import { getCachedStoreProfile, setCachedStoreProfile, getItemOptionsList } from '../services/receipt-customization.service';
import { restaurantOwnerService } from '../services/restaurant-owner.service';
import { restaurantService } from '../services/restaurant.service';
import { KEYBOARD_BEHAVIOR } from '../utils/keyboard';


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

export type PosChannel = 'dine_in' | 'takeaway' | 'delivery';

interface CreateOrderModalProps {
  visible: boolean;
  onClose: () => void;
  onOrderCreated: () => void;
  /** In-store order types only — delivery orders are not created from the POS. */
  initialChannel?: PosChannel;
  restaurantId?: string;
  restaurantName?: string;
  restaurantPhone?: string;
}

const OTHER_CATEGORY = 'Other';
const KEEP_AWAKE_TAG = 'pos-terminal';

function PosClock() {
  const now = new Date(useNow());
  const text = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return <Text style={styles.posClock}>{text}</Text>;
}

/** Food-type mark colour: veg green, non-veg red, egg yellow (null when not set). */
function getDietColor(item: any): string | null {
  const diet = String(item?.itemType || '').toLowerCase().replace('-', '_');
  if (diet === 'veg') return '#16A34A';
  if (diet === 'non_veg') return '#DC2626';
  if (diet === 'egg') return '#EAB308';
  return null;
}

const DIET_LABEL: Record<string, string> = { '#16A34A': 'Veg', '#DC2626': 'Non-veg', '#EAB308': 'Contains egg' };

/** Food-type mark (shared component) from the colour used across the POS. */
function DietMark({ color, size = 14 }: { color: string; size?: number }) {
  const type = color === '#DC2626' ? 'non-veg' : color === '#EAB308' ? 'egg' : 'veg';
  return <SharedDietMark type={type} size={size} />;
}

/** All category names for a menu item. Items can belong to several categories. */
function getItemCategoryNames(item: any): string[] {
  const names: string[] = [];
  if (Array.isArray(item?.categories)) {
    item.categories.forEach((c: any) => {
      const n = typeof c === 'string' ? c : c?.categoryName || c?.name;
      if (n && typeof n === 'string' && n.trim()) names.push(n.trim());
    });
  }
  if (names.length === 0) {
    const raw: any = item?.category || item?.categoryId;
    const n = typeof raw === 'object' ? raw?.categoryName || raw?.name : raw;
    // A bare ObjectId string is not a readable name.
    if (n && typeof n === 'string' && n.trim() && !/^[a-f0-9]{24}$/i.test(n.trim())) names.push(n.trim());
  }
  return names.length ? Array.from(new Set(names)) : [OTHER_CATEGORY];
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
  const isTablet = windowWidth >= 768;
  const isWideTablet = windowWidth >= 1024;

  const [mobileTab, setMobileTab] = useState<'menu' | 'cart'>('menu');
  const [channel, setChannel] = useState<PosChannel>(initialChannel);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [tableNumber, setTableNumber] = useState('');
  // Delivery details (POS delivery orders)
  const [addressQuery, setAddressQuery] = useState('');
  const [addressResults, setAddressResults] = useState<AddressMatch[]>([]);
  const [addressSearching, setAddressSearching] = useState(false);
  const [addressSearchError, setAddressSearchError] = useState<string | null>(null);
  const [deliveryAddress, setDeliveryAddress] = useState<AddressMatch | null>(null);
  const [doorNumber, setDoorNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [showNotes, setShowNotes] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showPlaceConfirm, setShowPlaceConfirm] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [banner, setBanner] = useState<{ text: string; tone: 'info' | 'success' } | null>(null);
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
      setNotes('');
      setSearchQuery('');
      setCustomizingItem(null);
      setCustomError(null);
    }
  }, [visible, initialChannel]);

  // Full-screen POS mode: keep the screen on while it's open.
  useEffect(() => {
    if (!visible) return;
    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    return () => {
      deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    };
  }, [visible]);

  // Short-lived banner under the top bar (app toasts render beneath this full-screen modal).
  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 3500);
    return () => clearTimeout(t);
  }, [banner]);

  const exitHint = () => setBanner({ text: 'Press and hold “Exit” to leave the POS.', tone: 'info' });

  // Closing the confirm dialog and the full-screen POS window in the same instant can leave a
  // blank window over the app (React Native can't dismiss a modal and its parent together).
  // So close the dialog first, then leave the POS once its fade-out has finished.
  const exitTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
  }, []);
  const discardAndExit = () => {
    setShowExitConfirm(false);
    setCart({});
    if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    exitTimerRef.current = setTimeout(() => {
      exitTimerRef.current = null;
      onClose();
    }, 350);
  };

  const requestExit = () => {
    if (Object.keys(cart).length > 0) setShowExitConfirm(true);
    else onClose();
  };

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

  // Categories list (same source as the Menu tab: `categories[].categoryName`, with older fallbacks)
  const categories = useMemo(() => {
    const set = new Set<string>();
    menuItems.forEach((item) => getItemCategoryNames(item).forEach((c) => set.add(c)));
    const names = Array.from(set);
    // Keep "Other" (uncategorised) last.
    names.sort((a, b) => (a === OTHER_CATEGORY ? 1 : b === OTHER_CATEGORY ? -1 : 0));
    return ['all', ...names];
  }, [menuItems]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: menuItems.length };
    menuItems.forEach((item) => getItemCategoryNames(item).forEach((c) => (counts[c] = (counts[c] || 0) + 1)));
    return counts;
  }, [menuItems]);

  // Filtered menu items
  const filteredItems = useMemo(() => {
    return menuItems.filter((item) => {
      const name = (item.name || item.itemName || '').toLowerCase();
      const matchSearch = !searchQuery || name.includes(searchQuery.toLowerCase().trim());
      const matchCat = selectedCategory === 'all' || getItemCategoryNames(item).includes(selectedCategory);
      return matchSearch && matchCat;
    });
  }, [menuItems, searchQuery, selectedCategory]);

  // Delivery uses the item's normal (online) price; collection / eat-in prices only apply in store.
  const getItemBasePrice = (item: MenuItem, channelType: PosChannel): number => {
    let p = Number(item.price ?? item.basePrice ?? 0);
    if (channelType === 'takeaway' && item.collectionPrice != null && !isNaN(Number(item.collectionPrice))) {
      p = Number(item.collectionPrice);
    } else if (channelType === 'dine_in' && item.eatInPrice != null && !isNaN(Number(item.eatInPrice))) {
      p = Number(item.eatInPrice);
    }
    return p;
  };

  /** Unit price of a cart line for a channel (same rules as when the item was added). */
  const priceCartEntry = (e: CartEntry, ch: PosChannel): number => {
    let base = getItemBasePrice(e.item, ch);
    const wv: any = e.selectedWeightVariant;
    if (wv) {
      if (ch === 'takeaway' && wv.collectionPrice != null && !isNaN(Number(wv.collectionPrice))) base = Number(wv.collectionPrice);
      else if (ch === 'dine_in' && wv.eatInPrice != null && !isNaN(Number(wv.eatInPrice))) base = Number(wv.eatInPrice);
      else base = Number(wv.price || 0);
    }
    const variantsAdd = (e.selectedVariants || []).reduce((sum, v) => sum + Number(v.additionalPrice || 0), 0);
    const addonsAdd = (e.selectedAddons || []).reduce((sum, a) => sum + Number(a.price || 0), 0);
    let total = base + variantsAdd + addonsAdd;
    if (e.item.discountPercentage && e.item.discountPercentage > 0) total = total * (1 - e.item.discountPercentage / 100);
    return Math.max(0, total);
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
      if (channel === 'takeaway' && customSelectedWeightVariant.collectionPrice != null && !isNaN(Number(customSelectedWeightVariant.collectionPrice))) {
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

  // Address lookup (debounced) while typing a delivery address
  useEffect(() => {
    if (channel !== 'delivery' || deliveryAddress) return;
    const q = addressQuery.trim();
    if (q.length < 3) {
      setAddressResults([]);
      setAddressSearchError(null);
      return;
    }
    let cancelled = false;
    setAddressSearching(true);
    const t = setTimeout(() => {
      locationService
        .searchAddress(q)
        .then((res) => {
          if (cancelled) return;
          setAddressResults(res.data);
          setAddressSearchError(res.success ? (res.data.length ? null : 'No matching address. Try the postcode.') : res.message || 'Address search failed.');
        })
        .catch(() => !cancelled && setAddressSearchError('Address search failed. Check the connection.'))
        .finally(() => !cancelled && setAddressSearching(false));
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [addressQuery, channel, deliveryAddress]);

  // Switching Dine-in / Takeaway / Delivery reprices what's already in the cart, so the total
  // shown matches what the server charges for that channel.
  useEffect(() => {
    setCart((prev) => {
      let changed = false;
      const next: typeof prev = {};
      for (const [key, e] of Object.entries(prev)) {
        const unitPrice = priceCartEntry(e, channel);
        if (Math.abs(unitPrice - e.unitPrice) > 0.0001) changed = true;
        next[key] = { ...e, unitPrice };
      }
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel]);

  const resetDeliveryDetails = () => {
    setAddressQuery('');
    setAddressResults([]);
    setAddressSearchError(null);
    setDeliveryAddress(null);
    setDoorNumber('');
  };

  /** What's missing before a delivery order can be placed (null = ready). */
  const getDeliveryError = (): string | null => {
    if (channel !== 'delivery') return null;
    if (!customerName.trim()) return 'Enter the customer’s name for the rider.';
    if (!customerPhone.trim()) return 'Enter the customer’s phone number so the rider can call.';
    if (!normalizeUKPhone(customerPhone.trim())) return 'Enter a valid UK phone number (e.g. 07123 456789).';
    if (!deliveryAddress) return 'Search and select the delivery address.';
    return null;
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

    const deliveryError = getDeliveryError();
    if (deliveryError) {
      setErrorMsg(deliveryError);
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
      // Use restaurant/store phone number as default (falls back to '7000000001' if restaurant phone not yet configured)
      finalPhone = resolvedStorePhone || '7000000001';
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      const orderPayload: any = {
        cartType: 'foodCart',
        orderType: channel,
        phoneNumber: finalPhone,
        customerName: customerName.trim() || (channel === 'dine_in' ? `Table ${tableNumber || 'Guest'}` : 'Counter Customer'),
        ...(channel === 'delivery' && deliveryAddress
          ? {
              deliveryAddress: {
                fullAddress: [doorNumber.trim(), deliveryAddress.label].filter(Boolean).join(', '),
                addressLine1: [doorNumber.trim(), deliveryAddress.line1].filter(Boolean).join(', '),
                city: deliveryAddress.city || '',
                postalCode: deliveryAddress.postalCode || '',
                landmark: '',
                coordinates: { type: 'Point', coordinates: [deliveryAddress.lon, deliveryAddress.lat] },
              },
            }
          : {}),
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
        // Full-screen POS: stay open and get ready for the next order.
        setCart({});
        setCustomerName('');
        setCustomerPhone('');
        setTableNumber('');
        resetDeliveryDetails();
        setNotes('');
        setShowNotes(false);
        setMobileTab('menu');
        const placedTotal = Number(res.data?.pricing?.totalAmount);
        setBanner({
          text: `${channel === 'delivery' ? 'Delivery order' : 'Order'} ${res.data?.orderNumber ? `#${res.data.orderNumber} ` : ''}placed${
            channel === 'delivery' && Number.isFinite(placedTotal) ? ` · £${placedTotal.toFixed(2)} incl. delivery` : ''
          }${autoPrint ? ' · printing receipt' : ''}.`,
          tone: 'success',
        });
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
      onRequestClose={exitHint}
    >
      {/* Own provider: a Modal is a separate native window, so it must measure its own safe areas
          (otherwise the top inset can come through as 0 and content slides under the status bar). */}
      <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom', 'left', 'right']}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
        <KeyboardAvoidingView
          style={styles.fullScreenContainer}
          behavior={KEYBOARD_BEHAVIOR}
        >
          {/* Top bar — full-screen POS mode (exit is press-and-hold, like Kitchen Mode) */}
          <View style={styles.posTopBar}>
            <View style={styles.posBrand}>
              <View style={styles.posBrandIcon}>
                <ShoppingCart size={20} color="#FF5C39" />
              </View>
              <View style={styles.posBrandTextCol}>
                <View style={styles.posBrandRow}>
                  <Text style={styles.posBrandText}>POS</Text>
                  <View style={styles.posLive}>
                    <View style={styles.posLiveDot} />
                    <Text style={styles.posLiveText}>LIVE</Text>
                  </View>
                </View>
                {restaurantName ? (
                  <Text style={styles.posSub} numberOfLines={1}>{restaurantName}</Text>
                ) : null}
              </View>
              <PosClock />
            </View>

            <View style={styles.posControls}>
              {cartEntries.length > 0 && (
                <TouchableOpacity
                  onPress={() => setShowClearConfirm(true)}
                  style={styles.posClearBtn}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Clear order"
                >
                  <Trash2 size={18} color="#DC2626" />
                  {isTablet && <Text style={styles.posClearText}>Clear order</Text>}
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={exitHint}
                onLongPress={requestExit}
                delayLongPress={700}
                style={styles.posExitBtn}
                activeOpacity={0.6}
                accessibilityRole="button"
                accessibilityLabel="Exit POS"
                accessibilityHint="Press and hold to exit"
              >
                <LogOut size={18} color="#0F172A" />
                {isTablet && <Text style={styles.posExitText}>Hold to exit</Text>}
              </TouchableOpacity>
            </View>
          </View>

          {banner ? (
            <View style={[styles.posBanner, banner.tone === 'success' ? styles.posBannerSuccess : styles.posBannerInfo]}>
              {banner.tone === 'success' ? <Check size={16} color="#047857" strokeWidth={3} /> : null}
              <Text style={[styles.posBannerText, { color: banner.tone === 'success' ? '#065F46' : '#1E3A8A' }]}>{banner.text}</Text>
            </View>
          ) : null}

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
            {/* Category rail (tablet / POS): single column on the far left */}
            {isTablet && categories.length > 1 && (
              <View style={[styles.categoryRail, isWideTablet && styles.categoryRailWide]}>
                <ScrollView contentContainerStyle={styles.categoryRailContent} showsVerticalScrollIndicator={false}>
                  {categories.map((cat) => {
                    const active = selectedCategory === cat;
                    return (
                      <TouchableOpacity
                        key={cat}
                        style={[styles.railTile, active && styles.railTileActive]}
                        onPress={() => setSelectedCategory(cat)}
                        activeOpacity={0.8}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: active }}
                        accessibilityLabel={`${cat === 'all' ? 'All dishes' : cat}, ${categoryCounts[cat] || 0} items`}
                      >
                        <Text style={styles.railTileText} numberOfLines={2}>
                          {cat === 'all' ? 'All Dishes' : cat}
                        </Text>
                        <Text style={[styles.railTileCount, active && styles.railTileCountActive]}>
                          {categoryCounts[cat] || 0}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}

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
                    <Bike size={14} color={channel === 'delivery' ? '#1D4ED8' : '#64748B'} />
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
              {!isTablet && categories.length > 1 && (
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

              {isTablet && categories.length > 1 && (
                <View style={styles.categoryHeading}>
                  <Text style={styles.categoryHeadingText} numberOfLines={1}>
                    {selectedCategory === 'all' ? 'All Dishes' : selectedCategory}
                  </Text>
                  <Text style={styles.categoryHeadingCount}>
                    {filteredItems.length} {filteredItems.length === 1 ? 'item' : 'items'}
                  </Text>
                </View>
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
                    !isTablet && { paddingBottom: 92 },
                  ]}
                  showsVerticalScrollIndicator={true}
                >
                  <View style={styles.itemsGrid}>
                    {filteredItems.map((item) => {
                      const id = item._id || (item as any).id;
                      const cartCount = getItemCartCount(id);
                      const price = getItemBasePrice(item, channel);
                      const isCustomizable = hasCustomizations(item);
                      const imageSource = resolveMediaImageSource((item as any).displayImageUrl || (item as any).displayImage || (item as any).imageUrl);
                      const dietColor = getDietColor(item);

                      return (
                        <TouchableOpacity
                          key={id}
                          style={[
                            styles.itemCard,
                            isWideTablet && styles.itemCardWide,
                            cartCount > 0 && styles.itemCardSelected,
                          ]}
                          onPress={() => handleItemPress(item)}
                          activeOpacity={0.8}
                          accessibilityRole="button"
                          accessibilityLabel={`Add ${item.name || item.itemName}, £${price.toFixed(2)}${cartCount > 0 ? `, ${cartCount} in order` : ''}`}
                        >
                          {/* Dish photo */}
                          <View style={[styles.itemImageBox, isTablet && styles.itemImageBoxTablet]}>
                            {imageSource ? (
                              <Image
                                source={imageSource}
                                style={styles.itemImage}
                                contentFit="cover"
                                transition={150}
                                cachePolicy="memory-disk"
                                recyclingKey={id}
                              />
                            ) : (
                              <View style={styles.itemImagePlaceholder}>
                                <UtensilsCrossed size={isTablet ? 28 : 22} color="#CBD5E1" />
                              </View>
                            )}

                            {dietColor ? (
                              <View style={styles.itemDietBadge}>
                                <DietMark color={dietColor} size={14} />
                              </View>
                            ) : null}

                            {cartCount > 0 ? (
                              <View style={styles.itemQtyBadge}>
                                <Text style={styles.itemQtyBadgeText}>{cartCount}</Text>
                              </View>
                            ) : null}

                            {isCustomizable ? (
                              <View style={styles.customBadge}>
                                <Text style={styles.customBadgeText}>Options</Text>
                              </View>
                            ) : null}
                          </View>

                          {/* Name + price */}
                          <View style={styles.itemContent}>
                            <Text style={[styles.itemTitle, isTablet && styles.itemTitleTablet]} numberOfLines={2}>
                              {item.name || item.itemName}
                            </Text>
                            <View style={styles.itemPriceRow}>
                              <Text style={[styles.itemPriceText, isTablet && styles.itemPriceTextTablet]}>£{price.toFixed(2)}</Text>
                              <View style={[styles.itemAddIcon, cartCount > 0 && styles.itemAddIconActive]}>
                                <Plus size={16} color={cartCount > 0 ? '#FFFFFF' : '#FF5C39'} strokeWidth={2.6} />
                              </View>
                            </View>
                          </View>
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
                    { paddingBottom: 16 },
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
              {/* ── Order header + details ─────────────────────────── */}
              <View style={styles.ctTop}>
                <View style={styles.ctTitleRow}>
                  <Text style={styles.ctTitle}>Current order</Text>
                  {totalItemCount > 0 && (
                    <View style={styles.ctCountBadge}>
                      <Text style={styles.ctCountText}>{totalItemCount}</Text>
                    </View>
                  )}
                  <View style={styles.ctFlex} />
                  <View
                    style={[
                      styles.ctChannelTag,
                      channel === 'dine_in' ? styles.ctChannelDineIn : channel === 'delivery' ? styles.ctChannelDelivery : styles.ctChannelTakeaway,
                    ]}
                  >
                    {channel === 'dine_in' ? (
                      <UtensilsCrossed size={13} color="#6D28D9" />
                    ) : channel === 'delivery' ? (
                      <Bike size={13} color="#1D4ED8" />
                    ) : (
                      <ShoppingBag size={13} color="#C2410C" />
                    )}
                    <Text style={[styles.ctChannelText, { color: channel === 'dine_in' ? '#6D28D9' : channel === 'delivery' ? '#1D4ED8' : '#C2410C' }]}>
                      {channel === 'dine_in' ? 'Dine-in' : channel === 'delivery' ? 'Delivery' : 'Takeaway'}
                    </Text>
                  </View>
                </View>

                <View style={styles.ctFieldRow}>
                  {channel === 'dine_in' ? (
                    <>
                      <View style={[styles.ctField, styles.ctFieldTable]}>
                        <Hash size={15} color="#94A3B8" />
                        <TextInput
                          style={styles.ctInput}
                          placeholder="Table"
                          placeholderTextColor="#94A3B8"
                          value={tableNumber}
                          onChangeText={setTableNumber}
                          autoCapitalize="characters"
                          accessibilityLabel="Table number"
                        />
                      </View>
                      <View style={[styles.ctField, styles.ctFlex]}>
                        <User size={15} color="#94A3B8" />
                        <TextInput
                          style={styles.ctInput}
                          placeholder="Guest name (optional)"
                          placeholderTextColor="#94A3B8"
                          value={customerName}
                          onChangeText={setCustomerName}
                          accessibilityLabel="Guest name"
                        />
                      </View>
                    </>
                  ) : (
                    <>
                      <View style={[styles.ctField, styles.ctFlex]}>
                        <User size={15} color="#94A3B8" />
                        <TextInput
                          style={styles.ctInput}
                          placeholder={channel === 'delivery' ? 'Customer name *' : 'Customer name'}
                          placeholderTextColor="#94A3B8"
                          value={customerName}
                          onChangeText={(t) => {
                            setCustomerName(t);
                            if (errorMsg) setErrorMsg(null);
                          }}
                          accessibilityLabel="Customer name"
                        />
                      </View>
                      <View style={[styles.ctField, styles.ctFlex]}>
                        <Phone size={15} color="#94A3B8" />
                        <TextInput
                          style={styles.ctInput}
                          placeholder={channel === 'delivery' ? 'Phone *' : 'Phone (optional)'}
                          placeholderTextColor="#94A3B8"
                          keyboardType="phone-pad"
                          value={customerPhone}
                          onChangeText={(t) => {
                            setCustomerPhone(t);
                            if (errorMsg) setErrorMsg(null);
                          }}
                          accessibilityLabel="Customer phone"
                        />
                      </View>
                    </>
                  )}
                </View>

                {channel === 'delivery' && (
                  <View style={styles.dlBox}>
                    {deliveryAddress ? (
                      <>
                        <View style={styles.dlChosen}>
                          <MapPin size={16} color="#1D4ED8" />
                          <View style={styles.ctFlex}>
                            <Text style={styles.dlChosenLine} numberOfLines={1}>{deliveryAddress.line1}</Text>
                            <Text style={styles.dlChosenSub} numberOfLines={1}>
                              {[deliveryAddress.city, deliveryAddress.postalCode].filter(Boolean).join(' · ') || deliveryAddress.label}
                            </Text>
                          </View>
                          <TouchableOpacity onPress={resetDeliveryDetails} style={styles.dlChange} accessibilityRole="button" accessibilityLabel="Change delivery address">
                            <Text style={styles.dlChangeText}>Change</Text>
                          </TouchableOpacity>
                        </View>
                        <View style={styles.ctField}>
                          <Hash size={15} color="#94A3B8" />
                          <TextInput
                            style={styles.ctInput}
                            placeholder="Flat / house no. (optional)"
                            placeholderTextColor="#94A3B8"
                            value={doorNumber}
                            onChangeText={setDoorNumber}
                            accessibilityLabel="Flat or house number"
                          />
                        </View>
                      </>
                    ) : (
                      <>
                        <View style={styles.ctField}>
                          <MapPin size={15} color="#94A3B8" />
                          <TextInput
                            style={styles.ctInput}
                            placeholder="Delivery address or postcode *"
                            placeholderTextColor="#94A3B8"
                            value={addressQuery}
                            onChangeText={(t) => {
                              setAddressQuery(t);
                              if (errorMsg) setErrorMsg(null);
                            }}
                            autoCorrect={false}
                            accessibilityLabel="Search delivery address"
                          />
                          {addressSearching ? <ActivityIndicator size="small" color="#1D4ED8" /> : null}
                        </View>
                        {addressResults.map((a) => (
                          <TouchableOpacity
                            key={a.placeId}
                            style={styles.dlResult}
                            onPress={() => {
                              setDeliveryAddress(a);
                              setAddressResults([]);
                              if (errorMsg) setErrorMsg(null);
                            }}
                            activeOpacity={0.7}
                            accessibilityRole="button"
                          >
                            <MapPin size={14} color="#64748B" />
                            <Text style={styles.dlResultText} numberOfLines={2}>{a.label}</Text>
                          </TouchableOpacity>
                        ))}
                        {addressSearchError && !addressSearching ? <Text style={styles.dlHint}>{addressSearchError}</Text> : null}
                        {!addressQuery.trim() ? <Text style={styles.dlHint}>Type a postcode or street, then pick the address.</Text> : null}
                      </>
                    )}
                  </View>
                )}

                {showNotes || notes ? (
                  <View style={[styles.ctField, styles.ctNoteField]}>
                    <MessageSquare size={15} color="#B45309" />
                    <TextInput
                      style={styles.ctInput}
                      placeholder="Kitchen instructions / allergy notes"
                      placeholderTextColor="#B4925A"
                      value={notes}
                      onChangeText={setNotes}
                      autoFocus={showNotes && !notes}
                      accessibilityLabel="Kitchen note"
                    />
                    {notes ? (
                      <TouchableOpacity onPress={() => { setNotes(''); setShowNotes(false); }} hitSlop={8} accessibilityLabel="Remove note">
                        <X size={15} color="#B45309" />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                ) : (
                  <TouchableOpacity style={styles.ctAddNote} onPress={() => setShowNotes(true)} activeOpacity={0.7}>
                    <Plus size={14} color="#FF5C39" />
                    <Text style={styles.ctAddNoteText}>Add kitchen note</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* ── Items ──────────────────────────────────────────── */}
              {cartEntries.length === 0 ? (
                <View style={styles.ctEmpty}>
                  <View style={styles.ctEmptyIcon}>
                    <ShoppingCart size={26} color="#94A3B8" />
                  </View>
                  <Text style={styles.ctEmptyTitle}>No items yet</Text>
                  <Text style={styles.ctEmptyText}>{isTablet ? 'Tap a dish on the left to add it.' : 'Go back to the menu to add dishes.'}</Text>
                </View>
              ) : (
                <ScrollView style={styles.ctItems} contentContainerStyle={styles.ctItemsContent} showsVerticalScrollIndicator={false}>
                  {cartEntries.map((entry, idx) => {
                    const options = getItemOptionsList(entry);
                    const lineTotal = entry.unitPrice * entry.quantity;
                    const name = entry.item.name || entry.item.itemName;
                    const entryDiet = getDietColor(entry.item);
                    return (
                      <View key={entry.cartKey} style={[styles.ctRow, idx > 0 && styles.ctRowDivider]}>
                        <View style={styles.ctRowTop}>
                          {entryDiet ? (
                            <View style={styles.ctDietWrap}>
                              <DietMark color={entryDiet} />
                            </View>
                          ) : null}
                          <Text style={styles.ctItemName} numberOfLines={2}>{name}</Text>
                          <Text style={styles.ctLineTotal}>£{lineTotal.toFixed(2)}</Text>
                        </View>

                        {options.length > 0 ? (
                          <Text style={styles.ctOptions} numberOfLines={3}>{options.join(' · ')}</Text>
                        ) : null}
                        {entry.instructions ? (
                          <Text style={styles.ctItemNote} numberOfLines={2}>“{entry.instructions}”</Text>
                        ) : null}

                        <View style={styles.ctRowBottom}>
                          <View style={styles.ctStepper}>
                            <TouchableOpacity
                              style={styles.ctStepBtn}
                              onPress={() => decrementCartItem(entry.cartKey)}
                              activeOpacity={0.7}
                              accessibilityRole="button"
                              accessibilityLabel={entry.quantity === 1 ? `Remove ${name}` : `Decrease ${name}`}
                            >
                              {entry.quantity === 1 ? <Trash2 size={16} color="#DC2626" /> : <Minus size={16} color="#0F172A" />}
                            </TouchableOpacity>
                            <Text style={styles.ctQty}>{entry.quantity}</Text>
                            <TouchableOpacity
                              style={styles.ctStepBtn}
                              onPress={() => incrementCartItem(entry.cartKey)}
                              activeOpacity={0.7}
                              accessibilityRole="button"
                              accessibilityLabel={`Increase ${name}`}
                            >
                              <Plus size={16} color="#0F172A" />
                            </TouchableOpacity>
                          </View>
                          <Text style={styles.ctEach}>£{entry.unitPrice.toFixed(2)} each</Text>
                        </View>
                      </View>
                    );
                  })}
                </ScrollView>
              )}

              {/* ── Checkout ───────────────────────────────────────── */}
              <View style={[styles.ctFooter, !isTablet && { paddingBottom: 18 }]}>
                <View style={styles.ctPaySegment} accessibilityRole="radiogroup" accessibilityLabel="Payment method">
                  {([
                    { key: 'cash', label: 'Cash', Icon: Banknote, color: '#047857' },
                    { key: 'card', label: 'Card', Icon: CreditCard, color: '#1D4ED8' },
                  ] as const).map(({ key, label, Icon, color }) => {
                    const active = paymentType === key;
                    return (
                      <TouchableOpacity
                        key={key}
                        style={[styles.ctPayBtn, active && styles.ctPayBtnActive]}
                        onPress={() => setPaymentType(key)}
                        activeOpacity={0.8}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: active }}
                      >
                        <Icon size={17} color={active ? color : '#64748B'} />
                        <Text style={[styles.ctPayText, active && { color, fontWeight: '800' }]}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <TouchableOpacity
                  style={styles.ctPrintRow}
                  onPress={() => setAutoPrint(!autoPrint)}
                  activeOpacity={0.8}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: autoPrint }}
                >
                  <Printer size={15} color="#64748B" />
                  <Text style={styles.ctPrintText}>Print kitchen & customer receipt</Text>
                  <View style={[styles.ctSwitch, autoPrint && styles.ctSwitchOn]}>
                    <View style={[styles.ctSwitchKnob, autoPrint && styles.ctSwitchKnobOn]} />
                  </View>
                </TouchableOpacity>

                {Boolean(errorMsg) ? (
                  <View style={styles.ctError}>
                    <Text style={styles.ctErrorText}>{errorMsg}</Text>
                  </View>
                ) : null}

                <View style={styles.ctTotalRow}>
                  <View>
                    <Text style={styles.ctTotalLabel}>Total</Text>
                    <Text style={styles.ctTotalSub}>
                      {totalItemCount} {totalItemCount === 1 ? 'item' : 'items'} · {paymentType === 'cash' ? 'Cash' : 'Card'}
                      {channel === 'delivery' ? ' · + delivery fee' : ''}
                    </Text>
                  </View>
                  <Text style={styles.ctTotalValue}>£{subtotal.toFixed(2)}</Text>
                </View>

                <TouchableOpacity
                  style={[styles.ctPlaceBtn, (submitting || cartEntries.length === 0) && styles.ctPlaceBtnDisabled]}
                  onPress={() => {
                    const deliveryError = getDeliveryError();
                    if (deliveryError) {
                      setErrorMsg(deliveryError);
                      return;
                    }
                    setErrorMsg(null);
                    setShowPlaceConfirm(true);
                  }}
                  disabled={submitting || cartEntries.length === 0}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                >
                  {submitting ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Check size={19} color="#FFFFFF" strokeWidth={2.8} />
                      <Text style={styles.ctPlaceText}>
                        {cartEntries.length === 0 ? 'Add items to place order' : `Place order · £${subtotal.toFixed(2)}`}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>

        {/* Exit with an unfinished order */}
        <ConfirmModal
          visible={showExitConfirm}
          title="Leave the POS?"
          message={`The current order (${totalItemCount} ${totalItemCount === 1 ? 'item' : 'items'}) hasn't been placed and will be discarded.`}
          confirmText="Discard & exit"
          cancelText="Stay"
          isDestructive
          onConfirm={discardAndExit}
          onClose={() => setShowExitConfirm(false)}
        />

        {/* Clear order confirmation */}
        <ConfirmModal
          visible={showClearConfirm}
          title="Clear this order?"
          message={`This removes all ${totalItemCount} ${totalItemCount === 1 ? 'item' : 'items'} from the current order. This can't be undone.`}
          confirmText="Clear order"
          cancelText="Keep order"
          isDestructive
          onConfirm={() => {
            setCart({});
            setShowClearConfirm(false);
          }}
          onClose={() => setShowClearConfirm(false)}
        />

        {/* Place order review */}
        <Modal visible={showPlaceConfirm} transparent animationType="fade" onRequestClose={() => setShowPlaceConfirm(false)}>
          <View style={styles.pcOverlay}>
            <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setShowPlaceConfirm(false)} accessibilityLabel="Close" />
            <View style={styles.pcBox}>
              <View style={styles.pcHeader}>
                <View style={styles.ctFlex}>
                  <Text style={styles.pcTitle}>Confirm order</Text>
                  <Text style={styles.pcSub} numberOfLines={1}>
                    {channel === 'dine_in'
                      ? `Dine-in${tableNumber.trim() ? ` · Table ${tableNumber.trim()}` : ''}${customerName.trim() ? ` · ${customerName.trim()}` : ''}`
                      : channel === 'delivery'
                      ? `Delivery · ${customerName.trim()}${deliveryAddress ? ` · ${[doorNumber.trim(), deliveryAddress.line1].filter(Boolean).join(', ')}${deliveryAddress.postalCode ? `, ${deliveryAddress.postalCode}` : ''}` : ''}`
                      : `Takeaway${customerName.trim() ? ` · ${customerName.trim()}` : ''}${customerPhone.trim() ? ` · ${customerPhone.trim()}` : ''}`}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setShowPlaceConfirm(false)} style={styles.pcClose} accessibilityRole="button" accessibilityLabel="Close">
                  <X size={18} color="#64748B" />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.pcList} contentContainerStyle={styles.pcListContent}>
                {cartEntries.map((entry) => {
                  const dc = getDietColor(entry.item);
                  const opts = getItemOptionsList(entry);
                  return (
                    <View key={entry.cartKey} style={styles.pcRow}>
                      <Text style={styles.pcQty}>{entry.quantity}×</Text>
                      {dc ? (
                        <View style={styles.ctDietWrap}>
                          <DietMark color={dc} size={13} />
                        </View>
                      ) : null}
                      <View style={styles.ctFlex}>
                        <Text style={styles.pcName}>{entry.item.name || entry.item.itemName}</Text>
                        {opts.length > 0 ? <Text style={styles.pcOpts}>{opts.join(' · ')}</Text> : null}
                        {entry.instructions ? <Text style={styles.ctItemNote}>“{entry.instructions}”</Text> : null}
                      </View>
                      <Text style={styles.pcPrice}>£{(entry.unitPrice * entry.quantity).toFixed(2)}</Text>
                    </View>
                  );
                })}
                {notes.trim() ? (
                  <View style={styles.pcNote}>
                    <MessageSquare size={14} color="#B45309" />
                    <Text style={styles.pcNoteText}>{notes.trim()}</Text>
                  </View>
                ) : null}
              </ScrollView>

              <View style={styles.pcSummary}>
                <View style={styles.pcSummaryRow}>
                  <Text style={styles.pcSummaryLabel}>Payment</Text>
                  <View style={styles.pcPayTag}>
                    {paymentType === 'cash' ? <Banknote size={15} color="#047857" /> : <CreditCard size={15} color="#1D4ED8" />}
                    <Text style={[styles.pcPayText, { color: paymentType === 'cash' ? '#047857' : '#1D4ED8' }]}>
                      {paymentType === 'cash' ? 'Cash' : 'Card'}
                    </Text>
                  </View>
                </View>
                <View style={styles.pcSummaryRow}>
                  <Text style={styles.pcSummaryLabel}>Receipts</Text>
                  <Text style={styles.pcSummaryValue}>{autoPrint ? 'Print kitchen & customer' : 'Don’t print'}</Text>
                </View>
                <View style={[styles.pcSummaryRow, styles.pcTotalRow]}>
                  <Text style={styles.pcTotalLabel}>
                    Total · {totalItemCount} {totalItemCount === 1 ? 'item' : 'items'}
                  </Text>
                  <Text style={styles.pcTotalValue}>£{subtotal.toFixed(2)}</Text>
                </View>
              </View>

              <View style={styles.pcButtons}>
                <TouchableOpacity style={styles.pcBackBtn} onPress={() => setShowPlaceConfirm(false)} activeOpacity={0.75}>
                  <Text style={styles.pcBackText}>Back</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.pcConfirmBtn, submitting && { opacity: 0.7 }]}
                  onPress={() => {
                    setShowPlaceConfirm(false);
                    handleSubmit();
                  }}
                  disabled={submitting}
                  activeOpacity={0.85}
                >
                  <Check size={18} color="#FFFFFF" strokeWidth={2.8} />
                  <Text style={styles.pcConfirmText}>Place order · £{subtotal.toFixed(2)}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

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
      </SafeAreaProvider>
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
  channelChipDeliveryActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  channelChipTextDeliveryActive: {
    color: '#1D4ED8',
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
  categoryRail: {
    width: 128,
    backgroundColor: '#F1F5F9',
    borderRightWidth: 1,
    borderRightColor: '#E2E8F0',
  },
  categoryRailWide: {
    width: 150,
  },
  categoryRailContent: {
    padding: 10,
    gap: 8,
  },
  railTile: {
    minHeight: 68,
    borderRadius: 8,
    backgroundColor: '#1E293B',
    paddingHorizontal: 10,
    paddingVertical: 10,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  railTileActive: {
    backgroundColor: '#FF5C39',
  },
  railTileText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 18,
  },
  railTileCount: {
    color: '#94A3B8',
    fontSize: 11.5,
    fontWeight: '700',
  },
  railTileCountActive: {
    color: '#FFE4DC',
  },
  categoryHeading: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 10,
  },
  categoryHeadingText: {
    flex: 1,
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  categoryHeadingCount: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#64748B',
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
    flexBasis: '48%',
    flexGrow: 1,
    maxWidth: '49%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  itemCardWide: {
    flexBasis: '31.5%',
    maxWidth: '32.5%',
  },
  itemImageBox: {
    width: '100%',
    aspectRatio: 4 / 3,
    backgroundColor: '#F1F5F9',
  },
  itemImageBoxTablet: {
    aspectRatio: 16 / 11,
  },
  itemImage: {
    width: '100%',
    height: '100%',
  },
  itemImagePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemDietBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
  },
  itemTitleTablet: {
    fontSize: 14,
    lineHeight: 18,
    minHeight: 36,
  },
  itemPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  itemPriceTextTablet: {
    fontSize: 15,
  },
  itemAddIconActive: {
    backgroundColor: '#FF5C39',
  },
  itemCardSelected: {
    borderColor: '#FF5C39',
    backgroundColor: '#FFF9F7',
  },
  itemContent: {
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 10,
    gap: 6,
  },
  itemTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
    lineHeight: 17,
    minHeight: 34,
  },
  itemPriceText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    fontVariant: ['tabular-nums'],
  },
  itemAddIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#FFF0EC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemQtyBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#FF5C39',
    borderRadius: 14,
    minWidth: 28,
    height: 28,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  itemQtyBadgeText: {
    color: '#FFFFFF',
    fontSize: 13,
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
  /* ── Order / cart panel ─────────────────────────────────── */
  ctFlex: { flex: 1, minWidth: 0 },
  ctTop: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    gap: 10,
  },
  ctTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ctTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A', letterSpacing: -0.3 },
  ctCountBadge: { minWidth: 24, height: 22, borderRadius: 11, backgroundColor: '#FF5C39', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 7 },
  ctCountText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  ctChannelTag: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 6, paddingHorizontal: 9, paddingVertical: 4 },
  ctChannelDineIn: { backgroundColor: '#EDE9FE' },
  ctChannelTakeaway: { backgroundColor: '#FFEDD5' },
  ctChannelDelivery: { backgroundColor: '#DBEAFE' },
  dlBox: { gap: 8, marginTop: 8 },
  dlChosen: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
  },
  dlChosenLine: { fontSize: 14.5, fontWeight: '700', color: '#0F172A' },
  dlChosenSub: { fontSize: 12.5, color: '#475569', marginTop: 1 },
  dlChange: { minHeight: 36, paddingHorizontal: 10, justifyContent: 'center' },
  dlChangeText: { fontSize: 13.5, fontWeight: '700', color: '#1D4ED8' },
  dlResult: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  dlResultText: { flex: 1, fontSize: 13.5, color: '#0F172A' },
  dlHint: { fontSize: 12.5, color: '#64748B' },
  ctChannelText: { fontSize: 12.5, fontWeight: '700' },
  ctFieldRow: { flexDirection: 'row', gap: 8 },
  ctField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  ctFieldTable: { width: 112 },
  ctInput: { flex: 1, fontSize: 14.5, color: '#0F172A', paddingVertical: 8, fontWeight: '600' },
  ctNoteField: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
  ctAddNote: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', minHeight: 32 },
  ctAddNoteText: { color: '#FF5C39', fontSize: 13.5, fontWeight: '700' },

  ctItems: { flex: 1 },
  ctItemsContent: { paddingHorizontal: 16, paddingVertical: 4 },
  ctRow: { paddingVertical: 12, gap: 4 },
  ctRowDivider: { borderTopWidth: 1, borderTopColor: '#E9EDF2' },
  ctRowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  ctItemName: { flex: 1, fontSize: 15, fontWeight: '700', color: '#0F172A', lineHeight: 20 },
  ctLineTotal: { fontSize: 15, fontWeight: '800', color: '#0F172A', fontVariant: ['tabular-nums'] },
  ctOptions: { fontSize: 12.5, color: '#64748B', lineHeight: 17 },
  ctItemNote: { fontSize: 12.5, color: '#B45309', fontStyle: 'italic', fontWeight: '600' },
  ctRowBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  ctStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    overflow: 'hidden',
  },
  ctStepBtn: { width: 40, height: 38, alignItems: 'center', justifyContent: 'center' },
  ctQty: { minWidth: 32, textAlign: 'center', fontSize: 15, fontWeight: '800', color: '#0F172A', fontVariant: ['tabular-nums'] },
  ctEach: { fontSize: 12.5, color: '#94A3B8', fontWeight: '600' },

  ctEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, minHeight: 180 },
  ctEmptyIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#EEF2F6', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  ctEmptyTitle: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  ctEmptyText: { fontSize: 13.5, color: '#64748B', marginTop: 4, textAlign: 'center' },

  ctFooter: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    gap: 10,
  },
  ctPaySegment: { flexDirection: 'row', backgroundColor: '#F1F5F9', borderRadius: 10, padding: 3 },
  ctPayBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, minHeight: 40, borderRadius: 8 },
  ctPayBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  ctPayText: { fontSize: 14.5, fontWeight: '700', color: '#64748B' },
  ctPrintRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 32 },
  ctPrintText: { flex: 1, fontSize: 13.5, color: '#475569', fontWeight: '600' },
  ctSwitch: { width: 40, height: 24, borderRadius: 12, backgroundColor: '#CBD5E1', padding: 2, justifyContent: 'center' },
  ctSwitchOn: { backgroundColor: '#FF5C39' },
  ctSwitchKnob: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#FFFFFF' },
  ctSwitchKnobOn: { alignSelf: 'flex-end' },
  ctError: { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', borderRadius: 8, padding: 10 },
  ctErrorText: { color: '#B91C1C', fontSize: 13, fontWeight: '600' },
  ctTotalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 2 },
  ctTotalLabel: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  ctTotalSub: { fontSize: 12.5, color: '#64748B', marginTop: 1, fontWeight: '500' },
  ctTotalValue: { fontSize: 28, fontWeight: '800', color: '#0F172A', letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
  ctPlaceBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 56, borderRadius: 12, backgroundColor: '#FF5C39' },
  ctPlaceBtnDisabled: { backgroundColor: '#CBD5E1' },
  ctPlaceText: { color: '#FFFFFF', fontSize: 17, fontWeight: '800', letterSpacing: 0.2 },

  ctDietWrap: { paddingTop: 3 },
  pcOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.55)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  pcBox: { width: '100%', maxWidth: 480, maxHeight: '88%', backgroundColor: '#FFFFFF', borderRadius: 16, overflow: 'hidden' },
  pcHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  pcTitle: { fontSize: 19, fontWeight: '800', color: '#0F172A' },
  pcSub: { fontSize: 13.5, color: '#64748B', marginTop: 2, fontWeight: '600' },
  pcClose: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  pcList: { flexGrow: 0 },
  pcListContent: { paddingHorizontal: 18, paddingVertical: 8 },
  pcRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 8 },
  pcQty: { minWidth: 28, fontSize: 14.5, fontWeight: '800', color: '#FF5C39' },
  pcName: { fontSize: 14.5, fontWeight: '700', color: '#0F172A' },
  pcOpts: { fontSize: 12.5, color: '#64748B', marginTop: 2 },
  pcPrice: { fontSize: 14.5, fontWeight: '700', color: '#0F172A', fontVariant: ['tabular-nums'] },
  pcNote: { flexDirection: 'row', gap: 8, backgroundColor: '#FFFBEB', borderRadius: 8, padding: 10, marginTop: 6, marginBottom: 4 },
  pcNoteText: { flex: 1, fontSize: 13, color: '#92400E', fontWeight: '600' },
  pcSummary: { paddingHorizontal: 18, paddingVertical: 12, gap: 8, backgroundColor: '#F8FAFC', borderTopWidth: 1, borderTopColor: '#E2E8F0' },
  pcSummaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pcSummaryLabel: { fontSize: 14, color: '#64748B', fontWeight: '600' },
  pcSummaryValue: { fontSize: 14, color: '#0F172A', fontWeight: '700' },
  pcPayTag: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pcPayText: { fontSize: 14, fontWeight: '800' },
  pcTotalRow: { marginTop: 4, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#E2E8F0' },
  pcTotalLabel: { fontSize: 15.5, fontWeight: '800', color: '#0F172A' },
  pcTotalValue: { fontSize: 24, fontWeight: '800', color: '#0F172A', fontVariant: ['tabular-nums'] },
  pcButtons: { flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: 1, borderTopColor: '#E2E8F0' },
  pcBackBtn: { minHeight: 52, paddingHorizontal: 22, borderRadius: 12, borderWidth: 1, borderColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center' },
  pcBackText: { fontSize: 15.5, fontWeight: '700', color: '#0F172A' },
  pcConfirmBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 52, borderRadius: 12, backgroundColor: '#FF5C39' },
  pcConfirmText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },

  /* ── POS top bar ────────────────────────────────────────── */
  posTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  posBrand: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
  posBrandIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#FFF0EC', alignItems: 'center', justifyContent: 'center' },
  posBrandTextCol: { flexShrink: 1, minWidth: 0 },
  posBrandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  posBrandText: { fontSize: 20, fontWeight: '900', color: '#0F172A', letterSpacing: 2 },
  posLive: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#ECFDF5', borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  posLiveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#10B981' },
  posLiveText: { fontSize: 10.5, fontWeight: '800', color: '#047857', letterSpacing: 0.6 },
  posSub: { fontSize: 12.5, color: '#64748B', fontWeight: '600', marginTop: 1 },
  posClock: { fontSize: 20, fontWeight: '800', color: '#64748B', fontVariant: ['tabular-nums'], marginLeft: 6 },
  posControls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  posClearBtn: {
    height: 44,
    minWidth: 44,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  posClearText: { fontSize: 14, fontWeight: '700', color: '#DC2626' },
  posExitBtn: {
    height: 44,
    minWidth: 44,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  posExitText: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  posBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 9, borderBottomWidth: 1 },
  posBannerInfo: { backgroundColor: '#EFF6FF', borderBottomColor: '#BFDBFE' },
  posBannerSuccess: { backgroundColor: '#ECFDF5', borderBottomColor: '#A7F3D0' },
  posBannerText: { flex: 1, fontSize: 13.5, fontWeight: '700' },

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

  customBadge: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    backgroundColor: 'rgba(255,255,255,0.95)',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
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

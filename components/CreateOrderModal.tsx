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

interface CreateOrderModalProps {
  visible: boolean;
  onClose: () => void;
  onOrderCreated: () => void;
  initialChannel?: 'dine_in' | 'takeaway' | 'delivery';
  restaurantId?: string;
  restaurantName?: string;
}

export const CreateOrderModal: React.FC<CreateOrderModalProps> = ({
  visible,
  onClose,
  onOrderCreated,
  initialChannel = 'dine_in',
  restaurantId,
  restaurantName,
}) => {
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

  // Cart: Map of menuItemId -> { item: MenuItem, quantity: number }
  const [cart, setCart] = useState<Record<string, { item: MenuItem; quantity: number }>>({});
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Sync initial channel when modal opens
  useEffect(() => {
    if (visible) {
      setChannel(initialChannel);
      setMobileTab('menu');
      setErrorMsg(null);
      loadMenu();
    } else {
      // Reset state
      setCart({});
      setCustomerName('');
      setCustomerPhone('');
      setTableNumber('');
      setDeliveryAddress('');
      setNotes('');
      setSearchQuery('');
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

  const addToCart = (item: MenuItem) => {
    const id = item._id || (item as any).id;
    setCart((prev) => {
      const existing = prev[id];
      return {
        ...prev,
        [id]: { item, quantity: (existing?.quantity || 0) + 1 },
      };
    });
  };

  const removeFromCart = (item: MenuItem) => {
    const id = item._id || (item as any).id;
    setCart((prev) => {
      const existing = prev[id];
      if (!existing) return prev;
      if (existing.quantity <= 1) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return {
        ...prev,
        [id]: { item, quantity: existing.quantity - 1 },
      };
    });
  };

  const clearCartItem = (id: string) => {
    setCart((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  // Calculations
  const cartEntries = Object.values(cart);
  const totalItemCount = cartEntries.reduce((sum, e) => sum + e.quantity, 0);
  const subtotal = cartEntries.reduce((sum, e) => {
    const p = Number(e.item.price || (e.item as any).basePrice || 0);
    return sum + p * e.quantity;
  }, 0);

  const handleSubmit = async () => {
    if (cartEntries.length === 0) {
      setErrorMsg('Please select at least 1 menu item to create an order.');
      return;
    }

    // Phone validation
    const cleanPhone = customerPhone.replace(/\D/g, '');
    let finalPhone = cleanPhone;
    if (!finalPhone) {
      finalPhone = '0000000000'; // Default guest phone if not entered for dine-in/takeaway
    } else if (finalPhone.length > 10) {
      finalPhone = finalPhone.slice(-10);
    } else if (finalPhone.length < 10) {
      finalPhone = finalPhone.padStart(10, '7');
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
          menuItemId: e.item._id,
          quantity: e.quantity,
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
                      const cartCount = cart[id]?.quantity || 0;
                      const price = Number(item.price || (item as any).basePrice || 0);

                      return (
                        <TouchableOpacity
                          key={id}
                          style={[
                            styles.itemCard,
                            isWideTablet && styles.itemCardWide,
                            cartCount > 0 && styles.itemCardSelected,
                          ]}
                          onPress={() => addToCart(item)}
                          activeOpacity={0.7}
                        >
                          <View style={styles.itemContent}>
                            <Text style={styles.itemTitle} numberOfLines={1}>
                              {item.name || item.itemName}
                            </Text>
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
                    {cartEntries.length > 0 && <ArrowRight size={14} color="#FFFFFF" />}
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
                        onChangeText={setCustomerName}
                      />
                      <TextInput
                        style={[styles.inputField, { flex: 1.2 }]}
                        placeholder="Phone No. (Optional)"
                        placeholderTextColor="#94A3B8"
                        keyboardType="phone-pad"
                        value={customerPhone}
                        onChangeText={setCustomerPhone}
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
                          onChangeText={setCustomerName}
                        />
                        <TextInput
                          style={[styles.inputField, { flex: 1 }]}
                          placeholder="Phone No."
                          placeholderTextColor="#94A3B8"
                          keyboardType="phone-pad"
                          value={customerPhone}
                          onChangeText={setCustomerPhone}
                        />
                      </View>
                      <TextInput
                        style={styles.inputField}
                        placeholder="Delivery Address & Postal Code"
                        placeholderTextColor="#94A3B8"
                        value={deliveryAddress}
                        onChangeText={setDeliveryAddress}
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
                      {cartEntries.map(({ item, quantity }) => {
                        const id = item._id || (item as any).id;
                        const price = Number(item.price || (item as any).basePrice || 0);

                        return (
                          <View key={id} style={styles.cartItemRow}>
                            <View style={styles.cartItemInfo}>
                              <Text style={styles.cartItemName} numberOfLines={1}>
                                {item.name || item.itemName}
                              </Text>
                              <Text style={styles.cartItemPrice}>£{(price * quantity).toFixed(2)}</Text>
                            </View>

                            <View style={styles.qtyControlRow}>
                              <TouchableOpacity
                                style={styles.qtyBtn}
                                onPress={() => removeFromCart(item)}
                                activeOpacity={0.7}
                              >
                                <Minus size={13} color="#64748B" />
                              </TouchableOpacity>
                              <Text style={styles.qtyNumber}>{quantity}</Text>
                              <TouchableOpacity
                                style={styles.qtyBtn}
                                onPress={() => addToCart(item)}
                                activeOpacity={0.7}
                              >
                                <Plus size={13} color="#64748B" />
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={styles.deleteBtn}
                                onPress={() => clearCartItem(id)}
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
                {errorMsg && (
                  <View style={styles.errorBox}>
                    <Text style={styles.errorText}>{errorMsg}</Text>
                  </View>
                )}
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
});

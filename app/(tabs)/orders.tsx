import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  RefreshControl,
  ActivityIndicator,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  DeviceEventEmitter,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { OrderDetailModal } from '../../components/OrderDetailModal';
import { AssignDeliveryModal } from '../../components/AssignDeliveryModal';
import { Colors } from '../../constants/colors';
import { orderService } from '../../services/order.service';
import { useToast } from '../../context/ToastContext';
import { Order, OrderStatus } from '../../types';
import {
  Search,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Clock,
  Bike,
  ShoppingBag,
  CheckCircle2,
  Inbox,
  Truck,
  Check,
  X,
  LayoutGrid,
  List,
  MapPin,
  UtensilsCrossed,
} from 'lucide-react-native';
import { printThermalReceipt, isAutoPrintEnabled } from '../../services/thermal-print.service';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const COLUMN_WIDTH = SCREEN_WIDTH * 0.72;

const STATUS_TABS = [
  { id: 'all', label: 'All Orders', subtitle: 'All Statuses', statuses: [] as OrderStatus[], accentColor: '#11181C', Icon: List },
  { id: 'new', label: 'New Orders', subtitle: 'Awaiting Acceptance', statuses: ['placed'] as OrderStatus[], accentColor: '#F59E0B', Icon: Inbox },
  { id: 'kitchen', label: 'In Kitchen', subtitle: 'Preparing & Cooking', statuses: ['confirmed', 'preparing'] as OrderStatus[], accentColor: '#3B82F6', Icon: Truck },
  { id: 'pickup', label: 'Self Pickup', subtitle: 'Ready for Collection', statuses: ['ready_for_pickup'] as OrderStatus[], accentColor: '#FF5C39', Icon: ShoppingBag },
  { id: 'delivery', label: 'Out for Delivery', subtitle: 'Rider on the Way', statuses: ['out_for_delivery'] as OrderStatus[], accentColor: '#8B5CF6', Icon: Bike },
  { id: 'completed', label: 'Completed', subtitle: 'Delivered Successfully', statuses: ['delivered'] as OrderStatus[], accentColor: '#10B981', Icon: CheckCircle2 },
  { id: 'cancelled', label: 'Cancelled', subtitle: 'Not Fulfilled', statuses: ['cancelled'] as OrderStatus[], accentColor: '#EF4444', Icon: RefreshCw },
];

const TYPE_FILTERS = [
  { label: 'All Orders', value: 'all', color: '#11181C', bg: '#F8F9FA', border: '#EEEEEE', Icon: List },
  { label: 'Delivery', value: 'delivery', color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE', Icon: Bike },
  { label: 'Pickup', value: 'pickup', color: '#EA580C', bg: '#FFF7ED', border: '#FED7AA', Icon: ShoppingBag },
  { label: 'Dine In', value: 'dine_in', color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE', Icon: UtensilsCrossed },
];

function getCustomerName(order: Order) {
  if (typeof order.customerId === 'object') return order.customerId?.fullName || order.customerDetails?.name || 'Customer';
  return order.customerDetails?.name || 'Customer';
}

function getCustomerPhone(order: Order) {
  if (typeof order.customerId === 'object') return order.customerId?.phoneNumber || order.customerDetails?.phoneNumber || '';
  return order.customerDetails?.phoneNumber || '';
}

function getRestaurantName(order: Order) {
  if (typeof order.restaurantId === 'object') return order.restaurantId?.restaurantName || 'Restaurant';
  return 'Restaurant';
}

function getTotalAmount(order: Order) {
  return (
    order.pricing?.totalAmount ?? order.pricing?.total ?? order.totalAmount ?? order.totalPrice ??
    (order.orderedItems || []).reduce((acc, item) => acc + (item.price || 0) * (item.quantity || 1), 0)
  );
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

function formatPaymentLabel(order: Order) {
  const pType = (order.paymentType || '').toLowerCase();
  if (pType === 'cash') {
    return 'Payment : COD';
  }
  return 'Payment : Online (Stripe/Card)';
}

function getOrderFulfillmentType(order: Order): 'delivery' | 'pickup' | 'dine_in' {
  const oType = ((order.orderType || (order as any).deliveryType || '') as string).toLowerCase();
  const notes = typeof order.notes === 'string' ? order.notes.toLowerCase() : '';
  const addr1 = typeof order.deliveryAddress?.addressLine1 === 'string' ? order.deliveryAddress.addressLine1.toLowerCase() : '';

  if (
    oType === 'dine_in' ||
    oType === 'dinein' ||
    oType === 'eatin' ||
    oType === 'eat_in' ||
    (order as any).tableNumber ||
    notes.includes('eat-in') ||
    notes.includes('dine-in') ||
    notes.includes('table') ||
    addr1.startsWith('table')
  ) {
    return 'dine_in';
  }
  if (oType === 'pickup' || oType === 'collection') {
    return 'pickup';
  }
  if (oType === 'delivery') {
    return 'delivery';
  }
  const addr = order.deliveryAddress;
  if (!addr) return 'pickup';
  if (typeof addr === 'string') return addr.trim() ? 'delivery' : 'pickup';
  const hasAddrField = Boolean(
    addr.formattedAddress ||
    addr.addressLine1 ||
    (addr as any).fullAddress ||
    (addr as any).address ||
    addr.street ||
    addr.area ||
    addr.city ||
    addr.postalCode ||
    addr.postcode
  );
  return hasAddrField ? 'delivery' : 'pickup';
}

function isOrderPickup(order: Order): boolean {
  return getOrderFulfillmentType(order) === 'pickup';
}

function getDeliveryAddressText(order: Order): string {
  const addr = order.deliveryAddress;
  if (!addr) {
    if (typeof order.customerDetails?.address === 'string' && order.customerDetails.address.trim()) {
      return order.customerDetails.address.trim();
    }
    return '';
  }
  if (typeof addr === 'string') return addr.trim();

  if (addr.formattedAddress && addr.formattedAddress.trim()) {
    return addr.formattedAddress.trim();
  }

  const parts = [
    (addr as any).houseNumber || (addr as any).flatNumber || (addr as any).doorNo,
    addr.addressLine1,
    addr.addressLine2,
    addr.street,
    (addr as any).landmark,
    addr.area,
    addr.city,
    addr.postalCode || addr.postcode || (addr as any).zipCode,
  ].filter(Boolean);

  if (parts.length > 0) {
    return parts.join(', ');
  }

  return (addr as any).fullAddress || (addr as any).address || '';
}

interface OrderCardProps {
  order: Order;
  onPress: (o: Order) => void;
  onAssignDelivery: (o: Order) => void;
  onUpdateStatus: (orderId: string, newStatus: string) => void;
}

const OrderCardItem: React.FC<OrderCardProps> = ({ order, onPress, onAssignDelivery, onUpdateStatus }) => {
  const [expanded, setExpanded] = useState(false);
  const customerName = getCustomerName(order);
  const customerPhone = getCustomerPhone(order);
  const restaurantName = getRestaurantName(order);
  const totalAmount = getTotalAmount(order);
  const isPaid = order.paymentStatus === 'paid' || order.paymentStatus === 'completed';
  const paymentLabel = formatPaymentLabel(order);
  const itemCount = (order.orderedItems || []).length;
  const orderNum = order.orderNumber || order._id?.substring(0, 7).toUpperCase();
  const fulfillmentType = getOrderFulfillmentType(order);
  const isPickup = fulfillmentType === 'pickup';
  const deliveryAddressText = getDeliveryAddressText(order);
  const deliveryPartnerName = typeof order.assignedDeliveryPartnerId === 'object' ? order.assignedDeliveryPartnerId?.fullName : undefined;

  const renderCardActions = () => {
    if (order.status === 'delivered' || order.status === 'cancelled') {
      return null;
    }

    // 1. Placed (New Orders)
    if (order.status === 'placed') {
      return (
        <View style={styles.actionButtonsRow}>
          <TouchableOpacity
            style={styles.acceptBtn}
            onPress={(e: any) => {
              e.stopPropagation?.();
              onUpdateStatus(order._id, 'preparing');
            }}
            activeOpacity={0.8}
          >
            <Check size={13} color="#FFFFFF" />
            <Text style={styles.acceptBtnText}>Accept Order</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.rejectBtn}
            onPress={(e: any) => {
              e.stopPropagation?.();
              onUpdateStatus(order._id, 'cancelled');
            }}
            activeOpacity={0.8}
          >
            <X size={13} color="#EF4444" />
            <Text style={styles.rejectBtnText}>Reject Order</Text>
          </TouchableOpacity>
        </View>
      );
    }

    // 2. In Kitchen / Preparing / Confirmed
    if (order.status === 'confirmed' || order.status === 'preparing') {
      if (fulfillmentType === 'dine_in') {
        // Eat-In (Dine-In) Order in Kitchen: "Ready to Serve" button -> marks served/delivered & Cancel button
        return (
          <View style={styles.actionButtonsRow}>
            <TouchableOpacity
              style={[styles.acceptBtn, { backgroundColor: '#7C3AED' }]}
              onPress={(e: any) => {
                e.stopPropagation?.();
                onUpdateStatus(order._id, 'delivered');
              }}
              activeOpacity={0.8}
            >
              <UtensilsCrossed size={13} color="#FFFFFF" />
              <Text style={styles.acceptBtnText}>Ready to Serve</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.rejectBtn}
              onPress={(e: any) => {
                e.stopPropagation?.();
                onUpdateStatus(order._id, 'cancelled');
              }}
              activeOpacity={0.8}
            >
              <X size={13} color="#EF4444" />
              <Text style={styles.rejectBtnText}>Cancel Order</Text>
            </TouchableOpacity>
          </View>
        );
      } else if (isPickup) {
        // Self Pickup in Kitchen: Show "Ready" (Ready for Pickup) -> moves to Self Pickup tab
        return (
          <View style={styles.actionButtonsRow}>
            <TouchableOpacity
              style={[styles.acceptBtn, { backgroundColor: '#FF5C39' }]}
              onPress={(e: any) => {
                e.stopPropagation?.();
                onUpdateStatus(order._id, 'ready_for_pickup');
              }}
              activeOpacity={0.8}
            >
              <Check size={13} color="#FFFFFF" />
              <Text style={styles.acceptBtnText}>Ready for Pickup</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.rejectBtn}
              onPress={(e: any) => {
                e.stopPropagation?.();
                onUpdateStatus(order._id, 'cancelled');
              }}
              activeOpacity={0.8}
            >
              <X size={13} color="#EF4444" />
              <Text style={styles.rejectBtnText}>Cancel Order</Text>
            </TouchableOpacity>
          </View>
        );
      } else {
        // Delivery order in kitchen: Button to assign Rider + Out for Delivery button
        return (
          <View style={styles.actionButtonsRow}>
            <TouchableOpacity
              style={styles.assignDriverIconBtn}
              onPress={(e: any) => {
                e.stopPropagation?.();
                onAssignDelivery(order);
              }}
              activeOpacity={0.8}
            >
              <Bike size={13} color="#FFFFFF" />
              <Text style={styles.assignDriverText}>
                {deliveryPartnerName ? `Rider: ${deliveryPartnerName}` : 'Assign Rider'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.outForDeliveryBtn}
              onPress={(e: any) => {
                e.stopPropagation?.();
                onUpdateStatus(order._id, 'out_for_delivery');
              }}
              activeOpacity={0.8}
            >
              <Truck size={13} color="#FFFFFF" />
              <Text style={styles.outForDeliveryBtnText}>Out for Delivery</Text>
            </TouchableOpacity>
          </View>
        );
      }
    }

    // 3. Self Pickup Orders in Ready State (Waiting in Self Pickup Tab for Customer Collection)
    if (isPickup && order.status === 'ready_for_pickup') {
      return (
        <View style={styles.actionButtonsRow}>
          <TouchableOpacity
            style={[styles.acceptBtn, { backgroundColor: '#10B981' }]}
            onPress={(e: any) => {
              e.stopPropagation?.();
              onUpdateStatus(order._id, 'delivered');
            }}
            activeOpacity={0.8}
          >
            <Check size={13} color="#FFFFFF" />
            <Text style={styles.acceptBtnText}>Delivered</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.rejectBtn}
            onPress={(e: any) => {
              e.stopPropagation?.();
              onUpdateStatus(order._id, 'cancelled');
            }}
            activeOpacity={0.8}
          >
            <X size={13} color="#EF4444" />
            <Text style={styles.rejectBtnText}>Cancel Order</Text>
          </TouchableOpacity>
        </View>
      );
    }

    // 3. Out for Delivery
    if (order.status === 'out_for_delivery') {
      return (
        <View style={styles.actionButtonsRow}>
          <TouchableOpacity
            style={styles.acceptBtn}
            onPress={(e: any) => {
              e.stopPropagation?.();
              onUpdateStatus(order._id, 'delivered');
            }}
            activeOpacity={0.8}
          >
            <Check size={13} color="#FFFFFF" />
            <Text style={styles.acceptBtnText}>Mark Delivered</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.assignDriverIconBtn}
            onPress={(e: any) => {
              e.stopPropagation?.();
              onAssignDelivery(order);
            }}
            activeOpacity={0.8}
          >
            <Bike size={13} color="#FFFFFF" />
            <Text style={styles.assignDriverText}>
              {deliveryPartnerName ? `Rider: ${deliveryPartnerName}` : 'Assign Rider'}
            </Text>
          </TouchableOpacity>
        </View>
      );
    }

    // 4. Any other active Self Pickup order
    if (isPickup) {
      return (
        <View style={styles.actionButtonsRow}>
          <TouchableOpacity
            style={[styles.acceptBtn, { backgroundColor: '#10B981' }]}
            onPress={(e: any) => {
              e.stopPropagation?.();
              onUpdateStatus(order._id, 'delivered');
            }}
            activeOpacity={0.8}
          >
            <Check size={13} color="#FFFFFF" />
            <Text style={styles.acceptBtnText}>Delivered</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.rejectBtn}
            onPress={(e: any) => {
              e.stopPropagation?.();
              onUpdateStatus(order._id, 'cancelled');
            }}
            activeOpacity={0.8}
          >
            <X size={13} color="#EF4444" />
            <Text style={styles.rejectBtnText}>Cancel Order</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return null;
  };

  return (
    <TouchableOpacity activeOpacity={0.88} onPress={() => onPress(order)} style={styles.kanbanCard}>
      {/* Watermark Stamp Overlay for Completed (Success) & Cancelled Orders */}
      {order.status === 'delivered' && (
        <View style={styles.stampOverlay} pointerEvents="none">
          <View style={[styles.stampBox, styles.stampSuccess]}>
            <CheckCircle2 size={13} color="#10B981" style={{ marginRight: 3 }} />
            <Text style={[styles.stampText, styles.stampSuccessText]}>SUCCESS</Text>
          </View>
        </View>
      )}

      {order.status === 'cancelled' && (
        <View style={styles.stampOverlay} pointerEvents="none">
          <View style={[styles.stampBox, styles.stampCancelled]}>
            <X size={13} color="#EF4444" style={{ marginRight: 3 }} />
            <Text style={[styles.stampText, styles.stampCancelledText]}>CANCELLED</Text>
          </View>
        </View>
      )}

      <View style={styles.kanbanCardTop}>
        <View style={styles.kanbanOrderIdCol}>
          <View style={styles.kanbanOrderIdRow}>
            <Text style={styles.kanbanOrderId}>#{orderNum}</Text>
            {isPaid && <View style={styles.paidBadge}><Text style={styles.paidBadgeText}>PAID</Text></View>}
          </View>
          <Text style={styles.kanbanPaymentBelowId}>{paymentLabel}</Text>
        </View>

        <View style={styles.kanbanAmountRow}>
          <Text style={styles.kanbanAmount}>£{(totalAmount || 0).toFixed(2)}</Text>
          <Text style={styles.kanbanItemCount}>{itemCount} items</Text>
        </View>
      </View>

      <View style={styles.kanbanMeta}>
        <Text style={styles.kanbanRestaurant} numberOfLines={1}>{restaurantName}</Text>
      </View>

      <View style={styles.kanbanDivider} />

      <View style={styles.kanbanCustomerRow}>
        <View style={styles.kanbanAvatar}>
          <Text style={styles.kanbanAvatarText}>{customerName.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.kanbanCustomerName}>{customerName}</Text>
          {customerPhone ? <Text style={styles.kanbanCustomerPhone}>{customerPhone}</Text> : null}
        </View>
      </View>

      {fulfillmentType === 'delivery' && deliveryAddressText ? (
        <View style={styles.kanbanAddressRow}>
          <MapPin size={13} color="#2563EB" style={styles.addressPinIcon} />
          <View style={{ flex: 1 }}>
            <Text style={styles.kanbanAddressHeader}>Delivery Address:</Text>
            <Text style={styles.kanbanAddressText} numberOfLines={2}>
              {deliveryAddressText}
            </Text>
          </View>
        </View>
      ) : null}

      <View style={styles.kanbanTypeRow}>
        {fulfillmentType === 'delivery' ? (
          <View style={styles.deliveryTag}>
            <Bike size={12} color="#2563EB" />
            <Text style={styles.deliveryTagText}>Delivery Order</Text>
          </View>
        ) : fulfillmentType === 'dine_in' ? (
          <View style={styles.dineInTag}>
            <UtensilsCrossed size={12} color="#7C3AED" />
            <Text style={styles.dineInTagText}>
              Eat-In (Dine In) {
                (order as any).tableNumber
                  ? `• Table ${(order as any).tableNumber}`
                  : order.deliveryAddress?.addressLine1?.toLowerCase().startsWith('table')
                  ? `• ${order.deliveryAddress.addressLine1}`
                  : typeof order.notes === 'string' && order.notes.includes('Table')
                  ? `• ${order.notes}`
                  : ''
              }
            </Text>
          </View>
        ) : (
          <View style={styles.pickupTag}>
            <ShoppingBag size={12} color="#EA580C" />
            <Text style={styles.pickupTagText}>
              {order.status === 'delivered'
                ? 'Self Pickup (Picked Up)'
                : order.status === 'ready_for_pickup'
                ? 'Self Pickup (Ready for Collection)'
                : order.status === 'preparing' || order.status === 'confirmed'
                ? 'Self Pickup (In Kitchen)'
                : 'Self Pickup'}
            </Text>
          </View>
        )}
        {deliveryPartnerName && (
          <View style={styles.riderBadge}>
            <Bike size={11} color="#6B7280" />
            <Text style={styles.riderText}>{deliveryPartnerName}</Text>
          </View>
        )}
      </View>

      <View style={styles.kanbanFooter}>
        <View style={styles.kanbanDateRow}>
          <Clock size={11} color="#9BA1A6" />
          <Text style={styles.kanbanDate}>{formatDateTime(order.createdAt)}</Text>
        </View>
        <View
          style={[
            styles.orderTypeBadge,
            fulfillmentType === 'delivery'
              ? { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }
              : fulfillmentType === 'dine_in'
              ? { backgroundColor: '#F5F3FF', borderColor: '#DDD6FE' }
              : { backgroundColor: '#FFF7ED', borderColor: '#FED7AA' },
          ]}
        >
          <Text
            style={[
              styles.orderTypeText,
              fulfillmentType === 'delivery'
                ? { color: '#2563EB' }
                : fulfillmentType === 'dine_in'
                ? { color: '#7C3AED' }
                : { color: '#EA580C' },
            ]}
          >
            {fulfillmentType === 'delivery' ? 'DELIVERY' : fulfillmentType === 'dine_in' ? 'EAT-IN (DINE IN)' : 'PICKUP'}
          </Text>
        </View>
      </View>

      <TouchableOpacity style={styles.viewItemsBtn} onPress={() => setExpanded(!expanded)} activeOpacity={0.7}>
        <Text style={styles.viewItemsBtnText}>VIEW ITEMS & NOTES</Text>
        {expanded ? <ChevronUp size={13} color="#9BA1A6" /> : <ChevronDown size={13} color="#9BA1A6" />}
      </TouchableOpacity>

      {expanded && (
        <View style={styles.itemsList}>
          {(order.orderedItems || []).map((item, idx) => (
            <View key={idx} style={styles.itemRow}>
              <Text style={styles.itemQty}>{item.quantity}x</Text>
              <Text style={styles.itemName} numberOfLines={1}>{item.name || (item as any).itemName}</Text>
              <Text style={styles.itemPrice}>£{((item.price || 0) * item.quantity).toFixed(2)}</Text>
            </View>
          ))}
          {order.notes ? (
            <View style={styles.noteRow}>
              <Text style={styles.noteLabel}>Note: </Text>
              <Text style={styles.noteText}>{order.notes}</Text>
            </View>
          ) : null}
        </View>
      )}

      {renderCardActions()}
    </TouchableOpacity>
  );
};

export default function OrdersScreen() {
  const { showToast } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'tabs' | 'board'>('tabs');

  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [assignModalVisible, setAssignModalVisible] = useState(false);

  const fetchOrders = useCallback(async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);
      const res = await orderService.getAllOrders({ page: 1, limit: 200 });
      const orderList = res.data || res.orders;
      if (res.success && orderList) setOrders(orderList);
    } catch (e) {
      console.error('Failed fetching orders:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // 1. Refetch whenever screen comes into focus
  useFocusEffect(
    useCallback(() => {
      fetchOrders(true);
    }, [fetchOrders])
  );

  // 2. Real-time WebSocket listener + 5-second auto polling
  useEffect(() => {
    fetchOrders();

    const sub = DeviceEventEmitter.addListener('websocket_message', (data: any) => {
      const type = (data?.type || data?.event || '').toUpperCase();
      if (
        type.includes('ORDER') ||
        type.includes('STATUS') ||
        type.includes('DELIVERY') ||
        type.includes('REFRESH') ||
        data?.orderId ||
        data?.order ||
        data?.status
      ) {
        fetchOrders(true);
      }
    });

    const interval = setInterval(() => {
      fetchOrders(true);
    }, 5000);

    return () => {
      sub.remove();
      clearInterval(interval);
    };
  }, [fetchOrders]);

  const onRefresh = () => { setRefreshing(true); fetchOrders(true); };

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const idMatch = order._id?.toLowerCase().includes(q) || order.orderNumber?.toLowerCase().includes(q);
        const restMatch = getRestaurantName(order).toLowerCase().includes(q);
        const custMatch = getCustomerName(order).toLowerCase().includes(q);
        if (!idMatch && !restMatch && !custMatch) return false;
      }
      const fType = getOrderFulfillmentType(order);
      if (typeFilter !== 'all' && fType !== typeFilter) {
        return false;
      }
      return true;
    });
  }, [orders, searchQuery, typeFilter]);

  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: filteredOrders.length,
      new: filteredOrders.filter((o) => o.status === 'placed').length,
      kitchen: filteredOrders.filter((o) => o.status === 'confirmed' || o.status === 'preparing').length,
      pickup: filteredOrders.filter((o) => isOrderPickup(o) && o.status === 'ready_for_pickup').length,
      delivery: filteredOrders.filter((o) => o.status === 'out_for_delivery').length,
      completed: filteredOrders.filter((o) => o.status === 'delivered').length,
      cancelled: filteredOrders.filter((o) => o.status === 'cancelled').length,
    };
    return counts;
  }, [filteredOrders]);

  const activeTabOrders = useMemo(() => {
    if (activeTab === 'all') return filteredOrders;
    if (activeTab === 'kitchen') {
      return filteredOrders.filter((o) => o.status === 'confirmed' || o.status === 'preparing');
    }
    if (activeTab === 'pickup') {
      return filteredOrders.filter((o) => isOrderPickup(o) && o.status === 'ready_for_pickup');
    }
    const tabDef = STATUS_TABS.find((t) => t.id === activeTab);
    if (!tabDef) return filteredOrders;
    return filteredOrders.filter((o) => tabDef.statuses.includes(o.status));
  }, [filteredOrders, activeTab]);

  const activeOrderCount = useMemo(
    () => filteredOrders.filter((o) => o.status !== 'delivered' && o.status !== 'cancelled').length,
    [filteredOrders]
  );

  const handleUpdateStatus = async (orderId: string, newStatus: string) => {
    try {
      const res = await orderService.updateOrderStatus(orderId, newStatus);
      if (res.success) {
        showToast({ title: 'Success', message: `Order status updated to '${newStatus}'.`, type: 'success' });
        let updatedOrder = selectedOrder;
        if (selectedOrder && selectedOrder._id === orderId) {
          updatedOrder = { ...selectedOrder, status: newStatus as any };
          setSelectedOrder(updatedOrder);
        }
        fetchOrders(true);
        if (newStatus === 'preparing') {
          const autoPrint = await isAutoPrintEnabled();
          if (autoPrint) {
            try {
              let orderToPrint = updatedOrder;
              if (!orderToPrint?.orderedItems?.length) {
                const fullOrderRes = await orderService.getOrderById(orderId);
                if (fullOrderRes.success && fullOrderRes.data) orderToPrint = fullOrderRes.data;
              }
              if (orderToPrint) await printThermalReceipt(orderToPrint, true);
            } catch (printErr) { console.error('[Orders] Auto-print failed:', printErr); }
          }
        }
      } else {
        showToast({ title: 'Error', message: res.message || 'Failed to update.', type: 'error' });
      }
    } catch {
      showToast({ title: 'Error', message: 'Unexpected error while updating status.', type: 'error' });
    }
  };

  const handleAssignConfirm = async (deliveryPartnerId: string) => {
    if (!selectedOrder) return;
    const res = await orderService.assignDeliveryPartner(selectedOrder._id, deliveryPartnerId);
    if (res.success) {
      showToast({ title: 'Success', message: 'Delivery partner assigned.', type: 'success' });
      fetchOrders(true);
    } else {
      showToast({ title: 'Error', message: res.message || 'Failed to assign.', type: 'error' });
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Page Header */}
      <View style={styles.pageHeader}>
        <View>
          <View style={styles.pageTitleRow}>
            <Text style={styles.pageTitle}>Orders Board</Text>
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>Live</Text>
            </View>
          </View>
          <Text style={styles.pageSubtitle}>
            {activeOrderCount} active order{activeOrderCount !== 1 ? 's' : ''} requiring attention
          </Text>
        </View>

        <View style={styles.headerRightControls}>
          <View style={styles.viewToggleContainer}>
            <TouchableOpacity
              style={[styles.toggleBtn, viewMode === 'board' && styles.toggleBtnActive]}
              onPress={() => setViewMode('board')}
              activeOpacity={0.7}
            >
              <LayoutGrid size={13} color={viewMode === 'board' ? '#FFFFFF' : '#687076'} />
              <Text style={[styles.toggleBtnText, viewMode === 'board' && styles.toggleBtnTextActive]}>Board</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleBtn, viewMode === 'tabs' && styles.toggleBtnActive]}
              onPress={() => setViewMode('tabs')}
              activeOpacity={0.7}
            >
              <List size={13} color={viewMode === 'tabs' ? '#FFFFFF' : '#687076'} />
              <Text style={[styles.toggleBtnText, viewMode === 'tabs' && styles.toggleBtnTextActive]}>Tabs</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.refreshBtn} onPress={onRefresh}>
            <RefreshCw size={16} color={Colors.textSubtle} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Controls */}
      <View style={styles.controlsRow}>
        <View style={styles.searchBox}>
          <Search size={14} color={Colors.textSubtle} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search #ORD, customer, item..."
            placeholderTextColor={Colors.textSubtle}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.typeFilters}>
          {TYPE_FILTERS.map((f) => {
            const isSelected = typeFilter === f.value;
            const { Icon } = f;
            const count =
              f.value === 'all'
                ? orders.length
                : orders.filter((o) => getOrderFulfillmentType(o) === f.value).length;

            return (
              <TouchableOpacity
                key={f.value}
                style={[
                  styles.typeChip,
                  isSelected
                    ? { backgroundColor: f.color, borderColor: f.color }
                    : { backgroundColor: f.bg, borderColor: f.border },
                ]}
                onPress={() => setTypeFilter(f.value)}
                activeOpacity={0.7}
              >
                <Icon size={13} color={isSelected ? '#FFFFFF' : f.color} />
                <Text
                  style={[
                    styles.typeChipText,
                    isSelected ? { color: '#FFFFFF', fontWeight: '800' } : { color: f.color },
                  ]}
                >
                  {f.label}
                </Text>
                <View
                  style={[
                    styles.typeChipCountBadge,
                    isSelected
                      ? { backgroundColor: 'rgba(255,255,255,0.25)' }
                      : { backgroundColor: f.color === '#11181C' ? '#E2E8F0' : `${f.color}15` },
                  ]}
                >
                  <Text
                    style={[
                      styles.typeChipCountText,
                      isSelected ? { color: '#FFFFFF' } : { color: f.color },
                    ]}
                  >
                    {count}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Status Tabs Navigation Bar (Shown in Tabs mode) */}
      {viewMode === 'tabs' && (
        <View style={styles.statusTabsBarContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statusTabsBar}>
            {STATUS_TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              const count = tabCounts[tab.id] || 0;
              const { Icon } = tab;
              return (
                <TouchableOpacity
                  key={tab.id}
                  style={[styles.statusTabPill, isActive && { backgroundColor: '#11181C', borderColor: '#11181C' }]}
                  onPress={() => setActiveTab(tab.id)}
                  activeOpacity={0.7}
                >
                  <Icon size={14} color={isActive ? '#FFFFFF' : tab.accentColor} />
                  <Text style={[styles.statusTabLabel, isActive && styles.statusTabLabelActive]}>
                    {tab.label}
                  </Text>
                  <View style={[styles.tabBadge, isActive ? styles.tabBadgeActive : { backgroundColor: tab.accentColor }]}>
                    <Text style={[styles.tabBadgeText, isActive && { color: '#11181C' }]}>{count}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Content View */}
      {viewMode === 'tabs' ? (
        loading ? (
          <View style={styles.centerLoader}><ActivityIndicator size="large" color="#FF5C39" /></View>
        ) : activeTabOrders.length === 0 ? (
          <View style={styles.centerEmpty}>
            <ShoppingBag size={48} color="#EEEEEE" />
            <Text style={styles.emptyTitle}>No Orders Found</Text>
            <Text style={styles.emptySubtitle}>There are no orders for the selected status tab or search query.</Text>
          </View>
        ) : (
          <FlatList
                data={activeTabOrders}
                keyExtractor={(item) => item._id}
                contentContainerStyle={styles.tabOrdersList}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF5C39" colors={['#FF5C39']} />}
                renderItem={({ item }) => (
                  <OrderCardItem
                    order={item}
                    onPress={(o) => { setSelectedOrder(o); setDetailModalVisible(true); }}
                    onAssignDelivery={(o) => { setSelectedOrder(o); setAssignModalVisible(true); }}
                    onUpdateStatus={handleUpdateStatus}
                  />
                )}
              />
        )
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.kanbanBoard}
          decelerationRate="fast"
          snapToInterval={COLUMN_WIDTH + 12}
          snapToAlignment="start"
        >
          {STATUS_TABS.filter((c) => c.id !== 'all').map((col) => {
            const ordersInCol = col.id === 'pickup'
              ? filteredOrders.filter((o) => isOrderPickup(o) && o.status === 'ready_for_pickup')
              : col.id === 'kitchen'
              ? filteredOrders.filter((o) => o.status === 'confirmed' || o.status === 'preparing')
              : filteredOrders.filter((o) => col.statuses.includes(o.status));
            const { Icon, accentColor, label, subtitle } = col;
            return (
              <View key={col.id} style={[styles.kanbanColumn, { width: COLUMN_WIDTH }]}>
                <View style={[styles.kanbanColumnHeader, { borderLeftColor: accentColor }]}>
                  <View style={styles.kanbanColumnHeaderLeft}>
                    <Icon size={16} color={accentColor} />
                    <View style={{ marginLeft: 8 }}>
                      <Text style={styles.kanbanColumnTitle}>{label}</Text>
                      <Text style={styles.kanbanColumnSubtitle}>{subtitle}</Text>
                    </View>
                  </View>
                  <View style={[styles.kanbanBadge, { backgroundColor: accentColor }]}>
                    <Text style={styles.kanbanBadgeText}>{ordersInCol.length}</Text>
                  </View>
                </View>
                {loading ? (
                  <View style={styles.columnCenter}><ActivityIndicator size="small" color={accentColor} /></View>
                ) : ordersInCol.length === 0 ? (
                  <View style={styles.columnCenter}>
                    <Icon size={36} color="#EEEEEE" />
                    <Text style={styles.emptyColumnText}>No orders in {label.toLowerCase()}</Text>
                  </View>
                ) : (
                  <FlatList
                        data={ordersInCol}
                        keyExtractor={(item) => item._id}
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={styles.kanbanCardList}
                        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accentColor} colors={[accentColor]} />}
                        renderItem={({ item }) => (
                          <OrderCardItem
                            order={item}
                            onPress={(o) => { setSelectedOrder(o); setDetailModalVisible(true); }}
                            onAssignDelivery={(o) => { setSelectedOrder(o); setAssignModalVisible(true); }}
                            onUpdateStatus={handleUpdateStatus}
                          />
                        )}
                      />
                )}
              </View>
            );
          })}
          </ScrollView>
      )}

      <OrderDetailModal
        visible={detailModalVisible}
        order={selectedOrder}
        onClose={() => setDetailModalVisible(false)}
        onAssignDelivery={(o) => { setSelectedOrder(o); setAssignModalVisible(true); }}
        onUpdateStatus={handleUpdateStatus}
      />
      <AssignDeliveryModal
        visible={assignModalVisible}
        order={selectedOrder}
        onClose={() => setAssignModalVisible(false)}
        onConfirmAssign={handleAssignConfirm}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  pageHeader: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8,
    backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#EEEEEE',
  },
  pageTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pageTitle: { fontSize: 20, fontWeight: '800', color: '#11181C', letterSpacing: -0.3 },
  liveBadge: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#ECFDF5',
    borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3, gap: 4,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#10B981' },
  liveText: { fontSize: 11, fontWeight: '700', color: '#065F46' },
  pageSubtitle: { fontSize: 12, color: '#9BA1A6', marginTop: 2 },
  headerRightControls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  viewToggleContainer: {
    flexDirection: 'row', backgroundColor: '#F0F0F0', borderRadius: 8, padding: 3, gap: 2,
  },
  toggleBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6,
  },
  toggleBtnActive: { backgroundColor: '#FF5C39' },
  toggleBtnText: { fontSize: 12, fontWeight: '700', color: '#687076' },
  toggleBtnTextActive: { color: '#FFFFFF' },
  refreshBtn: {
    padding: 8, borderRadius: 8, backgroundColor: '#F8F9FA',
    borderWidth: 1, borderColor: '#EEEEEE',
  },
  controlsRow: {
    backgroundColor: '#FFFFFF', paddingHorizontal: 16, paddingBottom: 10, paddingTop: 8,
    gap: 8, borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
  },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8F9FA',
    borderRadius: 8, borderWidth: 1, borderColor: '#EEEEEE', paddingHorizontal: 10, gap: 8, height: 38,
  },
  searchInput: { flex: 1, fontSize: 13, color: '#11181C', height: 38 },
  typeFilters: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  typeChipText: { fontSize: 12, fontWeight: '700' },
  typeChipCountBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
    minWidth: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeChipCountText: { fontSize: 10, fontWeight: '800' },

  statusTabsBarContainer: {
    backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#EEEEEE', paddingVertical: 8, paddingHorizontal: 12,
  },
  statusTabsBar: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  statusTabPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 20, backgroundColor: '#F8F9FA', borderWidth: 1, borderColor: '#EEEEEE',
  },
  statusTabLabel: { fontSize: 12, fontWeight: '700', color: '#11181C' },
  statusTabLabelActive: { color: '#FFFFFF' },
  tabBadge: {
    borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1, minWidth: 18, alignItems: 'center', justifyContent: 'center',
  },
  tabBadgeActive: { backgroundColor: '#FFFFFF' },
  tabBadgeText: { fontSize: 10, fontWeight: '800', color: '#FFFFFF' },

  tabOrdersList: { padding: 16, gap: 12, paddingBottom: 110 },
  centerLoader: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 60 },
  centerEmpty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#11181C', marginTop: 8 },
  emptySubtitle: { fontSize: 12, color: '#9BA1A6', textAlign: 'center' },

  kanbanBoard: {
    paddingHorizontal: 12, paddingTop: 12, paddingBottom: 100,
    gap: 12, flexDirection: 'row', alignItems: 'flex-start',
  },
  kanbanColumn: {
    backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1,
    borderColor: '#EEEEEE', overflow: 'hidden', flex: 1,
    maxHeight: 800,
  },
  kanbanColumnHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 12, borderLeftWidth: 4,
    backgroundColor: '#FAFAFA', borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
  },
  kanbanColumnHeaderLeft: { flexDirection: 'row', alignItems: 'center' },
  kanbanColumnTitle: { fontSize: 13, fontWeight: '700', color: '#11181C' },
  kanbanColumnSubtitle: { fontSize: 10, color: '#9BA1A6', marginTop: 1 },
  kanbanBadge: { borderRadius: 20, minWidth: 26, height: 26, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  kanbanBadgeText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  columnCenter: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48, gap: 8 },
  emptyColumnText: { fontSize: 12, color: '#C4C9CE', textAlign: 'center', marginTop: 4 },
  kanbanCardList: { padding: 10, gap: 10 },

  kanbanCard: {
    backgroundColor: '#FFFFFF', borderRadius: 10, borderWidth: 1, borderColor: '#F0F0F0',
    padding: 12, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  kanbanCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  kanbanOrderIdCol: { gap: 2 },
  kanbanOrderIdRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  kanbanOrderId: { fontSize: 13, fontWeight: '700', color: '#11181C' },
  kanbanPaymentBelowId: { fontSize: 11, fontWeight: '700', color: '#687076', marginTop: 2 },
  paidBadge: { backgroundColor: '#ECFDF5', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  paidBadgeText: { fontSize: 9, fontWeight: '800', color: '#065F46', letterSpacing: 0.5 },
  kanbanAmountRow: { alignItems: 'flex-end' },
  kanbanAmount: { fontSize: 15, fontWeight: '800', color: '#11181C' },
  kanbanItemCount: { fontSize: 10, color: '#9BA1A6', marginTop: 1 },
  kanbanMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 4 },
  kanbanRestaurant: { fontSize: 11, color: '#FF5C39', fontWeight: '600', flex: 1 },
  kanbanDivider: { height: 1, backgroundColor: '#F5F5F5', marginVertical: 10 },
  kanbanCustomerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  kanbanAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#F0F0F0', alignItems: 'center', justifyContent: 'center' },
  kanbanAvatarText: { fontSize: 12, fontWeight: '700', color: '#687076' },
  kanbanCustomerName: { fontSize: 13, fontWeight: '600', color: '#11181C' },
  kanbanCustomerPhone: { fontSize: 11, color: '#9BA1A6' },
  kanbanAddressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#EFF6FF',
    borderWidth: 1.5,
    borderColor: '#BFDBFE',
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 7,
    marginBottom: 8,
    gap: 7,
  },
  addressPinIcon: {
    marginTop: 2,
  },
  kanbanAddressHeader: {
    fontSize: 10,
    fontWeight: '800',
    color: '#1E40AF',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 1,
  },
  kanbanAddressText: {
    fontSize: 11.5,
    color: '#1E3A8A',
    fontWeight: '600',
    lineHeight: 16,
  },
  kanbanTypeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  pickupTag: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#FFF7ED', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3.5,
    borderWidth: 1, borderColor: '#FED7AA',
  },
  pickupTagText: { fontSize: 11, fontWeight: '700', color: '#EA580C' },
  deliveryTag: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#EFF6FF', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3.5,
    borderWidth: 1, borderColor: '#BFDBFE',
  },
  deliveryTagText: { fontSize: 11, fontWeight: '700', color: '#2563EB' },
  dineInTag: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#F5F3FF', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3.5,
    borderWidth: 1, borderColor: '#DDD6FE',
  },
  dineInTagText: { fontSize: 11, fontWeight: '700', color: '#7C3AED' },
  riderBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F8F9FA', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3, borderWidth: 1, borderColor: '#EEEEEE' },
  riderText: { fontSize: 10, color: '#687076' },
  kanbanFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  kanbanDateRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  kanbanDate: { fontSize: 10, color: '#9BA1A6' },
  orderTypeBadge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1 },
  orderTypeText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  viewItemsBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#F5F5F5' },
  viewItemsBtnText: { fontSize: 10, fontWeight: '700', color: '#9BA1A6', letterSpacing: 0.3 },
  itemsList: { marginTop: 8, gap: 4 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  itemQty: { fontSize: 11, fontWeight: '700', color: '#9BA1A6', width: 22 },
  itemName: { flex: 1, fontSize: 11, color: '#11181C' },
  itemPrice: { fontSize: 11, fontWeight: '600', color: '#687076' },
  noteRow: { flexDirection: 'row', marginTop: 4, paddingTop: 4, borderTopWidth: 1, borderTopColor: '#F5F5F5' },
  noteLabel: { fontSize: 11, fontWeight: '700', color: '#9BA1A6' },
  noteText: { fontSize: 11, color: '#687076', flex: 1 },
  actionButtonsRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  acceptBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: '#10B981', borderRadius: 8, paddingVertical: 8 },
  acceptBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  rejectBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#EF4444', borderRadius: 8, paddingVertical: 8 },
  rejectBtnText: { color: '#EF4444', fontSize: 12, fontWeight: '700' },
  outForDeliveryBtn: { flex: 1.3, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: '#8B5CF6', borderRadius: 8, paddingVertical: 8 },
  outForDeliveryBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  assignDriverIconBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: '#FF5C39', borderRadius: 8, paddingVertical: 8 },
  assignDriverText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },

  /* Watermark Stamp Styles */
  stampOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  stampBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 2.5,
    borderStyle: 'dashed',
    transform: [{ rotate: '-14deg' }],
  },
  stampSuccess: {
    borderColor: '#10B981',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
  },
  stampCancelled: {
    borderColor: '#EF4444',
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
  },
  stampText: {
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  stampSuccessText: {
    color: '#10B981',
  },
  stampCancelledText: {
    color: '#EF4444',
  },
});

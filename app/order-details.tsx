import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Linking,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Header } from '../components/Header';
import { StatusBadge } from '../components/StatusBadge';
import { AssignDeliveryModal } from '../components/AssignDeliveryModal';
import { Colors } from '../constants/colors';
import { orderService } from '../services/order.service';
import { useToast } from '../context/ToastContext';
import { Order } from '../types';
import {
  Store,
  User,
  MapPin,
  Bike,
  CreditCard,
  Edit2,
  Check,
  Navigation,
  Printer,
  Phone,
  Banknote,
  ChevronDown,
  ChevronUp,
} from 'lucide-react-native';
import { printThermalReceipt, isAutoPrintEnabled } from '../services/thermal-print.service';

const STATUS_DROPDOWN_OPTIONS = [
  { label: 'Placed', sub: 'New Order Received', value: 'placed', icon: '📦' },
  { label: 'Preparing', sub: 'In Kitchen Cooking', value: 'preparing', icon: '🍳' },
  { label: 'Ready for Pickup', sub: 'Self Pickup Collection', value: 'ready_for_pickup', icon: '🛍️' },
  { label: 'Out for Delivery', sub: 'Rider Out on Road', value: 'out_for_delivery', icon: '🛵' },
  { label: 'Delivered', sub: 'Order Completed & Delivered', value: 'delivered', icon: '✅' },
  { label: 'Cancelled', sub: 'Order Cancelled', value: 'cancelled', icon: '❌' },
];

export default function OrderDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const orderId = params.orderId as string;
  const { showToast } = useToast();

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingStatus, setEditingStatus] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [printing, setPrinting] = useState(false);

  const handlePrintReceipt = async () => {
    if (!order) return;
    setPrinting(true);
    try {
      showToast({ title: 'Printing', message: 'Sending receipt to thermal printer...', type: 'info' });
      const success = await printThermalReceipt(order, true);
      if (success) {
        showToast({ title: 'Success', message: 'Receipt printed successfully.', type: 'success' });
      } else {
        showToast({ title: 'Print Cancelled', message: 'Receipt print cancelled or printer unavailable.', type: 'warning' });
      }
    } catch (e) {
      showToast({ title: 'Print Error', message: 'Failed to print receipt.', type: 'error' });
    } finally {
      setPrinting(false);
    }
  };

  const fetchOrderDetail = async () => {
    if (!orderId) return;
    try {
      setLoading(true);
      const res = await orderService.getOrderById(orderId);
      if (res.success && res.data) {
        setOrder(res.data);
        return;
      }

      // Fallback: search in recent orders if the single order endpoint is not deployed yet
      const fallbackRes = await orderService.getAllOrders({ limit: 100 });
      if (fallbackRes.success && fallbackRes.data) {
        const found = fallbackRes.data.find((o) => o._id === orderId);
        if (found) {
          setOrder(found);
          return;
        }
      }

      showToast({ title: 'Error', message: 'Order not found.', type: 'error' });
    } catch (e) {
      console.error('Failed fetching order details:', e);
      showToast({ title: 'Error', message: 'Could not load order details.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrderDetail();
  }, [orderId]);

  const handleUpdateStatus = async (newStatus: string) => {
    if (!order || newStatus === order.status) {
      setEditingStatus(false);
      return;
    }
    setUpdatingStatus(true);
    try {
      const res = await orderService.updateOrderStatus(order._id, newStatus);
      if (res.success) {
        showToast({ title: 'Success', message: `Order status updated to '${newStatus}'.`, type: 'success' });
        const updatedOrder = { ...order, status: newStatus as any };
        if (newStatus === 'delivered' && order.paymentType === 'cash') {
          updatedOrder.paymentStatus = 'paid';
        }
        setOrder(updatedOrder);

        // Auto-print thermal receipt after accepting order ('preparing')
        if (newStatus === 'preparing') {
          const autoPrint = await isAutoPrintEnabled();
          if (autoPrint) {
            console.log('[OrderDetails] Order accepted. Auto-printing receipt...');
            await printThermalReceipt(updatedOrder);
          }
        }
      } else {
        showToast({ title: 'Error', message: res.message || 'Failed to update order status.', type: 'error' });
      }
    } catch (e) {
      showToast({ title: 'Error', message: 'Failed to update order status.', type: 'error' });
    } finally {
      setUpdatingStatus(false);
      setEditingStatus(false);
    }
  };

  const handleAssignConfirm = async (deliveryPartnerId: string) => {
    if (!order) return;
    const res = await orderService.assignDeliveryPartner(order._id, deliveryPartnerId);
    if (res.success) {
      showToast({ title: 'Success', message: 'Delivery partner successfully assigned.', type: 'success' });
      fetchOrderDetail();
    } else {
      showToast({ title: 'Error', message: res.message || 'Failed to assign delivery partner.', type: 'error' });
    }
  };

  const handleOpenInMaps = () => {
    if (!order) return;
    let url = '';
    const coords = order.deliveryAddress?.coordinates?.coordinates;

    if (coords && coords.length === 2) {
      const longitude = coords[0];
      const latitude = coords[1];
      url = Platform.select({
        ios: `maps://?q=${latitude},${longitude}`,
        android: `geo:0,0?q=${latitude},${longitude}`,
        default: `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`,
      });
    } else {
      url = Platform.select({
        ios: `maps://?q=${encodeURIComponent(addressText)}`,
        android: `geo:0,0?q=${encodeURIComponent(addressText)}`,
        default: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressText)}`,
      });
    }

    if (url) {
      Linking.openURL(url).catch(() => {
        showToast({ title: 'Error', message: 'Could not open maps application.', type: 'error' });
      });
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Order Details" showBackButton={true} />
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading order details...</Text>
        </View>
      </View>
    );
  }

  if (!order) {
    return (
      <View style={styles.container}>
        <Header title="Order Details" showBackButton={true} />
        <View style={styles.centerBox}>
          <Text style={styles.emptyTitle}>Order Not Found</Text>
        </View>
      </View>
    );
  }

  const restaurantName =
    typeof order.restaurantId === 'object'
      ? order.restaurantId?.restaurantName || 'Unknown Restaurant'
      : 'Restaurant';

  const customerName =
    typeof order.customerId === 'object'
      ? order.customerId?.fullName || order.customerDetails?.name || 'Customer'
      : order.customerDetails?.name || 'Customer';

  const customerPhone =
    typeof order.customerId === 'object'
      ? order.customerId?.phoneNumber || order.customerDetails?.phoneNumber
      : order.customerDetails?.phoneNumber;

  const orderTypeRaw = String(order.orderType || (order as any).fulfillmentType || '').toLowerCase();
  const isDeliveryOrder = orderTypeRaw === 'delivery' || (!orderTypeRaw && !!order.deliveryAddress && typeof order.deliveryAddress === 'object');

  const deliveryPartner =
    typeof order.assignedDeliveryPartnerId === 'object'
      ? order.assignedDeliveryPartnerId
      : undefined;

  const addressText =
    typeof order.deliveryAddress === 'object'
      ? order.deliveryAddress?.addressLine1 || order.deliveryAddress?.formattedAddress || 'Self Pickup'
      : order.deliveryAddress || 'Self Pickup';

  const orderedItemsList = order.orderedItems || [];

  const totalAmt =
    order.pricing?.totalAmount ??
    order.pricing?.total ??
    order.totalAmount ??
    order.totalPrice ??
    orderedItemsList.reduce(
      (acc, item) => acc + (item.price || (item as any).basePrice || 0) * (item.quantity || 1),
      0
    );

  return (
    <View style={styles.container}>
      <Header
        title={`Order #${order.orderNumber || order._id?.substring(0, 8)}`}
        subtitle="Super Admin Full Order View"
        showBackButton={true}
      />

      <ScrollView style={styles.scrollBody} showsVerticalScrollIndicator={false}>
        {/* Dropdown Status Selector Card */}
        {order.status === 'placed' ? (
          <View style={styles.acceptActionsRow}>
            <TouchableOpacity
              style={styles.acceptButton}
              onPress={() => handleUpdateStatus('preparing')}
              disabled={updatingStatus}
            >
              {updatingStatus ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.acceptButtonText}>Accept Order</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.rejectButton}
              onPress={() => handleUpdateStatus('cancelled')}
              disabled={updatingStatus}
            >
              <Text style={styles.rejectButtonText}>Reject</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ marginBottom: 14 }}>
            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: Colors.card,
                borderRadius: 12,
                borderWidth: 1.2,
                borderColor: Colors.cardBorder,
                paddingHorizontal: 14,
                paddingVertical: 10,
              }}
              onPress={() => setEditingStatus(!editingStatus)}
              activeOpacity={0.8}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                <Text style={{ color: Colors.textMuted, fontSize: 12, fontWeight: '700' }}>Status:</Text>
                <StatusBadge status={order.status} type="order" />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.primaryLight, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
                <Text style={{ color: Colors.primary, fontSize: 11, fontWeight: '700' }}>
                  {editingStatus ? 'Close' : 'Change Status'}
                </Text>
                {editingStatus ? <ChevronUp size={15} color={Colors.primary} /> : <ChevronDown size={15} color={Colors.primary} />}
              </View>
            </TouchableOpacity>

            {editingStatus && (
              <View
                style={{
                  backgroundColor: Colors.card,
                  borderRadius: 12,
                  borderWidth: 1.2,
                  borderColor: Colors.primary,
                  marginTop: 6,
                  padding: 6,
                  elevation: 4,
                }}
              >
                {STATUS_DROPDOWN_OPTIONS.map((opt) => {
                  const isSelected = order.status === opt.value;
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      disabled={updatingStatus}
                      style={[
                        {
                          flexDirection: 'row',
                          alignItems: 'center',
                          paddingHorizontal: 12,
                          paddingVertical: 10,
                          borderRadius: 8,
                          marginVertical: 1,
                        },
                        isSelected && { backgroundColor: '#F3F4F6' },
                      ]}
                      onPress={() => handleUpdateStatus(opt.value)}
                      activeOpacity={0.7}
                    >
                      <Text style={{ fontSize: 16, marginRight: 10 }}>{opt.icon}</Text>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            { color: Colors.text, fontSize: 13, fontWeight: '700' },
                            isSelected && { color: Colors.primary },
                          ]}
                        >
                          {opt.label}
                        </Text>
                        <Text style={{ color: Colors.textMuted, fontSize: 11, marginTop: 1 }}>
                          {opt.sub}
                        </Text>
                      </View>
                      {isSelected && <Check size={16} color="#10B981" style={{ marginLeft: 8 }} />}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* Restaurant Information Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Store size={16} color={Colors.primary} />
            <Text style={styles.cardTitle}>Restaurant Details</Text>
          </View>
          <Text style={styles.infoName}>{restaurantName}</Text>
        </View>

        {/* Customer Information Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <User size={16} color={Colors.info} />
            <Text style={styles.cardTitle}>Customer Information</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoName}>{customerName}</Text>
              {customerPhone ? <Text style={styles.infoText}>Phone: {customerPhone}</Text> : null}
            </View>
            {customerPhone ? (
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#2563EB', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16 }}
                onPress={() => Linking.openURL(`tel:${customerPhone}`)}
              >
                <Phone size={12} color="#FFFFFF" />
                <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700' }}>Call Customer</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={styles.divider} />

          <View style={styles.addressRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 10 }}>
              <MapPin size={16} color={Colors.textSubtle} style={{ marginRight: 8 }} />
              <Text style={styles.addressText} numberOfLines={2}>{addressText}</Text>
            </View>
            <TouchableOpacity
              style={styles.navigateBtn}
              onPress={handleOpenInMaps}
              activeOpacity={0.7}
            >
              <Navigation size={12} color="#FFFFFF" />
              <Text style={styles.navigateBtnText}>Navigate</Text>
            </TouchableOpacity>
          </View>

          {order.notes ? (
            <View style={styles.notesBox}>
              <Text style={styles.notesTitle}>Special Instructions / Notes:</Text>
              <Text style={styles.notesText}>{order.notes}</Text>
            </View>
          ) : null}
        </View>

        {/* Items & Pricing Breakdown Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Order Items</Text>
          {orderedItemsList.map((item, idx) => {
            const itemName = item.name || (item as any).itemName || 'Item';
            const itemPrice = item.price || (item as any).basePrice || 0;
            const itemQty = item.quantity || 1;
            const itemTotal = (item as any).itemTotal || itemPrice * itemQty;

            return (
              <View key={idx} style={styles.itemRow}>
                <View style={styles.itemQtyBadge}>
                  <Text style={styles.itemQtyText}>{itemQty}x</Text>
                </View>
                <View style={styles.itemInfo}>
                  <Text style={styles.itemName}>{itemName}</Text>
                  {item.customization?.size ? (
                    <Text style={styles.itemMeta}>Size: {item.customization.size}</Text>
                  ) : null}
                  {item.customization?.addOns && item.customization.addOns.length > 0 ? (
                    <Text style={styles.itemMeta}>
                      Add-ons: {item.customization.addOns.join(', ')}
                    </Text>
                  ) : null}
                </View>
                <Text style={styles.itemPrice}>£{itemTotal.toFixed(2)}</Text>
              </View>
            );
          })}

          <View style={styles.divider} />

          {/* Price Breakdown */}
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>Subtotal:</Text>
            <Text style={styles.priceVal}>
              £{(order.pricing?.subtotal || 0).toFixed(2)}
            </Text>
          </View>

          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>Delivery Fee:</Text>
            <Text style={styles.priceVal}>
              {(order.pricing?.deliveryFee || order.deliveryFee || 0) === 0 ? 'FREE' : `£${(order.pricing?.deliveryFee || order.deliveryFee || 0).toFixed(2)}`}
            </Text>
          </View>

          {order.pricing?.tax || order.taxAmount ? (
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Tax & Charges:</Text>
              <Text style={styles.priceVal}>
                £{(order.pricing?.tax || order.taxAmount || 0).toFixed(2)}
              </Text>
            </View>
          ) : null}

          {order.pricing?.discount || order.pricing?.discountAmount ? (
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Discount:</Text>
              <Text style={[styles.priceVal, { color: Colors.success }]}>
                -£{(order.pricing?.discount || order.pricing?.discountAmount || 0).toFixed(2)}
              </Text>
            </View>
          ) : null}

          <View style={[styles.priceRow, styles.totalPriceRow]}>
            <Text style={styles.totalLabel}>Total Payable:</Text>
            <Text style={styles.totalVal}>£{totalAmt.toFixed(2)}</Text>
          </View>
        </View>

        {/* Payment Method Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <CreditCard size={16} color={Colors.primary} />
            <Text style={styles.cardTitle}>Payment Method</Text>
          </View>
          
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
              <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' }}>
                {(order.paymentType || 'cash').toLowerCase() === 'cash' ? (
                  <Banknote size={18} color="#16A34A" />
                ) : (
                  <CreditCard size={18} color="#2563EB" />
                )}
              </View>
              <View>
                <Text style={{ color: Colors.text, fontSize: 14, fontWeight: '800' }}>
                  {(order.paymentType || 'Cash').toUpperCase()}
                </Text>
                <Text style={{ color: Colors.textMuted, fontSize: 11, marginTop: 1 }}>
                  {(order.paymentType || 'cash').toLowerCase() === 'cash'
                    ? 'Pay on fulfillment / COD'
                    : 'Processed via Stripe'}
                </Text>
              </View>
            </View>

            <View
              style={[
                { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, borderWidth: 1 },
                order.paymentStatus === 'paid' || order.status === 'delivered'
                  ? { backgroundColor: '#DCFCE7', borderColor: '#86EFAC' }
                  : { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' },
              ]}
            >
              <Text
                style={[
                  { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
                  order.paymentStatus === 'paid' || order.status === 'delivered'
                    ? { color: '#15803D' }
                    : { color: '#B45309' },
                ]}
              >
                {order.paymentStatus === 'paid' || order.status === 'delivered' ? 'PAID' : (order.paymentStatus || 'PENDING').toUpperCase()}
              </Text>
            </View>
          </View>
        </View>

        {/* Driver Details Card (Only for Delivery Orders) */}
        {isDeliveryOrder && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Bike size={16} color={Colors.primary} />
              <Text style={styles.cardTitle}>Assigned Delivery Partner</Text>
            </View>

            {deliveryPartner ? (
              <View style={styles.driverInfoBox}>
                <Text style={styles.infoName}>{deliveryPartner.fullName}</Text>
                {deliveryPartner.phoneNumber ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 }}>
                    <Text style={styles.infoText}>Phone: {deliveryPartner.phoneNumber}</Text>
                    <TouchableOpacity
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#2563EB', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 }}
                      onPress={() => Linking.openURL(`tel:${deliveryPartner.phoneNumber}`)}
                    >
                      <Phone size={11} color="#FFFFFF" />
                      <Text style={{ color: '#FFFFFF', fontSize: 10.5, fontWeight: '800' }}>Call Rider</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
                {deliveryPartner.vehicleNumber ? (
                  <Text style={styles.infoText}>Vehicle: {deliveryPartner.vehicleNumber}</Text>
                ) : null}
              </View>
            ) : (
              <Text style={styles.unassignedText}>No delivery partner assigned yet.</Text>
            )}
          </View>
        )}

        {/* Assign / Reassign Driver Button (Only for Delivery Orders) */}
        {isDeliveryOrder && order.status !== 'delivered' && order.status !== 'cancelled' && (
          <TouchableOpacity
            style={styles.assignDriverBtn}
            onPress={() => setAssignModalVisible(true)}
          >
            <Bike size={18} color="#FFFFFF" />
            <Text style={styles.assignDriverText}>
              {deliveryPartner ? 'Reassign Delivery Partner' : 'Assign Delivery Partner'}
            </Text>
          </TouchableOpacity>
        )}
        {/* Bottom Spacer */}
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Assign Delivery Partner Modal */}
      <AssignDeliveryModal
        visible={assignModalVisible}
        order={order}
        onClose={() => setAssignModalVisible(false)}
        onConfirmAssign={handleAssignConfirm}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  loadingText: {
    color: Colors.textMuted,
    fontSize: 14,
    marginTop: 12,
  },
  emptyTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  scrollBody: {
    padding: 16,
  },
  statusBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 12,
    borderColor: Colors.cardBorder,
    borderWidth: 1,
    padding: 12,
    marginBottom: 12,
  },
  statusBoxLabel: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  statusBoxDate: {
    color: Colors.textSubtle,
    fontSize: 11,
    marginTop: 2,
  },
  editStatusBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: Colors.primaryLight,
  },
  editStatusBtnText: {
    color: Colors.primary,
    fontSize: 11,
    fontWeight: '700',
  },
  statusPickerCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    borderColor: Colors.primary,
    borderWidth: 1,
    padding: 12,
    marginBottom: 12,
  },
  statusPickerTitle: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
  },
  statusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  statusChipSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  statusChipText: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  statusChipTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    borderColor: Colors.cardBorder,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  cardTitle: {
    color: Colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoName: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  infoText: {
    color: Colors.textMuted,
    fontSize: 13,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.cardBorder,
    marginVertical: 10,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  addressText: {
    color: Colors.text,
    fontSize: 13,
    flex: 1,
  },
  navigateBtn: {
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  navigateBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  notesBox: {
    backgroundColor: Colors.background,
    padding: 8,
    borderRadius: 6,
    marginTop: 10,
  },
  notesTitle: {
    color: Colors.textSubtle,
    fontSize: 11,
    fontWeight: '600',
  },
  notesText: {
    color: Colors.warning,
    fontSize: 12,
    marginTop: 2,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  itemQtyBadge: {
    backgroundColor: Colors.background,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 8,
  },
  itemQtyText: {
    color: Colors.primary,
    fontWeight: '700',
    fontSize: 12,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  itemMeta: {
    color: Colors.textSubtle,
    fontSize: 11,
  },
  itemPrice: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 2,
  },
  priceLabel: {
    color: Colors.textSubtle,
    fontSize: 13,
  },
  priceVal: {
    color: Colors.text,
    fontSize: 13,
  },
  totalPriceRow: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.cardBorder,
  },
  totalLabel: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  totalVal: {
    color: Colors.primary,
    fontSize: 18,
    fontWeight: '800',
  },
  driverInfoBox: {
    backgroundColor: Colors.background,
    padding: 10,
    borderRadius: 8,
  },
  unassignedText: {
    color: Colors.textSubtle,
    fontSize: 13,
    fontStyle: 'italic',
  },
  assignDriverBtn: {
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 30,
  },
  assignDriverText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
  acceptActionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  acceptButton: {
    flex: 2,
    backgroundColor: '#16A34A', // success green
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  acceptButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  rejectButton: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EF4444',
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rejectButtonText: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '700',
  },
  printCardBtn: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  printCardBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  thermalBadge: {
    backgroundColor: '#334155',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  thermalBadgeText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '800',
  },
});

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Header } from '../components/Header';
import { AssignDeliveryModal } from '../components/AssignDeliveryModal';
import { OrderDetailView } from '../components/order/OrderDetailView';
import { EditExpectedTimeModal } from '../components/order/EditExpectedTimeModal';
import { useOrderPrint, usePaperRollSize } from '../components/order/useOrderPrint';
import { Colors } from '../constants/colors';
import { orderService, type ManualPaymentStatus } from '../services/order.service';
import { isAutoPrintEnabled, printThermalReceipt } from '../services/thermal-print.service';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { getOrderStatusLabel } from '../utils/order-status';
import { Order } from '../types';

/**
 * Full-screen order details (opened from Home, Action Needed and Notifications).
 * Same UI as the Orders-tab sheet via the shared `OrderDetailView`.
 */
export default function OrderDetailsScreen() {
  const router = useRouter();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const { showToast } = useToast();
  const { user } = useAuth();
  const isOwner = user?.userType !== 'super_admin';
  const { printing, print } = useOrderPrint();
  const paperRollSize = usePaperRollSize();

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [assignVisible, setAssignVisible] = useState(false);
  const [editTimeVisible, setEditTimeVisible] = useState(false);

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/orders');
  }, [router]);

  const fetchOrder = useCallback(async () => {
    if (!orderId) return;
    try {
      const res = await orderService.getOrderById(orderId);
      if (res.success && res.data) {
        setOrder(res.data);
        return;
      }
      // Fallback: look in recent orders if the single-order endpoint fails.
      const all = await orderService.fetchAllOrders();
      const found = all.success ? all.data?.find((o) => o._id === orderId) : undefined;
      if (found) setOrder(found);
      else showToast({ title: 'Error', message: 'Order not found.', type: 'error' });
    } catch (e) {
      console.error('Failed fetching order details:', e);
      showToast({ title: 'Error', message: 'Could not load order details.', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [orderId, showToast]);

  useEffect(() => {
    setLoading(true);
    fetchOrder();
  }, [fetchOrder]);

  const updateStatus = async (status: string) => {
    if (!order) return;
    const res = await orderService.updateOrderStatus(order._id, status);
    if (!res.success) {
      showToast({ title: 'Update failed', message: res.message || 'Failed to update order status.', type: 'error' });
      return;
    }
    const updated: Order = { ...order, status: status as any, ...(res.data || {}) };
    if (status === 'delivered' && order.paymentType === 'cash') updated.paymentStatus = 'paid';
    if (status !== 'placed' && status !== 'cancelled' && (!order.acceptanceStatus || order.acceptanceStatus === 'pending')) {
      updated.acceptanceStatus = 'accepted';
      updated.acceptedAt = updated.acceptedAt || new Date().toISOString();
    }
    setOrder(updated);
    showToast({ title: `Order ${getOrderStatusLabel(status)}`, message: `#${order.orderNumber || ''} updated.`, type: 'success' });

    // Same as accepting on the Orders board: print the kitchen ticket if auto-print is on.
    if (status === 'preparing') {
      try {
        if (await isAutoPrintEnabled()) await printThermalReceipt(updated, false, undefined, undefined, 'accepted');
      } catch (e) {
        console.error('[OrderDetails] Auto-print failed:', e);
      }
    }
  };

  const updatePaymentStatus = async (paymentStatus: ManualPaymentStatus) => {
    if (!order) return;
    const res = await orderService.updatePaymentStatus(order._id, paymentStatus);
    if (!res.success) {
      showToast({ title: 'Payment not updated', message: res.message || 'Could not update the payment status.', type: 'error' });
      return;
    }
    setOrder({ ...order, paymentStatus, ...(res.data || {}) } as Order);
    showToast({ title: 'Payment updated', message: res.message || `#${order.orderNumber || ''} marked ${paymentStatus}.`, type: 'success' });
  };

  const cancelOrder = async () => {
    if (!order) return;
    const res = await orderService.updateOrderStatus(order._id, 'cancelled');
    if (!res.success) throw new Error(res.message || 'Failed to cancel order.');
    setOrder({ ...order, status: 'cancelled', ...(res.data || {}) });
    showToast({ title: 'Order cancelled', message: `#${order.orderNumber || ''} was cancelled.`, type: 'success' });
  };

  const assignRider = async (deliveryPartnerId: string) => {
    if (!order) return;
    const res = await orderService.assignDeliveryPartner(order._id, deliveryPartnerId);
    if (res.success) {
      showToast({ title: 'Rider assigned', message: 'Delivery partner successfully assigned.', type: 'success' });
      fetchOrder();
    } else {
      showToast({ title: 'Error', message: res.message || 'Failed to assign delivery partner.', type: 'error' });
    }
  };

  if (loading || !order) {
    return (
      <View style={styles.container}>
        <Header title="Order Details" showBackButton />
        <View style={styles.center}>
          {loading ? (
            <>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={styles.muted}>Loading order details…</Text>
            </>
          ) : (
            <>
              <Text style={styles.emptyTitle}>Order not found</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={() => { setLoading(true); fetchOrder(); }}>
                <Text style={styles.retryText}>Try again</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <OrderDetailView
        order={order}
        variant="screen"
        onClose={goBack}
        onUpdateStatus={updateStatus}
        onUpdatePaymentStatus={isOwner ? updatePaymentStatus : undefined}
        onCancelOrder={cancelOrder}
        onAssignDelivery={() => setAssignVisible(true)}
        onEditDeliveryTime={() => setEditTimeVisible(true)}
        onPrint={() => print(order)}
        printing={printing}
        paperRollSize={paperRollSize}
      />

      <AssignDeliveryModal
        visible={assignVisible}
        order={order}
        onClose={() => setAssignVisible(false)}
        onConfirmAssign={assignRider}
      />

      <EditExpectedTimeModal
        visible={editTimeVisible}
        order={order}
        onClose={() => setEditTimeVisible(false)}
        onSaved={(_, patch) => setOrder((prev) => (prev ? { ...prev, ...patch } : prev))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F5F7' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30, gap: 12 },
  muted: { color: Colors.textMuted, fontSize: 14 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: Colors.text },
  retryBtn: { paddingHorizontal: 18, minHeight: 44, borderRadius: 10, backgroundColor: Colors.primary, justifyContent: 'center' },
  retryText: { color: '#FFFFFF', fontWeight: '700' },
});

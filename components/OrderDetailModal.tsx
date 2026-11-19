import React from 'react';
import { Modal, View, StyleSheet, TouchableOpacity, useWindowDimensions } from 'react-native';
import { Order } from '../types';
import { orderService, type ManualPaymentStatus } from '../services/order.service';
import { useToast } from '../context/ToastContext';
import { OrderDetailView } from './order/OrderDetailView';
import { useOrderPrint } from './order/useOrderPrint';

interface OrderDetailModalProps {
  visible: boolean;
  order: Order | null;
  onClose: () => void;
  onAssignDelivery: (order: Order) => void;
  onUpdateStatus?: (orderId: string, status: string) => Promise<void>;
  /** Owner only: manual payment status. The sheet stays open so the change is visible. */
  onUpdatePaymentStatus?: (orderId: string, status: ManualPaymentStatus) => Promise<void>;
  onCancelOrder?: (orderId: string) => Promise<void>;
  onEditDeliveryTime?: (order: Order) => void;
  paperRollSize?: string;
}

/**
 * Order details as a bottom sheet (phone) / dialog (tablet), used by the Orders tab.
 * Content lives in `OrderDetailView`, shared with the full-screen `app/order-details.tsx`.
 */
export const OrderDetailModal: React.FC<OrderDetailModalProps> = ({
  visible,
  order: propOrder,
  onClose,
  onAssignDelivery,
  onUpdateStatus,
  onUpdatePaymentStatus,
  onCancelOrder,
  onEditDeliveryTime,
  paperRollSize = '58',
}) => {
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const { showToast } = useToast();
  const { printing, print } = useOrderPrint();
  const [fetchedOrder, setFetchedOrder] = React.useState<Order | null>(null);
  const [loading, setLoading] = React.useState(false);

  // Load the full order (list payloads can be partial).
  React.useEffect(() => {
    if (visible && propOrder?._id) {
      let cancelled = false;
      setLoading(true);
      orderService
        .getOrderById(propOrder._id)
        .then((res) => !cancelled && setFetchedOrder(res.success && res.data ? res.data : propOrder))
        .catch((e) => {
          console.error('Failed fetching order details in modal:', e);
          if (!cancelled) setFetchedOrder(propOrder);
        })
        .finally(() => !cancelled && setLoading(false));
      return () => {
        cancelled = true;
      };
    }
    if (!visible) setFetchedOrder(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, propOrder?._id]);

  // Edits made on the board while the sheet is open (status, expected time…) arrive via props;
  // overlay just those fields so the freshly fetched full order doesn't hide them.
  const order: Order | null =
    fetchedOrder && propOrder && fetchedOrder._id === propOrder._id
      ? {
          ...fetchedOrder,
          status: propOrder.status,
          acceptanceStatus: propOrder.acceptanceStatus ?? fetchedOrder.acceptanceStatus,
          acceptedAt: propOrder.acceptedAt ?? fetchedOrder.acceptedAt,
          paymentStatus: propOrder.paymentStatus ?? fetchedOrder.paymentStatus,
          expectedDeliveryTime: propOrder.expectedDeliveryTime ?? fetchedOrder.expectedDeliveryTime,
          deliveryTime: propOrder.deliveryTime ?? fetchedOrder.deliveryTime,
        }
      : fetchedOrder || propOrder;
  if (!order) return null;

  const handleUpdateStatus = async (status: string) => {
    if (!onUpdateStatus) return;
    await onUpdateStatus(order._id, status);
    onClose();
  };

  const handleUpdatePaymentStatus = async (status: ManualPaymentStatus) => {
    if (!onUpdatePaymentStatus) return;
    await onUpdatePaymentStatus(order._id, status);
  };

  const handleCancel = async () => {
    if (onCancelOrder) await onCancelOrder(order._id);
    else if (onUpdateStatus) await onUpdateStatus(order._id, 'cancelled');
    else {
      await orderService.updateOrderStatus(order._id, 'cancelled');
      showToast({ title: 'Order cancelled', message: `#${order.orderNumber || ''} was cancelled.`, type: 'success' });
    }
    onClose();
  };

  return (
    <Modal visible={visible} animationType={isTablet ? 'fade' : 'slide'} transparent onRequestClose={onClose}>
      <View style={[styles.overlay, isTablet && styles.overlayTablet]}>
        {!isTablet && <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close order details" />}
        <View style={[styles.sheet, isTablet && styles.sheetTablet]}>
          {!isTablet && <View style={styles.grabber} />}
          <OrderDetailView
            order={order}
            variant="sheet"
            loading={loading}
            onClose={onClose}
            onUpdateStatus={onUpdateStatus ? handleUpdateStatus : undefined}
            onUpdatePaymentStatus={onUpdatePaymentStatus ? handleUpdatePaymentStatus : undefined}
            onCancelOrder={handleCancel}
            onAssignDelivery={() => {
              onClose();
              onAssignDelivery(order);
            }}
            onEditDeliveryTime={onEditDeliveryTime ? () => onEditDeliveryTime(order) : undefined}
            onPrint={() => print(order)}
            printing={printing}
            paperRollSize={paperRollSize}
          />
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(17, 24, 28, 0.5)', justifyContent: 'flex-end' },
  overlayTablet: { justifyContent: 'center', alignItems: 'center', padding: 24 },
  sheet: {
    backgroundColor: '#F4F5F7',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '92%',
    overflow: 'hidden',
  },
  sheetTablet: {
    width: '100%',
    maxWidth: 640,
    maxHeight: '88%',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 12,
  },
  grabber: {
    position: 'absolute',
    top: 6,
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(17,24,28,0.2)',
    zIndex: 2,
  },
});

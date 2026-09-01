import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Order } from '../types';
import { Colors } from '../constants/colors';
import { StatusBadge } from './StatusBadge';
import { ShoppingBag, Store, User, Bike, ChevronRight, CheckCircle2, X } from 'lucide-react-native';

interface OrderCardProps {
  order: Order;
  onPress: (order: Order) => void;
  onAssignDelivery: (order: Order) => void;
}

export const OrderCard: React.FC<OrderCardProps> = ({ order, onPress, onAssignDelivery }) => {
  const restaurantName = typeof order.restaurantId === 'object'
    ? order.restaurantId?.restaurantName || 'Unknown Restaurant'
    : 'Restaurant';

  const customerName = typeof order.customerId === 'object'
    ? order.customerId?.fullName || order.customerDetails?.name || 'Customer'
    : order.customerDetails?.name || 'Customer';

  const deliveryPartnerName = typeof order.assignedDeliveryPartnerId === 'object'
    ? order.assignedDeliveryPartnerId?.fullName
    : undefined;

  const formattedDate = order.createdAt
    ? new Date(order.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })
    : '';

  const orderedItemsList = order.orderedItems || [];

  const totalAmount =
    order.pricing?.totalAmount ??
    order.pricing?.total ??
    order.totalAmount ??
    order.totalPrice ??
    orderedItemsList.reduce(
      (acc, item) => acc + (item.price || (item as any).basePrice || (item as any).itemTotal || 0) * (item.quantity || 1),
      0
    );

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={() => onPress(order)}
      style={styles.card}
    >
      {/* Watermark Stamp Overlay */}
      {order.status === 'delivered' && (
        <View style={styles.stampOverlay} pointerEvents="none">
          <View style={[styles.stampBox, styles.stampSuccess]}>
            <CheckCircle2 size={12} color="#10B981" style={{ marginRight: 3 }} />
            <Text style={[styles.stampText, styles.stampSuccessText]}>SUCCESS</Text>
          </View>
        </View>
      )}

      {order.status === 'cancelled' && (
        <View style={styles.stampOverlay} pointerEvents="none">
          <View style={[styles.stampBox, styles.stampCancelled]}>
            <X size={12} color="#EF4444" style={{ marginRight: 3 }} />
            <Text style={[styles.stampText, styles.stampCancelledText]}>CANCELLED</Text>
          </View>
        </View>
      )}

      <View style={styles.header}>
        <View style={styles.orderIdBox}>
          <ShoppingBag size={14} color={Colors.primary} />
          <Text style={styles.orderIdText}>#{order.orderNumber || order._id?.substring(0, 8)}</Text>
        </View>

        <StatusBadge status={order.status} type="order" />
      </View>

      <View style={styles.divider} />

      <View style={styles.body}>
        <View style={styles.row}>
          <Store size={14} color={Colors.textSubtle} style={styles.icon} />
          <Text style={styles.restaurantText} numberOfLines={1}>
            {restaurantName}
          </Text>
        </View>

        <View style={styles.row}>
          <User size={14} color={Colors.textSubtle} style={styles.icon} />
          <Text style={styles.customerText} numberOfLines={1}>
            {customerName}
          </Text>
        </View>

        <View style={styles.itemsSummaryRow}>
          <Text style={styles.itemsCount}>
            {orderedItemsList.length} item{orderedItemsList.length !== 1 ? 's' : ''}:
          </Text>
          <Text style={styles.itemsText} numberOfLines={1}>
            {orderedItemsList.map((item) => `${item.name || (item as any).itemName} x${item.quantity}`).join(', ')}
          </Text>
        </View>
      </View>

      <View style={styles.divider} />

      <View style={styles.footer}>
        <View style={styles.footerAmountContainer}>
          <Text style={styles.totalLabel}>Total Amount</Text>
          <Text style={styles.totalValue}>€{(totalAmount || 0).toFixed(2)}</Text>
        </View>

        <View style={styles.footerRight}>
          {order.status !== 'delivered' && order.status !== 'cancelled' ? (
            <TouchableOpacity
              style={styles.assignBtn}
              onPress={(e) => {
                e.stopPropagation();
                onAssignDelivery(order);
              }}
            >
              <Bike size={14} color="#FFFFFF" />
              <Text style={styles.assignBtnText}>
                {deliveryPartnerName ? 'Reassign Driver' : 'Assign Driver'}
              </Text>
            </TouchableOpacity>
          ) : deliveryPartnerName ? (
            <View style={styles.driverAssignedBadge}>
              <Bike size={12} color={Colors.textMuted} />
              <Text style={styles.driverText}>{deliveryPartnerName}</Text>
            </View>
          ) : null}

          <ChevronRight size={18} color={Colors.textSubtle} />
        </View>
      </View>

      {formattedDate ? <Text style={styles.dateText}>{formattedDate}</Text> : null}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    borderColor: '#EEEEEE',
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  orderIdBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  orderIdText: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  divider: {
    height: 1,
    backgroundColor: Colors.cardBorder,
    marginVertical: 10,
  },
  body: {
    gap: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    marginRight: 8,
  },
  restaurantText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  customerText: {
    color: Colors.text,
    fontSize: 13,
    flex: 1,
  },
  itemsSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  itemsCount: {
    color: Colors.textSubtle,
    fontSize: 12,
    fontWeight: '600',
  },
  itemsText: {
    color: Colors.textMuted,
    fontSize: 12,
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerAmountContainer: {
    justifyContent: 'center',
  },
  totalLabel: {
    color: Colors.textSubtle,
    fontSize: 11,
    textTransform: 'uppercase',
  },
  totalValue: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  footerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  assignBtn: {
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  assignBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  driverAssignedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  driverText: {
    color: Colors.textMuted,
    fontSize: 12,
  },
  dateText: {
    color: Colors.textSubtle,
    fontSize: 10,
    marginTop: 6,
    textAlign: 'right',
  },

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
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    transform: [{ rotate: '-12deg' }],
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
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  stampSuccessText: {
    color: '#10B981',
  },
  stampCancelledText: {
    color: '#EF4444',
  },
});

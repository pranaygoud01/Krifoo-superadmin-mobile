import React from 'react';
import { Modal, View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Order } from '../types';
import { Colors } from '../constants/colors';
import { StatusBadge } from './StatusBadge';
import { X, Store, User, MapPin, Bike, CreditCard } from 'lucide-react-native';

interface OrderDetailModalProps {
  visible: boolean;
  order: Order | null;
  onClose: () => void;
  onAssignDelivery: (order: Order) => void;
  onUpdateStatus?: (orderId: string, status: string) => Promise<void>;
}

export const OrderDetailModal: React.FC<OrderDetailModalProps> = ({
  visible,
  order,
  onClose,
  onAssignDelivery,
  onUpdateStatus,
}) => {
  const [editingStatus, setEditingStatus] = React.useState(false);
  const [loadingStatus, setLoadingStatus] = React.useState(false);

  if (!order) return null;

  const STATUS_OPTIONS = [
    { label: 'Placed', value: 'placed' },
    { label: 'Preparing', value: 'preparing' },
    { label: 'Ready for Pickup', value: 'ready_for_pickup' },
    { label: 'Out for Delivery', value: 'out_for_delivery' },
    { label: 'Delivered', value: 'delivered' },
    { label: 'Cancelled', value: 'cancelled' },
  ];

  const handleStatusSelect = async (newStatus: string) => {
    if (!onUpdateStatus || newStatus === order.status) {
      setEditingStatus(false);
      return;
    }
    setLoadingStatus(true);
    try {
      await onUpdateStatus(order._id, newStatus);
    } finally {
      setLoadingStatus(false);
      setEditingStatus(false);
    }
  };

  const restaurantName = typeof order.restaurantId === 'object'
    ? order.restaurantId?.restaurantName || 'Unknown Restaurant'
    : 'Restaurant';

  const customerName = typeof order.customerId === 'object'
    ? order.customerId?.fullName || order.customerDetails?.name || 'Customer'
    : order.customerDetails?.name || 'Customer';

  const customerPhone = typeof order.customerId === 'object'
    ? order.customerId?.phoneNumber || order.customerDetails?.phoneNumber
    : order.customerDetails?.phoneNumber;

  const deliveryPartner = typeof order.assignedDeliveryPartnerId === 'object'
    ? order.assignedDeliveryPartnerId
    : undefined;

  const addressText = typeof order.deliveryAddress === 'object'
    ? order.deliveryAddress?.addressLine1 || order.deliveryAddress?.formattedAddress || 'Self Pickup'
    : order.deliveryAddress || 'Self Pickup';

  const orderedItemsList = order.orderedItems || [];

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.header}>
            <View>
              <Text style={styles.headerTitle}>Order Details</Text>
              {/* <Text style={styles.headerSub}>ID: #{order._id}</Text> */}
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={20} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scrollBody} showsVerticalScrollIndicator={false}>
            {/* Status Header */}
            <View style={styles.statusBox}>
              <View style={{ flex: 1 }}>
                <Text style={styles.statusBoxLabel}>Current Order Status</Text>
                <Text style={styles.statusBoxDate}>
                  {order.createdAt ? new Date(order.createdAt).toLocaleString() : ''}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                <StatusBadge status={order.status} type="order" />
                <TouchableOpacity
                  style={styles.editStatusBtn}
                  onPress={() => setEditingStatus(!editingStatus)}
                >
                  <Text style={styles.editStatusBtnText}>
                    {editingStatus ? 'Cancel' : 'Edit Status'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Editing Status Picker */}
            {editingStatus && (
              <View style={styles.statusPickerCard}>
                <Text style={styles.statusPickerTitle}>Select New Status:</Text>
                <View style={styles.statusGrid}>
                  {STATUS_OPTIONS.map((opt) => {
                    const isSelected = order.status === opt.value;
                    return (
                      <TouchableOpacity
                        key={opt.value}
                        disabled={loadingStatus}
                        style={[
                          styles.statusChip,
                          isSelected && styles.statusChipSelected,
                        ]}
                        onPress={() => handleStatusSelect(opt.value)}
                      >
                        <Text
                          style={[
                            styles.statusChipText,
                            isSelected && styles.statusChipTextSelected,
                          ]}
                        >
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Restaurant Card */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Store size={16} color={Colors.primary} />
                <Text style={styles.cardTitle}>Restaurant Details</Text>
              </View>
              <Text style={styles.infoName}>{restaurantName}</Text>
            </View>

            {/* Customer & Address */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <User size={16} color={Colors.info} />
                <Text style={styles.cardTitle}>Customer Information</Text>
              </View>
              <Text style={styles.infoName}>{customerName}</Text>
              {customerPhone ? <Text style={styles.infoText}>Phone: {customerPhone}</Text> : null}

              <View style={styles.divider} />

              <View style={styles.addressRow}>
                <MapPin size={16} color={Colors.textSubtle} />
                <Text style={styles.addressText}>{addressText}</Text>
              </View>

              {order.notes ? (
                <View style={styles.notesBox}>
                  <Text style={styles.notesTitle}>Special Instructions / Notes:</Text>
                  <Text style={styles.notesText}>{order.notes}</Text>
                </View>
              ) : null}
            </View>

            {/* Items List */}
            <View style={styles.card}>
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
                    <Text style={styles.itemPrice}>₹{itemTotal.toFixed(2)}</Text>
                  </View>
                );
              })}

              <View style={styles.divider} />

              {/* Price Breakdown */}
              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>Subtotal:</Text>
                <Text style={styles.priceVal}>
                  ₹{(order.pricing?.subtotal || 0).toFixed(2)}
                </Text>
              </View>

              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>Delivery Fee:</Text>
                <Text style={styles.priceVal}>
                  ₹{(order.pricing?.deliveryFee || order.deliveryFee || 0).toFixed(2)}
                </Text>
              </View>

              {(order.pricing?.tax || order.taxAmount) ? (
                <View style={styles.priceRow}>
                  <Text style={styles.priceLabel}>Tax & Charges:</Text>
                  <Text style={styles.priceVal}>
                    ₹{(order.pricing?.tax || order.taxAmount || 0).toFixed(2)}
                  </Text>
                </View>
              ) : null}

              {(order.pricing?.discount || order.pricing?.discountAmount) ? (
                <View style={styles.priceRow}>
                  <Text style={styles.priceLabel}>Discount:</Text>
                  <Text style={[styles.priceVal, { color: Colors.success }]}>
                    -₹{(order.pricing?.discount || order.pricing?.discountAmount || 0).toFixed(2)}
                  </Text>
                </View>
              ) : null}

              <View style={[styles.priceRow, styles.totalPriceRow]}>
                <Text style={styles.totalLabel}>Total Payable:</Text>
                <Text style={styles.totalVal}>
                  ₹{(
                    order.pricing?.totalAmount ??
                    order.pricing?.total ??
                    order.totalAmount ??
                    order.totalPrice ??
                    0
                  ).toFixed(2)}
                </Text>
              </View>
            </View>

            {/* Payment & Delivery Partner */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <CreditCard size={16} color={Colors.warning} />
                <Text style={styles.cardTitle}>Payment Method</Text>
              </View>
              <Text style={styles.infoName}>
                {(order.paymentType || 'Cash').toUpperCase()} ({order.paymentStatus || 'pending'})
              </Text>

              <View style={styles.divider} />

              <View style={styles.cardHeader}>
                <Bike size={16} color={Colors.primary} />
                <Text style={styles.cardTitle}>Assigned Delivery Partner</Text>
              </View>

              {deliveryPartner ? (
                <View style={styles.driverInfoBox}>
                  <Text style={styles.infoName}>{deliveryPartner.fullName}</Text>
                  {deliveryPartner.phoneNumber ? (
                    <Text style={styles.infoText}>Phone: {deliveryPartner.phoneNumber}</Text>
                  ) : null}
                  {deliveryPartner.vehicleNumber ? (
                    <Text style={styles.infoText}>Vehicle: {deliveryPartner.vehicleNumber}</Text>
                  ) : null}
                </View>
              ) : (
                <Text style={styles.unassignedText}>No delivery partner assigned yet.</Text>
              )}
            </View>
          </ScrollView>

          {/* Footer Action */}
          {order.status !== 'delivered' && order.status !== 'cancelled' && (
            <View style={styles.footerAction}>
              <TouchableOpacity
                style={styles.assignDriverBtn}
                onPress={() => {
                  onClose();
                  onAssignDelivery(order);
                }}
              >
                <Bike size={18} color="#FFFFFF" />
                <Text style={styles.assignDriverText}>
                  {deliveryPartner ? 'Reassign Delivery Partner' : 'Assign Delivery Partner'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 28, 0.45)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    paddingBottom: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  headerTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  headerSub: {
    color: Colors.textSubtle,
    fontSize: 12,
  },
  closeBtn: {
    padding: 6,
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
    alignItems: 'flex-start',
    gap: 8,
  },
  addressText: {
    color: Colors.text,
    fontSize: 13,
    flex: 1,
  },
  notesBox: {
    backgroundcolor: '#FFFFFF',
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
    backgroundcolor: '#FFFFFF',
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
    backgroundcolor: '#FFFFFF',
    padding: 10,
    borderRadius: 8,
  },
  unassignedText: {
    color: Colors.textSubtle,
    fontSize: 13,
    fontStyle: 'italic',
  },
  footerAction: {
    paddingHorizontal: 16,
  },
  assignDriverBtn: {
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
  },
  assignDriverText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
  editStatusBtn: {
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
});


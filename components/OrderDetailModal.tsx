import React from 'react';
import { Modal, View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Order } from '../types';
import { Colors } from '../constants/colors';
import { StatusBadge } from './StatusBadge';
import { X, Store, User, MapPin, Bike, CreditCard, Phone, ShoppingBag, UtensilsCrossed, Tag, Receipt, CheckCircle2, Printer, Banknote, ChevronDown, ChevronUp, Check } from 'lucide-react-native';
import { Linking } from 'react-native';
import { orderService } from '../services/order.service';
import { printThermalReceipt } from '../services/thermal-print.service';

interface OrderDetailModalProps {
  visible: boolean;
  order: Order | null;
  onClose: () => void;
  onAssignDelivery: (order: Order) => void;
  onUpdateStatus?: (orderId: string, status: string) => Promise<void>;
}

export const OrderDetailModal: React.FC<OrderDetailModalProps> = ({
  visible,
  order: propOrder,
  onClose,
  onAssignDelivery,
  onUpdateStatus,
}) => {
  const [editingStatus, setEditingStatus] = React.useState(false);
  const [loadingStatus, setLoadingStatus] = React.useState(false);
  const [fetchedOrder, setFetchedOrder] = React.useState<Order | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [printing, setPrinting] = React.useState(false);

  const handlePrint = async () => {
    if (!order) return;
    setPrinting(true);
    try {
      await printThermalReceipt(order, true);
    } catch (e) {
      console.error('[OrderDetailModal] Print failed:', e);
    } finally {
      setPrinting(false);
    }
  };

  React.useEffect(() => {
    if (visible && propOrder?._id) {
      const fetchDetail = async () => {
        setLoading(true);
        try {
          const res = await orderService.getOrderById(propOrder._id);
          if (res.success && res.data) {
            setFetchedOrder(res.data);
          } else {
            setFetchedOrder(propOrder);
          }
        } catch (e) {
          console.error('Failed fetching order details in modal:', e);
          setFetchedOrder(propOrder);
        } finally {
          setLoading(false);
        }
      };
      fetchDetail();
    } else if (!visible) {
      setFetchedOrder(null);
      setEditingStatus(false);
    }
  }, [visible, propOrder?._id]);

  const order = fetchedOrder || propOrder;

  if (!order) return null;

  const STATUS_DROPDOWN_OPTIONS = [
    { label: 'Placed', sub: 'New Order Received', value: 'placed', icon: '📦', color: '#3B82F6' },
    { label: 'Preparing', sub: 'In Kitchen Cooking', value: 'preparing', icon: '🍳', color: '#F59E0B' },
    { label: 'Ready for Pickup', sub: 'Self Pickup Collection', value: 'ready_for_pickup', icon: '🛍️', color: '#EA580C' },
    { label: 'Out for Delivery', sub: 'Rider Out on Road', value: 'out_for_delivery', icon: '🛵', color: '#8B5CF6' },
    { label: 'Delivered', sub: 'Order Completed & Delivered', value: 'delivered', icon: '✅', color: '#10B981' },
    { label: 'Cancelled', sub: 'Order Cancelled', value: 'cancelled', icon: '❌', color: '#EF4444' },
  ];

  const handleStatusSelect = async (newStatus: string) => {
    if (!onUpdateStatus || newStatus === order.status) {
      setEditingStatus(false);
      return;
    }
    setLoadingStatus(true);
    try {
      await onUpdateStatus(order._id, newStatus);
      onClose();
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

  const orderTypeRaw = String(order.orderType || (order as any).fulfillmentType || '').toLowerCase();
  const isDeliveryOrder = orderTypeRaw === 'delivery' || (!orderTypeRaw && !!order.deliveryAddress && typeof order.deliveryAddress === 'object');

  const deliveryPartner = typeof order.assignedDeliveryPartnerId === 'object'
    ? order.assignedDeliveryPartnerId
    : undefined;

  const formatAddress = () => {
    const addr = order.deliveryAddress;
    if (!addr) {
      if (typeof order.customerDetails?.address === 'string' && order.customerDetails.address.trim()) {
        return order.customerDetails.address.trim();
      }
      return 'Self Pickup';
    }
    if (typeof addr === 'string') return addr.trim() || 'Self Pickup';
    if (addr.formattedAddress && addr.formattedAddress.trim()) return addr.formattedAddress.trim();

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

    return parts.length > 0 ? parts.join(', ') : ((addr as any).fullAddress || (addr as any).address || 'Self Pickup');
  };

  const addressText = formatAddress();

  const orderedItemsList = order.orderedItems || [];

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.header}>
            <View>
              <Text style={styles.headerTitle}>
                Order #{order.orderNumber || order._id?.substring(0, 8)}
              </Text>
              <Text style={styles.headerSub}>
                {order.createdAt ? new Date(order.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : ''}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={20} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={{ padding: 60, justifyContent: 'center', alignItems: 'center' }}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={{ color: Colors.textMuted, marginTop: 12, fontWeight: '600' }}>
                Loading order details...
              </Text>
            </View>
          ) : (
            <ScrollView style={styles.scrollBody} showsVerticalScrollIndicator={false}>
            {/* Dropdown Status Selector */}
            {order.status === 'placed' ? (
              <View style={styles.acceptActionsRow}>
                <TouchableOpacity
                  style={styles.acceptButton}
                  onPress={() => handleStatusSelect('preparing')}
                  disabled={loadingStatus}
                >
                  {loadingStatus ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.acceptButtonText}>Accept Order</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.rejectButton}
                  onPress={() => handleStatusSelect('cancelled')}
                  disabled={loadingStatus}
                >
                  <Text style={styles.rejectButtonText}>Reject</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.dropdownContainer}>
                <TouchableOpacity
                  style={styles.dropdownTrigger}
                  onPress={() => setEditingStatus(!editingStatus)}
                  activeOpacity={0.8}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                    <Text style={styles.dropdownTriggerLabel}>Status:</Text>
                    <StatusBadge status={order.status} type="order" />
                  </View>
                  <View style={styles.dropdownChevronBox}>
                    <Text style={styles.editStatusBtnText}>
                      {editingStatus ? 'Close' : 'Change Status'}
                    </Text>
                    {editingStatus ? <ChevronUp size={15} color={Colors.primary} /> : <ChevronDown size={15} color={Colors.primary} />}
                  </View>
                </TouchableOpacity>

                {editingStatus && (
                  <View style={styles.dropdownMenu}>
                    {STATUS_DROPDOWN_OPTIONS.map((opt) => {
                      const isSelected = order.status === opt.value;
                      return (
                        <TouchableOpacity
                          key={opt.value}
                          disabled={loadingStatus}
                          style={[
                            styles.dropdownItem,
                            isSelected && styles.dropdownItemSelected,
                          ]}
                          onPress={() => handleStatusSelect(opt.value)}
                          activeOpacity={0.7}
                        >
                          <Text style={{ fontSize: 16, marginRight: 10 }}>{opt.icon}</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.dropdownItemText, isSelected && styles.dropdownItemTextSelected]}>
                              {opt.label}
                            </Text>
                            <Text style={styles.dropdownItemSubText}>{opt.sub}</Text>
                          </View>
                          {isSelected && <Check size={16} color="#10B981" style={{ marginLeft: 8 }} />}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
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

            {/* Customer & Location */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <User size={16} color={Colors.info} />
                <Text style={styles.cardTitle}>Customer & Location</Text>
              </View>
              
              <View style={styles.customerRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoName}>{customerName}</Text>
                  {customerPhone ? (
                    <View style={styles.phoneWithCallRow}>
                      <Text style={styles.infoText}>Phone: {customerPhone}</Text>
                      <TouchableOpacity
                        style={styles.callRiderInlineBtn}
                        onPress={() => Linking.openURL(`tel:${customerPhone}`)}
                      >
                        <Phone size={11} color="#FFFFFF" />
                        <Text style={styles.callRiderInlineBtnText}>Call Customer</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </View>
              </View>

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
              <View style={styles.cardHeader}>
                <Receipt size={16} color={Colors.primary} />
                <Text style={styles.cardTitle}>Ordered Items</Text>
              </View>
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

              {(order.pricing?.handlingCharge || order.pricing?.tax || order.taxAmount) ? (
                <View style={styles.priceRow}>
                  <Text style={styles.priceLabel}>Handling & Tax:</Text>
                  <Text style={styles.priceVal}>
                    £{(order.pricing?.handlingCharge || order.pricing?.tax || order.taxAmount || 0).toFixed(2)}
                  </Text>
                </View>
              ) : null}

              {(order.pricing?.platformFee) ? (
                <View style={styles.priceRow}>
                  <Text style={styles.priceLabel}>Platform Fee:</Text>
                  <Text style={styles.priceVal}>
                    £{(order.pricing?.platformFee || 0).toFixed(2)}
                  </Text>
                </View>
              ) : null}

              {(order.pricing?.discount || order.pricing?.discountAmount) ? (
                <View style={styles.priceRow}>
                  <Text style={styles.priceLabel}>Discount:</Text>
                  <Text style={[styles.priceVal, { color: Colors.success }]}>
                    -£{(order.pricing?.discount || order.pricing?.discountAmount || 0).toFixed(2)}
                  </Text>
                </View>
              ) : null}

              <View style={[styles.priceRow, styles.totalPriceRow]}>
                <Text style={styles.totalLabel}>Total Paid:</Text>
                <Text style={styles.totalVal}>
                  £{(
                    order.pricing?.totalAmount ??
                    order.pricing?.total ??
                    order.totalAmount ??
                    order.totalPrice ??
                    0
                  ).toFixed(2)}
                </Text>
              </View>
            </View>

            {/* Payment Method Card */}
            <View style={styles.paymentCard}>
              <View style={styles.cardHeader}>
                <CreditCard size={16} color={Colors.primary} />
                <Text style={styles.cardTitle}>Payment Method</Text>
              </View>
              <View style={styles.paymentDetailRow}>
                <View style={styles.paymentMethodInfo}>
                  <View style={styles.paymentIconBadge}>
                    {(order.paymentType || 'cash').toLowerCase() === 'cash' ? (
                      <Banknote size={18} color="#16A34A" />
                    ) : (
                      <CreditCard size={18} color="#2563EB" />
                    )}
                  </View>
                  <View>
                    <Text style={styles.paymentMethodTitle}>
                      {(order.paymentType || 'Cash').toUpperCase()}
                    </Text>
                    <Text style={styles.paymentMethodSub}>
                      {(order.paymentType || 'cash').toLowerCase() === 'cash'
                        ? 'Pay on fulfillment / COD'
                        : 'Processed via Stripe'}
                    </Text>
                  </View>
                </View>

                <View
                  style={[
                    styles.paymentStatusBadge,
                    order.paymentStatus === 'paid' || order.status === 'delivered'
                      ? { backgroundColor: '#DCFCE7', borderColor: '#86EFAC' }
                      : { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' },
                  ]}
                >
                  <Text
                    style={[
                      styles.paymentStatusBadgeText,
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

            {/* Assigned Delivery Partner Card (Only for Delivery Orders) */}
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
                      <View style={styles.phoneWithCallRow}>
                        <Text style={styles.infoText}>Phone: {deliveryPartner.phoneNumber}</Text>
                        <TouchableOpacity
                          style={styles.callRiderInlineBtn}
                          onPress={() => Linking.openURL(`tel:${deliveryPartner.phoneNumber}`)}
                        >
                          <Phone size={11} color="#FFFFFF" />
                          <Text style={styles.callRiderInlineBtnText}>Call Rider</Text>
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

            {/* Print Receipt Section for Delivered / Completed Orders */}
            {order.status === 'delivered' && (
              <View style={styles.printSectionCard}>
                <TouchableOpacity
                  style={styles.printReceiptBtn}
                  onPress={handlePrint}
                  disabled={printing}
                  activeOpacity={0.82}
                >
                  {printing ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Printer size={18} color="#FFFFFF" />
                      <Text style={styles.printReceiptBtnText}>Print Thermal Receipt</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* Generous Bottom Spacing Spacer */}
            <View style={{ height: 40 }} />
          </ScrollView>
          )}

          {/* Footer Action for Active Delivery Orders */}
          {isDeliveryOrder && order.status !== 'delivered' && order.status !== 'cancelled' && (
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
    backgroundColor: '#FFFFFF',
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
    backgroundColor: '#FFFFFF',
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
    backgroundColor: '#FFFFFF',
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
  headerSub: {
    color: Colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  callContactBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#2563EB',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  callContactBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },

  /* Payment Method & Thermal Print Styles */
  paymentCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderColor: Colors.cardBorder,
    borderWidth: 1.2,
    padding: 14,
    marginBottom: 14,
  },
  paymentDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    gap: 12,
  },
  paymentMethodInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  paymentIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentMethodTitle: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  paymentMethodSub: {
    color: Colors.textMuted,
    fontSize: 11,
    marginTop: 1,
  },
  paymentStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
  },
  paymentStatusBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  printSectionCard: {
    marginTop: 4,
    marginBottom: 14,
  },
  printReceiptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FF5C39',
    paddingVertical: 14,
    borderRadius: 12,
    shadowColor: '#FF5C39',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  printReceiptBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  phoneWithCallRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 3,
  },
  callRiderInlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#2563EB',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  callRiderInlineBtnText: {
    color: '#FFFFFF',
    fontSize: 10.5,
    fontWeight: '800',
  },

  /* Status Dropdown Styles */
  dropdownContainer: {
    marginBottom: 14,
  },
  dropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.card,
    borderRadius: 12,
    borderWidth: 1.2,
    borderColor: Colors.cardBorder,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  dropdownTriggerLabel: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  dropdownChevronBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  dropdownMenu: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    borderWidth: 1.2,
    borderColor: Colors.primary,
    marginTop: 6,
    padding: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    marginVertical: 1,
  },
  dropdownItemSelected: {
    backgroundColor: '#F3F4F6',
  },
  dropdownItemText: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  dropdownItemTextSelected: {
    color: Colors.primary,
  },
  dropdownItemSubText: {
    color: Colors.textMuted,
    fontSize: 11,
    marginTop: 1,
  },
});


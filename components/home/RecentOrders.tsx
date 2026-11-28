import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Bike, Check, ChevronRight, Inbox, ShoppingBag, UtensilsCrossed } from 'lucide-react-native';
import type { Order } from '../../types';
import { Colors } from '../../constants/colors';
import { getOrderFulfillmentType } from '../../utils/order-fulfillment';
import { getOrderStatusColor, getOrderStatusLabel, getOrderStatusSurface, isActiveOrder } from '../../utils/order-status';
import { formatDuration, getOrderTiming, useNow } from '../../utils/order-timing';

/* ── Quick action (one tap moves the order to its next step) ───────────── */

export interface OrderNextAction {
  nextStatus: string;
  label: string;
  bgColor: string;
  Icon: typeof Check;
}

export function getOrderNextAction(order: Order): OrderNextAction | null {
  const status = (order.status || '').toLowerCase();
  const fulfillment = getOrderFulfillmentType(order);

  if (status === 'placed' || status === 'pending') {
    return { nextStatus: 'preparing', label: 'Accept', bgColor: '#16A34A', Icon: Check };
  }
  if (status === 'confirmed' || status === 'preparing') {
    if (fulfillment === 'dine_in') return { nextStatus: 'delivered', label: 'Served', bgColor: '#7C3AED', Icon: UtensilsCrossed };
    if (fulfillment === 'takeaway' || fulfillment === 'pickup') {
      return { nextStatus: 'ready_for_pickup', label: 'Ready', bgColor: '#FF5C39', Icon: Check };
    }
    return { nextStatus: 'out_for_delivery', label: 'Dispatch', bgColor: '#2563EB', Icon: Bike };
  }
  if (status === 'ready_for_pickup') {
    return { nextStatus: 'delivered', label: 'Collected', bgColor: '#16A34A', Icon: Check };
  }
  if (status === 'out_for_delivery') {
    return { nextStatus: 'delivered', label: 'Delivered', bgColor: '#16A34A', Icon: Check };
  }
  return null;
}

/* ── Helpers ───────────────────────────────────────────────────────────── */

const TYPE_ICON = {
  delivery: { Icon: Bike, color: '#1D4ED8', bg: '#DBEAFE', label: 'Delivery' },
  pickup: { Icon: ShoppingBag, color: '#C2410C', bg: '#FFEDD5', label: 'Pickup' },
  takeaway: { Icon: ShoppingBag, color: '#B45309', bg: '#FEF3C7', label: 'Takeaway' },
  dine_in: { Icon: UtensilsCrossed, color: '#6D28D9', bg: '#EDE9FE', label: 'Dine-in' },
} as const;

// Same rule as the home channel cards: rejected orders and unpaid card checkouts aren't active either
const isActive = (o: Order) => isActiveOrder(o as any);

const customerOf = (o: Order) =>
  (typeof o.customerId === 'object' && o.customerId?.fullName) || o.customerDetails?.name || 'Customer';

const totalOf = (o: Order) =>
  o.pricing?.totalAmount ??
  o.pricing?.total ??
  o.totalAmount ??
  o.totalPrice ??
  (o.orderedItems || []).reduce((acc, i) => acc + (i.price || (i as any).basePrice || 0) * (i.quantity || 1), 0);

const itemsPreview = (o: Order) => {
  const items: any[] = (o.orderedItems?.length ? o.orderedItems : o.items) || [];
  const shown = items.slice(0, 2).map((i) => `${i.quantity || i.qty || 1}× ${i.name || i.itemName || i.menuItemId?.name || 'Item'}`);
  const more = items.length - shown.length;
  return { text: shown.join(', ') + (more > 0 ? ` +${more} more` : ''), count: items.length };
};

const timeOf = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toDateString() === new Date().toDateString() ? time : `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })}, ${time}`;
};

/** Live "12:03 left" / "Overdue +02:10" — only mounted for orders with a countdown. */
function InlineCountdown({ order }: { order: Order }) {
  const now = useNow();
  const t = getOrderTiming(order, now);
  if (t.kind !== 'countdown') return null;
  const late = t.tone === 'overdue';
  const color = late ? '#B91C1C' : t.tone === 'warning' ? '#B45309' : '#1D4ED8';
  return (
    <Text style={[styles.countdown, { color }]}>
      {' · '}
      {late ? `Overdue +${formatDuration(t.remainingMs)}` : `${formatDuration(t.remainingMs)} left`}
    </Text>
  );
}

/* ── Component ─────────────────────────────────────────────────────────── */

type Props = {
  orders: Order[];
  updatingOrderId: string | null;
  isTablet?: boolean;
  onOpenOrder: (order: Order) => void;
  onQuickAction: (order: Order, nextStatus: string) => void;
  /** Long-press on the action (or tap on a finished order's status) opens the full status picker. */
  onPickStatus: (order: Order) => void;
  onSeeAll: () => void;
};

const MAX_ROWS = 4; 

export function RecentOrders({ orders, updatingOrderId, isTablet, onOpenOrder, onQuickAction, onPickStatus, onSeeAll }: Props) {
  const activeOrders = useMemo(() => orders.filter(isActive), [orders]);
  const [tab, setTab] = useState<'active' | 'all'>('active');
  const list = (tab === 'active' ? activeOrders : orders).slice(0, MAX_ROWS);

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Recent orders</Text>
        <TouchableOpacity onPress={onSeeAll} style={styles.seeAll} hitSlop={8} accessibilityRole="link">
          <Text style={styles.seeAllText}>See all</Text>
          <ChevronRight size={16} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      <View style={styles.segment} accessibilityRole="tablist">
        {(['active', 'all'] as const).map((key) => {
          const selected = tab === key;
          const count = key === 'active' ? activeOrders.length : orders.length;
          return (
            <TouchableOpacity
              key={key}
              style={[styles.segmentBtn, selected && styles.segmentBtnActive]}
              onPress={() => setTab(key)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
            >
              <Text style={[styles.segmentText, selected && styles.segmentTextActive]}>{key === 'active' ? 'Active' : 'All'}</Text>
              <View style={[styles.segmentCount, selected && styles.segmentCountActive]}>
                <Text style={[styles.segmentCountText, selected && styles.segmentCountTextActive]}>{count}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {list.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Inbox size={22} color="#9BA1A6" />
          </View>
          <Text style={styles.emptyTitle}>{tab === 'active' ? 'All caught up' : 'No orders yet'}</Text>
          <Text style={styles.emptyText}>
            {tab === 'active' ? 'There are no orders in progress right now.' : 'New orders will appear here.'}
          </Text>
        </View>
      ) : (
        <View style={[styles.list, isTablet && styles.listTablet]}>
          {list.map((order, idx) => {
            const type = TYPE_ICON[getOrderFulfillmentType(order)];
            const TypeIcon = type.Icon;
            const surface = getOrderStatusSurface(order.status);
            const action = getOrderNextAction(order);
            const busy = updatingOrderId === order._id;
            const preview = itemsPreview(order);
            const orderNo = order.orderNumber || order._id?.substring(0, 8);

            return (
              <TouchableOpacity
                key={order._id}
                style={[styles.row, isTablet ? styles.rowTablet : idx > 0 && styles.rowDivider]}
                activeOpacity={0.7}
                onPress={() => onOpenOrder(order)}
                accessibilityRole="button"
                accessibilityLabel={`Order ${orderNo}, ${customerOf(order)}, ${getOrderStatusLabel(order.status)}, £${totalOf(order).toFixed(2)}`}
              >
                <View style={[styles.typeIcon, { backgroundColor: type.bg }]} accessibilityLabel={type.label}>
                  <TypeIcon size={18} color={type.color} />
                </View>

                <View style={styles.body}>
                  <View style={styles.lineTop}>
                    <Text style={styles.orderLine} numberOfLines={1}>
                      <Text style={styles.orderNo}>#{orderNo}</Text>
                      <Text style={styles.customer}>  {customerOf(order)}</Text>
                    </Text>
                    <Text style={styles.total}>£{totalOf(order).toFixed(2)}</Text>
                  </View>

                  <Text style={styles.items} numberOfLines={1}>
                    {preview.count ? preview.text : 'No items'}
                  </Text>

                  <View style={styles.lineBottom}>
                    <Text style={styles.meta} numberOfLines={1}>
                      <Text style={{ color: getOrderStatusColor(order.status) }}>● </Text>
                      <Text style={[styles.status, { color: surface.text }]}>{getOrderStatusLabel(order.status)}</Text>
                      <Text> · {timeOf(order.createdAt)}</Text>
                      {isActive(order) && <InlineCountdown order={order} />}
                    </Text>

                    {action ? (
                      <TouchableOpacity
                        style={[styles.actionBtn, { backgroundColor: action.bgColor }, busy && styles.actionBtnBusy]}
                        onPress={(e: any) => {
                          e.stopPropagation?.();
                          onQuickAction(order, action.nextStatus);
                        }}
                        onLongPress={(e: any) => {
                          e.stopPropagation?.();
                          onPickStatus(order);
                        }}
                        disabled={busy}
                        activeOpacity={0.8}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        accessibilityRole="button"
                        accessibilityLabel={`${action.label} order ${orderNo}`}
                        accessibilityHint="Long press for all statuses"
                      >
                        {busy ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <>
                            <action.Icon size={14} color="#FFFFFF" strokeWidth={2.8} />
                            <Text style={styles.actionText}>{action.label}</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {tab === 'active' && activeOrders.length > MAX_ROWS && (
        <TouchableOpacity style={styles.moreBtn} onPress={onSeeAll} activeOpacity={0.75}>
          <Text style={styles.moreText}>View {activeOrders.length - MAX_ROWS} more active orders</Text>
          <ChevronRight size={16} color={Colors.primary} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 20 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, marginBottom: 10 },
  title: { color: Colors.text, fontSize: 16, fontWeight: '800', letterSpacing: -0.3 },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 32 },
  seeAllText: { color: Colors.primary, fontSize: 13.5, fontWeight: '700' },

  segment: { flexDirection: 'row', alignSelf: 'flex-start', backgroundColor: '#F1F3F5', borderRadius: 10, padding: 3, marginBottom: 10 },
  segmentBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, minHeight: 34, borderRadius: 8 },
  segmentBtnActive: { backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  segmentText: { fontSize: 13.5, fontWeight: '700', color: '#687076' },
  segmentTextActive: { color: Colors.text },
  segmentCount: { minWidth: 20, height: 18, borderRadius: 9, backgroundColor: '#E2E5E9', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  segmentCountActive: { backgroundColor: '#FF5C39' },
  segmentCountText: { fontSize: 11, fontWeight: '800', color: '#687076' },
  segmentCountTextActive: { color: '#FFFFFF' },

  list: { backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#EEEEEE', overflow: 'hidden' },
  listTablet: { backgroundColor: 'transparent', borderWidth: 0, flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  row: { flexDirection: 'row', gap: 12, padding: 14 },
  rowDivider: { borderTopWidth: 1, borderTopColor: '#F1F3F5' },
  rowTablet: { width: '48.9%', backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#EEEEEE' },
  typeIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, minWidth: 0, gap: 3 },
  lineTop: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  orderLine: { flex: 1 },
  orderNo: { fontSize: 15, fontWeight: '800', color: Colors.text },
  customer: { fontSize: 14, fontWeight: '600', color: '#374151' },
  total: { fontSize: 15, fontWeight: '800', color: Colors.text, fontVariant: ['tabular-nums'] },
  items: { fontSize: 13, color: '#687076', fontWeight: '500' },
  lineBottom: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  meta: { flex: 1, fontSize: 12.5, color: '#687076', fontWeight: '500' },
  status: { fontWeight: '700' },
  countdown: { fontWeight: '700', fontVariant: ['tabular-nums'] },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 34,
    minWidth: 84,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  actionBtnBusy: { opacity: 0.6 },
  actionText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },

  empty: { alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#EEEEEE', paddingVertical: 28, paddingHorizontal: 20 },
  emptyIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F1F3F5', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  emptyTitle: { fontSize: 15, fontWeight: '800', color: Colors.text },
  emptyText: { fontSize: 13, color: '#687076', marginTop: 4, textAlign: 'center' },

  moreBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 44, marginTop: 6 },
  moreText: { color: Colors.primary, fontSize: 13.5, fontWeight: '700' },
});

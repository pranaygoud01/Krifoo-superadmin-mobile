import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { AlertTriangle, CalendarClock, ChevronRight, Timer } from 'lucide-react-native';
import type { Order } from '../types';
import { Colors } from '../constants/colors';
import { formatOverdue, getOrderTiming, useNow } from '../utils/order-timing';

const STATUS_LABELS: Record<string, string> = {
  placed: 'New – not accepted',
  confirmed: 'Confirmed',
  preparing: 'In Kitchen',
  ready_for_pickup: 'Ready for pickup',
  out_for_delivery: 'Out for delivery',
};

type Props = {
  orders: Order[];
  onOpenOrder: (order: Order) => void;
};

/**
 * Home-tab section listing active orders that ran past their expected time
 * (countdown hit 0) or past their scheduled time. Renders nothing when none are late.
 * Owns the 1-second clock so the rest of the dashboard doesn't re-render every tick.
 */
export function ActionNeededOrders({ orders, onOpenOrder }: Props) {
  const now = useNow();

  const late = useMemo(
    () =>
      orders
        .map((order) => ({ order, timing: getOrderTiming(order, now) }))
        .filter(
          ({ timing }) =>
            (timing.kind === 'countdown' && timing.tone === 'overdue') ||
            (timing.kind === 'scheduled' && timing.overdue)
        )
        .map(({ order, timing }) => ({
          order,
          scheduled: timing.kind === 'scheduled',
          overdueMs: now - (timing.kind === 'none' ? now : timing.deadline),
        }))
        .sort((a, b) => b.overdueMs - a.overdueMs),
    [orders, now]
  );

  if (late.length === 0) return null;

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <AlertTriangle size={18} color="#B91C1C" />
        <Text style={styles.header}>Action Needed</Text>
        <View style={styles.countPill}>
          <Text style={styles.countText}>{late.length}</Text>
        </View>
      </View>

      <View style={styles.list}>
        {late.map(({ order, scheduled, overdueMs }) => {
          const customer =
            (typeof order.customerId === 'object' && order.customerId?.fullName) ||
            order.customerDetails?.name ||
            'Customer';
          const Icon = scheduled ? CalendarClock : Timer;
          return (
            <TouchableOpacity
              key={order._id}
              style={styles.card}
              activeOpacity={0.7}
              onPress={() => onOpenOrder(order)}
              accessibilityRole="button"
              accessibilityLabel={`Order ${order.orderNumber || ''}, ${
                scheduled ? 'scheduled time passed' : 'overdue'
              } by ${formatOverdue(overdueMs)}. Open order details.`}
            >
              <View style={styles.iconCircle}>
                <Icon size={18} color="#B91C1C" />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.orderId} numberOfLines={1}>
                  #{order.orderNumber || order._id?.substring(0, 8)} · {customer}
                </Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {STATUS_LABELS[order.status] || order.status}
                </Text>
                <Text style={styles.overdue} numberOfLines={1}>
                  {scheduled
                    ? `Scheduled time passed ${formatOverdue(overdueMs)} ago`
                    : `Overdue by ${formatOverdue(overdueMs)}`}
                </Text>
              </View>
              <ChevronRight size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 20 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18, marginBottom: 12 },
  header: { color: '#B91C1C', fontSize: 16, fontWeight: '800', letterSpacing: -0.3 },
  countPill: {
    backgroundColor: '#B91C1C',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  list: { gap: 10 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderColor: Colors.cardBorder,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderId: { color: Colors.text, fontSize: 14, fontWeight: '800' },
  meta: { color: Colors.textMuted, fontSize: 12, fontWeight: '600', marginTop: 2 },
  overdue: { color: '#B91C1C', fontSize: 12, fontWeight: '700', marginTop: 2 },
});

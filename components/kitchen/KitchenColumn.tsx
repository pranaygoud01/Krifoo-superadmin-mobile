import React from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { BellRing, ChefHat, PackageCheck } from 'lucide-react-native';
import type { Order } from '../../types';
import { formatDuration, useNow } from '../../utils/order-timing';
import { getKitchenAction, getKitchenStartMs, type KitchenAction, type KitchenStage } from '../../utils/kitchen-board';
import { KitchenTicket } from './KitchenTicket';
import { STAGE_COLORS, type KitchenPalette } from './theme';

export const STAGE_TITLES: Record<KitchenStage, string> = {
  new: 'New',
  cooking: 'Cooking',
  ready: 'Ready',
};

const STAGE_ICON = { new: BellRing, cooking: ChefHat, ready: PackageCheck } as const;

const EMPTY_TEXT: Record<KitchenStage, { title: string; sub: string }> = {
  new: { title: 'No new orders', sub: 'New orders appear here automatically.' },
  cooking: { title: 'Nothing cooking', sub: 'Start an order from New.' },
  ready: { title: 'Nothing waiting', sub: 'Finished orders wait here for collection.' },
};

type Props = {
  stage: KitchenStage;
  orders: Order[];
  palette: KitchenPalette;
  scale: number;
  showHeader: boolean;
  busyIds: ReadonlySet<string>;
  ticks: Readonly<Record<string, number[]>>;
  refreshing: boolean;
  onRefresh: () => void;
  onToggleItem: (orderId: string, index: number) => void;
  onAction: (order: Order, action: KitchenAction) => void;
};

const NO_TICKS: number[] = [];

/** "Oldest 12m" — how long the longest-waiting ticket in this column has been on the board. */
function OldestWait({ orders, palette, scale }: { orders: Order[]; palette: KitchenPalette; scale: number }) {
  const now = useNow();
  if (orders.length === 0) return null;
  const oldest = Math.min(...orders.map(getKitchenStartMs).filter((ms) => ms > 0));
  if (!Number.isFinite(oldest)) return null;
  const waited = Math.max(0, now - oldest);
  const color = waited > 20 * 60_000 ? palette.overdue : waited > 10 * 60_000 ? palette.warning : palette.muted;
  return <Text style={[styles.oldest, { color, fontSize: 13 * scale }]}>Oldest {formatDuration(waited)}</Text>;
}

export function KitchenColumn({ stage, orders, palette, scale, showHeader, busyIds, ticks, refreshing, onRefresh, onToggleItem, onAction }: Props) {
  const accent = STAGE_COLORS[stage];
  const Icon = STAGE_ICON[stage];

  return (
    <View style={[styles.column, { backgroundColor: palette.surface }]}>
      {showHeader && (
        <View style={[styles.header, { borderBottomColor: palette.divider }]}>
          <View style={[styles.headerIcon, { backgroundColor: palette.stage[stage].bg, borderColor: palette.stage[stage].border }]}>
            <Icon size={18 * scale} color={accent} strokeWidth={2.4} />
          </View>
          <View style={styles.headerText}>
            <Text style={[styles.title, { color: palette.text, fontSize: 18 * scale }]}>{STAGE_TITLES[stage]}</Text>
            <OldestWait orders={orders} palette={palette} scale={scale} />
          </View>
          <View style={[styles.badge, { backgroundColor: accent }]}>
            <Text style={[styles.badgeText, { fontSize: 16 * scale }]}>{orders.length}</Text>
          </View>
        </View>
      )}

      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} colors={[accent]} />}
      >
        {orders.length === 0 ? (
          <View style={styles.empty}>
            <View style={[styles.emptyIcon, { backgroundColor: palette.card, borderColor: palette.cardBorder }]}>
              <Icon size={26 * scale} color={palette.muted} />
            </View>
            <Text style={[styles.emptyTitle, { color: palette.text, fontSize: 17 * scale }]}>{EMPTY_TEXT[stage].title}</Text>
            <Text style={[styles.emptySub, { color: palette.muted, fontSize: 14 * scale }]}>{EMPTY_TEXT[stage].sub}</Text>
          </View>
        ) : (
          orders.map((order) => (
            <KitchenTicket
              key={order._id}
              order={order}
              stage={stage}
              palette={palette}
              scale={scale}
              action={getKitchenAction(order, stage)}
              busy={busyIds.has(order._id)}
              tickedItems={ticks[order._id] || NO_TICKS}
              onToggleItem={onToggleItem}
              onAction={onAction}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  column: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1 },
  headerIcon: { width: 38, height: 38, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1, minWidth: 0 },
  title: { fontWeight: '900', letterSpacing: -0.2 },
  oldest: { fontWeight: '700', marginTop: 1, fontVariant: ['tabular-nums'] },
  badge: { minWidth: 38, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  badgeText: { color: '#FFFFFF', fontWeight: '900', fontVariant: ['tabular-nums'] },
  list: { padding: 12, gap: 12, paddingBottom: 40 },
  empty: { alignItems: 'center', paddingVertical: 56, paddingHorizontal: 20, gap: 6 },
  emptyIcon: { width: 60, height: 60, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  emptyTitle: { fontWeight: '800' },
  emptySub: { fontWeight: '500', textAlign: 'center' },
});

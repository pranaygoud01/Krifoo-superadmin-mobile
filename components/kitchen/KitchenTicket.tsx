import React, { memo } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import {
  AlertTriangle,
  Bike,
  CalendarClock,
  Check,
  CheckCircle2,
  ChefHat,
  Clock,
  MessageSquareWarning,
  ShoppingBag,
  UtensilsCrossed,
} from 'lucide-react-native';
import type { Order } from '../../types';
import { getItemOptionsList } from '../../services/receipt-customization.service';
import { getSanitizedOrderNotes, getOrderScheduleInfo } from '../../services/printer/receipt-document';
import { getOrderFulfillmentType } from '../../utils/order-fulfillment';
import { formatDuration, getOrderTiming, useNow } from '../../utils/order-timing';
import {
  getKitchenItems,
  getKitchenStartMs,
  getReadyLabel,
  type KitchenAction,
  type KitchenStage,
} from '../../utils/kitchen-board';
import { STAGE_COLORS, type KitchenPalette } from './theme';

type Props = {
  order: Order;
  stage: KitchenStage;
  palette: KitchenPalette;
  scale: number;
  action: KitchenAction | null;
  busy?: boolean;
  tickedItems: readonly number[];
  onToggleItem: (orderId: string, index: number) => void;
  onAction: (order: Order, action: KitchenAction) => void;
};

const TYPE_META = {
  delivery: { label: 'Delivery', Icon: Bike },
  pickup: { label: 'Pickup', Icon: ShoppingBag },
  takeaway: { label: 'Takeaway', Icon: ShoppingBag },
  dine_in: { label: 'Dine-in', Icon: UtensilsCrossed },
} as const;

const clockTime = (ms: number) => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** Timer pill + progress of time used vs time allowed. */
function TicketTimer({ order, stage, palette, scale }: Pick<Props, 'order' | 'stage' | 'palette' | 'scale'>) {
  const now = useNow();
  const timing = getOrderTiming(order, now);
  const startMs = getKitchenStartMs(order);

  let text: string;
  let tone: 'normal' | 'warning' | 'overdue' = 'normal';
  let Icon = Clock;
  let progress: number | null = null;

  if (timing.kind === 'countdown') {
    tone = timing.tone;
    const late = tone === 'overdue';
    text = late ? `Late +${formatDuration(timing.remainingMs)}` : `${formatDuration(timing.remainingMs)} left`;
    if (late) Icon = AlertTriangle;
    const total = timing.deadline - startMs;
    progress = total > 0 ? Math.min(1, Math.max(0, (now - startMs) / total)) : null;
  } else if (timing.kind === 'scheduled') {
    const ms = timing.deadline - now;
    tone = timing.overdue ? 'overdue' : 'warning';
    text = timing.overdue ? `Due +${formatDuration(ms)}` : `Due in ${formatDuration(ms)}`;
    Icon = timing.overdue ? AlertTriangle : CalendarClock;
  } else {
    const elapsed = Math.max(0, now - startMs);
    text = `${stage === 'new' ? 'Waiting' : 'Cooking'} ${formatDuration(elapsed)}`;
    if (stage === 'new' && elapsed > 5 * 60_000) tone = 'warning';
  }

  const color = tone === 'overdue' ? palette.overdue : tone === 'warning' ? palette.warning : palette.text;
  const pillBg = tone === 'overdue' ? palette.overdueBg : tone === 'warning' ? palette.noteBg : palette.chipBg;
  const barColor = tone === 'overdue' ? palette.overdue : tone === 'warning' ? palette.warning : STAGE_COLORS[stage];

  return (
    <View style={styles.timerWrap}>
      <View style={[styles.timerPill, { backgroundColor: pillBg, borderColor: tone === 'normal' ? palette.cardBorder : color }]}>
        <Icon size={17 * scale} color={color} strokeWidth={2.4} />
        <Text style={[styles.timerText, { color, fontSize: 17 * scale }]} numberOfLines={1}>
          {text}
        </Text>
      </View>
      {progress !== null && (
        <View style={[styles.progressTrack, { backgroundColor: palette.divider }]}>
          <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%`, backgroundColor: barColor }]} />
        </View>
      )}
    </View>
  );
}

function KitchenTicketBase({ order, stage, palette, scale, action, busy, tickedItems, onToggleItem, onAction }: Props) {
  const now = useNow();
  const type = getOrderFulfillmentType(order);
  const { label: typeLabel, Icon: TypeIcon } = TYPE_META[type];
  const tableNumber = (order as any).tableNumber;
  const items = getKitchenItems(order);
  const notes = getSanitizedOrderNotes(order.notes);
  const schedule = getOrderScheduleInfo(order);
  const timing = getOrderTiming(order, now);
  const overdue = (timing.kind === 'countdown' && timing.tone === 'overdue') || (timing.kind === 'scheduled' && timing.overdue);
  const doneCount = tickedItems.length;
  const accent = STAGE_COLORS[stage];
  const orderNo = order.orderNumber || order._id.substring(0, 6).toUpperCase();
  const customer = (order as any).customerDetails?.name;
  const placedAt = order.createdAt ? clockTime(new Date(order.createdAt).getTime()) : null;
  const allDone = items.length > 0 && doneCount >= items.length;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: overdue ? palette.overdueBg : palette.stage[stage].bg,
          borderColor: overdue ? palette.overdue : palette.stage[stage].border,
          borderWidth: overdue ? 2 : 1,
        },
      ]}
    >
      {/* Header */}
      <View style={styles.headerRow}>
        <View style={styles.headerMain}>
          <Text style={[styles.orderNo, { color: palette.text, fontSize: 28 * scale }]} numberOfLines={1}>
            #{orderNo}
          </Text>
          <Text style={[styles.meta, { color: palette.muted, fontSize: 13.5 * scale }]} numberOfLines={1}>
            {[placedAt ? `Placed ${placedAt}` : null, customer && type !== 'dine_in' ? customer : null].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <View style={[styles.typeChip, { backgroundColor: palette.chipBg, borderColor: palette.cardBorder }]}>
          <TypeIcon size={16 * scale} color={palette.text} />
          <Text style={[styles.typeText, { color: palette.text, fontSize: 14 * scale }]} numberOfLines={1}>
            {type === 'dine_in' && tableNumber ? `Table ${tableNumber}` : typeLabel}
          </Text>
        </View>
      </View>

      {schedule.isScheduled && (
        <View style={[styles.scheduleRow, { backgroundColor: palette.noteBg }]}>
          <CalendarClock size={15 * scale} color={palette.noteText} />
          <Text style={[styles.scheduleText, { color: palette.noteText, fontSize: 13.5 * scale }]} numberOfLines={1}>
            Scheduled for {schedule.scheduleTimeText}
          </Text>
        </View>
      )}

      <TicketTimer order={order} stage={stage} palette={palette} scale={scale} />

      {/* Items */}
      <View style={[styles.itemsBox, { borderColor: palette.divider }]}>
        <View style={styles.itemsHeader}>
          <Text style={[styles.itemsLabel, { color: palette.muted, fontSize: 12.5 * scale }]}>
            {items.length} {items.length === 1 ? 'item' : 'items'}
          </Text>
          {doneCount > 0 && (
            <Text style={[styles.itemsLabel, { color: STAGE_COLORS.ready, fontSize: 12.5 * scale }]}>
              {allDone ? 'All done' : `${doneCount} of ${items.length} done`}
            </Text>
          )}
        </View>

        {items.map((item, idx) => {
          const done = tickedItems.includes(idx);
          const options = getItemOptionsList(item.raw);
          return (
            <Pressable
              key={idx}
              onPress={() => onToggleItem(order._id, idx)}
              style={({ pressed }) => [styles.itemRow, idx > 0 && { borderTopWidth: 1, borderTopColor: palette.divider }, pressed && { opacity: 0.6 }]}
              hitSlop={2}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: done }}
              accessibilityLabel={`${item.quantity} times ${item.name}${done ? ', done' : ''}`}
              accessibilityHint="Tap to mark this item as done"
            >
              <View
                style={[
                  styles.qtyBadge,
                  {
                    minWidth: 38 * scale,
                    height: 34 * scale,
                    backgroundColor: done ? 'transparent' : accent,
                    borderColor: done ? palette.done : accent,
                  },
                ]}
              >
                <Text style={[styles.qtyText, { color: done ? palette.done : '#FFFFFF', fontSize: 18 * scale }]}>{item.quantity}</Text>
              </View>

              <View style={styles.itemBody}>
                <Text
                  style={[styles.itemName, { color: done ? palette.done : palette.text, fontSize: 19 * scale, lineHeight: 24 * scale }, done && styles.strike]}
                >
                  {item.name}
                </Text>
                {options.map((opt, oIdx) => (
                  <Text
                    key={oIdx}
                    style={[styles.itemOption, { color: done ? palette.done : palette.muted, fontSize: 15 * scale }, done && styles.strike]}
                  >
                    › {opt}
                  </Text>
                ))}
                {item.instructions ? (
                  <View style={[styles.itemNote, { backgroundColor: palette.noteBg }]}>
                    <MessageSquareWarning size={14 * scale} color={palette.noteText} />
                    <Text style={[styles.itemNoteText, { color: palette.noteText, fontSize: 14.5 * scale }]}>{item.instructions}</Text>
                  </View>
                ) : null}
              </View>

              <View
                style={[
                  styles.check,
                  {
                    width: 30 * scale,
                    height: 30 * scale,
                    borderRadius: 15 * scale,
                    borderColor: done ? STAGE_COLORS.ready : palette.cardBorder,
                    backgroundColor: done ? STAGE_COLORS.ready : 'transparent',
                  },
                ]}
              >
                {done && <Check size={18 * scale} color="#FFFFFF" strokeWidth={3} />}
              </View>
            </Pressable>
          );
        })}
      </View>

      {/* Order note — allergies etc. */}
      {notes ? (
        <View style={[styles.noteBox, { backgroundColor: palette.noteBg, borderColor: palette.warning }]}>
          <AlertTriangle size={18 * scale} color={palette.noteText} />
          <View style={styles.flex}>
            <Text style={[styles.noteLabel, { color: palette.noteText, fontSize: 12 * scale }]}>ORDER NOTE</Text>
            <Text style={[styles.noteText, { color: palette.noteText, fontSize: 16 * scale }]}>{notes}</Text>
          </View>
        </View>
      ) : null}

      {/* Footer */}
      {stage === 'ready' ? (
        <View style={[styles.readyPill, { borderColor: STAGE_COLORS.ready }]}>
          <CheckCircle2 size={20 * scale} color={STAGE_COLORS.ready} />
          <Text style={[styles.readyText, { color: STAGE_COLORS.ready, fontSize: 16 * scale }]}>{getReadyLabel(order)}</Text>
        </View>
      ) : action ? (
        <Pressable
          onPress={() => onAction(order, action)}
          disabled={busy}
          style={({ pressed }) => [
            styles.actionBtn,
            {
              backgroundColor: stage === 'new' ? STAGE_COLORS.cooking : STAGE_COLORS.ready,
              minHeight: 62 * Math.max(1, scale * 0.95),
              opacity: busy ? 0.6 : pressed ? 0.88 : 1,
              transform: [{ scale: pressed ? 0.985 : 1 }],
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`${action.label}, order ${orderNo}`}
        >
          {busy ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              {stage === 'new' ? <ChefHat size={24 * scale} color="#FFFFFF" /> : <Check size={24 * scale} color="#FFFFFF" strokeWidth={3} />}
              <Text style={[styles.actionText, { fontSize: 19 * scale }]}>{action.label}</Text>
            </>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

export const KitchenTicket = memo(KitchenTicketBase);

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { borderRadius: 12, padding: 14, gap: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  headerMain: { flex: 1, minWidth: 0 },
  orderNo: { fontWeight: '900', letterSpacing: -0.6 },
  meta: { fontWeight: '600', marginTop: 1 },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 6,
    maxWidth: '55%',
  },
  typeText: { fontWeight: '800' },
  scheduleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  scheduleText: { fontWeight: '800' },
  timerWrap: { gap: 6 },
  timerPill: { flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start', borderWidth: 1, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 7 },
  timerText: { fontWeight: '800', fontVariant: ['tabular-nums'] },
  progressTrack: { height: 5, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 5, borderRadius: 3 },
  itemsBox: { borderTopWidth: 1, paddingTop: 8 },
  itemsHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  itemsLabel: { fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  itemRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 10 },
  qtyBadge: { borderRadius: 9, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  qtyText: { fontWeight: '900', fontVariant: ['tabular-nums'] },
  itemBody: { flex: 1, gap: 3, paddingTop: 3 },
  itemName: { fontWeight: '800' },
  itemOption: { fontWeight: '600' },
  itemNote: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 7, marginTop: 3 },
  itemNoteText: { fontWeight: '800' },
  strike: { textDecorationLine: 'line-through' },
  check: { borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  noteBox: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: 10, borderWidth: 1, alignItems: 'flex-start' },
  noteLabel: { fontWeight: '900', letterSpacing: 1 },
  noteText: { fontWeight: '800', marginTop: 2 },
  readyPill: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 2, borderRadius: 12, paddingVertical: 14 },
  readyText: { fontWeight: '800', letterSpacing: 0.3 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 12 },
  actionText: { color: '#FFFFFF', fontWeight: '900', letterSpacing: 0.3 },
});

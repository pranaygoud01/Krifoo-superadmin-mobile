import React from 'react';
import { View, Text, StyleProp, ViewStyle, TextStyle } from 'react-native';
import { Clock, AlertTriangle } from 'lucide-react-native';
import type { Order } from '../types';
import { formatDuration, getOrderTiming, useNow } from '../utils/order-timing';

const TONES = {
  normal: { bg: '#EFF6FF', border: '#BFDBFE', text: '#1D4ED8' },
  warning: { bg: '#FFFBEB', border: '#FCD34D', text: '#B45309' },
  overdue: { bg: '#FEF2F2', border: '#FCA5A5', text: '#B91C1C' },
} as const;

type Props = {
  order: Order;
  /** Base badge container style (padding, radius…). Tone colours are applied on top. */
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  iconSize?: number;
};

/**
 * Live countdown for an accepted ASAP order (acceptedAt + expected minutes).
 * Falls back to the static "Expected: X mins" text when there is no countdown
 * (new / scheduled / older orders without acceptedAt).
 */
export function OrderCountdownBadge({ order, style, textStyle, iconSize = 11 }: Props) {
  const now = useNow();
  const timing = getOrderTiming(order, now);
  const expectedMins = order.expectedDeliveryTime || order.deliveryTime || 30;

  if (timing.kind !== 'countdown') {
    return (
      <View style={style}>
        <Clock size={iconSize} color={TONES.normal.text} />
        <Text style={[{ color: TONES.normal.text }, textStyle]}>
          Expected: {expectedMins} mins
        </Text>
      </View>
    );
  }

  const tone = TONES[timing.tone];
  const overdue = timing.tone === 'overdue';
  const time = formatDuration(timing.remainingMs);
  const text = overdue ? `Overdue +${time}` : `${time} left`;
  const Icon = overdue ? AlertTriangle : Clock;

  return (
    <View
      style={[style, { backgroundColor: tone.bg, borderColor: tone.border }]}
      accessibilityLabel={overdue ? `Order overdue by ${time}` : `${time} remaining of ${expectedMins} minutes`}
    >
      <Icon size={iconSize} color={tone.text} />
      <Text style={[textStyle, { color: tone.text, fontVariant: ['tabular-nums'] }]}>{text}</Text>
    </View>
  );
}

/**
 * Text-only variant for the order details screens, which already render their own
 * "EXPECTED DELIVERY TIME" card: "24:13 left · 30 mins", "Overdue +03:20 · 30 mins" or "30 mins".
 */
export function OrderCountdownText({ order, style }: { order: Order; style?: StyleProp<TextStyle> }) {
  const now = useNow();
  const timing = getOrderTiming(order, now);
  const expectedMins = order.expectedDeliveryTime || order.deliveryTime || 30;

  if (timing.kind !== 'countdown') return <Text style={style}>{expectedMins} mins</Text>;

  const time = formatDuration(timing.remainingMs);
  const overdue = timing.tone === 'overdue';
  return (
    <Text style={[style, { color: TONES[timing.tone].text, fontVariant: ['tabular-nums'] }]}>
      {overdue ? `Overdue +${time}` : `${time} left`}
      <Text style={{ fontSize: 12, fontWeight: '600', color: '#64748B' }}>{`  ·  ${expectedMins} mins`}</Text>
    </Text>
  );
}

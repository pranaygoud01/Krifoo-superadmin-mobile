import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TrendingUp, TrendingDown, Minus, AlertTriangle } from 'lucide-react-native';
import { Colors } from '../../constants/colors';
import { formatPercent } from '../../services/admin-metrics';

/** Change badge: icon + signed text (never colour alone). `null` = no previous data ("New"). */
export function Delta({ value, lowerIsBetter, absolute, small }: { value: number | null; lowerIsBetter?: boolean; absolute?: boolean; small?: boolean }) {
  if (value === null) {
    return (
      <View style={[styles.delta, { backgroundColor: Colors.statusActive.bg }]}>
        <Text style={[styles.deltaText, small && styles.deltaSmall, { color: Colors.statusActive.text }]}>New</Text>
      </View>
    );
  }
  const flat = Math.abs(value) < (absolute ? 0.0005 : 0.005);
  const good = flat ? null : lowerIsBetter ? value < 0 : value > 0;
  const color = good === null ? Colors.textMuted : good ? Colors.statusApproved.text : Colors.statusRejected.text;
  const bg = good === null ? Colors.cardSurface : good ? Colors.statusApproved.bg : Colors.statusRejected.bg;
  const Icon = flat ? Minus : value > 0 ? TrendingUp : TrendingDown;
  const text = flat
    ? '0%'
    : absolute
    ? `${value > 0 ? '+' : '−'}${(Math.abs(value) * 100).toFixed(1)} pts`
    : `${value > 0 ? '+' : '−'}${formatPercent(Math.abs(value), 0)}`;
  return (
    <View style={[styles.delta, { backgroundColor: bg }]} accessibilityLabel={`Change ${text}`}>
      <Icon size={small ? 12 : 14} color={color} />
      <Text style={[styles.deltaText, small && styles.deltaSmall, { color }]}>{text}</Text>
    </View>
  );
}

export function Flag({ label }: { label: string }) {
  return (
    <View style={styles.flag}>
      <AlertTriangle size={11} color={Colors.statusPending.text} />
      <Text style={styles.flagText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  delta: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 26, paddingHorizontal: 9, borderRadius: 13, alignSelf: 'flex-start' },
  deltaText: { fontSize: 13, fontWeight: '800' },
  deltaSmall: { fontSize: 11.5 },
  flag: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 20, paddingHorizontal: 7, borderRadius: 10, backgroundColor: Colors.statusPending.bg },
  flagText: { fontSize: 11, fontWeight: '700', color: Colors.statusPending.text },
});

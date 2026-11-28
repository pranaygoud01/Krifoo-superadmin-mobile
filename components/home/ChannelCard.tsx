import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { ChevronRight } from 'lucide-react-native';

type IconType = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

interface Tone {
  /** Main colour (icon, count). */
  color: string;
  /** Light tile background. */
  tint: string;
}

/**
 * Home "order channels" cards.
 *  - variant="action": primary call-to-action (solid brand colour), e.g. New order → POS.
 *  - variant="stat":   a channel with its live active-order count, e.g. Dine-in · 46 active.
 */
export function ChannelCard({
  variant = 'stat',
  title,
  subtitle,
  count,
  icon: Icon,
  tone,
  onPress,
  size = 'phone',
}: {
  variant?: 'action' | 'stat';
  title: string;
  /** Action: short helper text. Stat: optional override of the status line. */
  subtitle?: string;
  count?: number;
  icon: IconType;
  tone: Tone;
  onPress: () => void;
  size?: 'compact' | 'phone' | 'tablet';
}) {
  const isAction = variant === 'action';
  const s = SIZES[size];
  const active = (count ?? 0) > 0;
  const status = subtitle ?? (active ? 'active now' : 'No active orders');

  return (
    <TouchableOpacity
      style={[
        styles.card,
        { minHeight: s.minHeight, padding: s.padding },
        isAction ? [styles.actionCard, { backgroundColor: tone.color, shadowColor: tone.color }] : styles.statCard,
      ]}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={isAction ? `${title}. ${subtitle || ''}` : `${title}: ${count ?? 0} active orders`}
    >
      {/* Top row: icon tile + affordance */}
      <View style={styles.topRow}>
        <View
          style={[
            styles.iconTile,
            { width: s.tile, height: s.tile, borderRadius: s.tile * 0.3 },
            { backgroundColor: isAction ? 'rgba(255,255,255,0.22)' : tone.tint },
          ]}
        >
          <Icon size={s.icon} color={isAction ? '#FFFFFF' : tone.color} strokeWidth={2.2} />
        </View>
        {isAction ? null : <ChevronRight size={18} color="#94A3B8" />}
      </View>

      {/* Body */}
      {isAction ? (
        <View style={styles.body}>
          <Text style={[styles.actionTitle, { fontSize: s.title }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={[styles.actionSub, { fontSize: s.sub }]} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      ) : (
        <View style={styles.body}>
          <View style={styles.countRow}>
            <Text style={[styles.count, { fontSize: s.count, color: active ? '#0F172A' : '#CBD5E1' }]} numberOfLines={1}>
              {count ?? 0}
            </Text>
            {active ? <View style={[styles.liveDot, { backgroundColor: tone.color }]} /> : null}
          </View>
          {/* Two lines allowed: "Dine-in & Takeaway" doesn't fit one line on small phones */}
          <Text style={[styles.statTitle, { fontSize: s.title }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.85}>
            {title}
          </Text>
          <Text style={[styles.statSub, { fontSize: s.sub }, active && { color: tone.color }]} numberOfLines={1}>
            {status}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const SIZES = {
  // Filled flat icons fill more of their box than outline icons, so they sit a little larger in the tile
  compact: { minHeight: 118, padding: 12, tile: 34, icon: 20, title: 14, sub: 12, count: 24 },
  phone: { minHeight: 132, padding: 14, tile: 38, icon: 23, title: 15, sub: 12.5, count: 28 },
  tablet: { minHeight: 148, padding: 18, tile: 44, icon: 26, title: 16.5, sub: 13.5, count: 32 },
} as const;

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 0,
    borderRadius: 18,
    justifyContent: 'space-between',
  },
  statCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E9EDF2',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  actionCard: {
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 4,
  },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  iconTile: { alignItems: 'center', justifyContent: 'center' },
  body: { marginTop: 10 },
  actionTitle: { fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.3 },
  actionSub: { fontWeight: '600', color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  countRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  count: { fontWeight: '800', letterSpacing: -0.8, fontVariant: ['tabular-nums'] },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  statTitle: { fontWeight: '700', color: '#0F172A', marginTop: 2 },
  statSub: { fontWeight: '600', color: '#94A3B8', marginTop: 2 },
});

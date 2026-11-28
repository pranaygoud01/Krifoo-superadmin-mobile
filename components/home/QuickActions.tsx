/**
 * Home: shortcuts to the restaurant's day-to-day screens.
 * A titled card with an even grid of tiles, each in its own colour: icon, label, a short hint and an optional count.
 * Phones: 4 per row; tablets: all in one row (or 4 per row when narrow).
 */
import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '../../constants/colors';

/** Any icon with lucide's props: lucide icons or the flat icons in components/icons. */
type IconType = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

/**
 * Tile colours: a soft tint behind the icon and a deep shade of the same hue for the icon itself
 * (every icon shade is well above 3:1 contrast on its tint). Distinct hues so neighbouring tiles
 * are easy to tell apart at a glance.
 */
export const QUICK_ACTION_TONES = {
  orange: { icon: '#C2410C', bg: '#FFF1EA' },
  teal: { icon: '#0F766E', bg: '#E7F6F3' },
  blue: { icon: '#1D4ED8', bg: '#EBF1FE' },
  violet: { icon: '#6D28D9', bg: '#F3EEFE' },
  green: { icon: '#15803D', bg: '#E9F7EE' },
  pink: { icon: '#BE185D', bg: '#FDEEF4' },
  slate: { icon: '#334155', bg: '#EEF2F6' },
} as const;

export type QuickActionTone = keyof typeof QUICK_ACTION_TONES;

export interface QuickActionItem {
  key: string;
  label: string;
  /** Short line under the label (tablets): "Live tables", "Riders"… */
  hint?: string;
  icon: IconType;
  /** Tile colour (default: slate) */
  tone?: QuickActionTone;
  badge?: number;
  onPress: () => void;
}

export function QuickActions({ items, isTablet }: { items: QuickActionItem[]; isTablet?: boolean }) {
  const [width, setWidth] = useState(0);
  const cols = isTablet ? (width >= 860 ? items.length : 4) : 4;
  const GAP = isTablet ? 12 : 8;
  const tileW = width > 0 ? Math.floor((width - GAP * (cols - 1)) / cols) : 0;

  return (
    <View style={[styles.card, isTablet && styles.cardTablet]}>
      <Text style={[styles.title, isTablet && styles.titleTablet]} accessibilityRole="header">
        Quick actions
      </Text>
      <View style={[styles.grid, { gap: GAP }]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} testID="quick-actions-grid">
        {items.map(({ key, label, hint, icon: Icon, tone, badge, onPress }) => {
          const colors = QUICK_ACTION_TONES[tone || 'slate'];
          return (
            <TouchableOpacity
              key={key}
              style={[styles.tile, { width: tileW > 0 ? tileW : (`${Math.floor(100 / cols) - 2}%` as const) }, isTablet && styles.tileTablet]}
              onPress={onPress}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel={`${label}${badge ? `, ${badge}` : ''}${hint ? `. ${hint}` : ''}`}
            >
              <View style={[styles.iconBox, isTablet && styles.iconBoxTablet, { backgroundColor: colors.bg }]} testID={`quick-action-icon-${key}`}>
                <Icon size={isTablet ? 29 : 25} color={colors.icon} strokeWidth={2.2} />
                {badge ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={[styles.label, isTablet && styles.labelTablet]} numberOfLines={1}>
                {label}
              </Text>
              {isTablet && hint ? (
                <Text style={styles.hint} numberOfLines={1}>
                  {hint}
                </Text>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 4,
    marginBottom: 16,
    padding: 14,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  cardTablet: { padding: 18, borderRadius: 20 },
  title: { fontSize: 15, fontWeight: '800', color: Colors.text, letterSpacing: -0.3, marginBottom: 12 },
  titleTablet: { fontSize: 17, marginBottom: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  tile: { alignItems: 'center', paddingVertical: 8, borderRadius: 14 },
  tileTablet: { paddingVertical: 12, backgroundColor: Colors.cardSurface },
  iconBox: { width: 50, height: 50, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  iconBoxTablet: { width: 56, height: 56, borderRadius: 17 },
  label: { marginTop: 8, fontSize: 12.5, fontWeight: '700', color: Colors.text },
  labelTablet: { fontSize: 14 },
  hint: { marginTop: 2, fontSize: 11.5, color: Colors.textMuted },
  badge: {
    position: 'absolute',
    top: -6,
    right: -8,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    backgroundColor: '#111827',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 10.5, fontWeight: '800', color: '#FFFFFF' },
});

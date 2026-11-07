/**
 * Shared building blocks for list screens (Tables, Reservations, Drivers, Marketing).
 * Same visual language as the Settings form kit: white cards, brand-orange accents.
 */
import React from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Search, X, CircleAlert, RotateCcw } from 'lucide-react-native';
import { Colors } from '../../constants/colors';

export type IconType = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

/* ── Search ──────────────────────────────────────────────────────────────── */

export function SearchBar({ value, onChangeText, placeholder }: { value: string; onChangeText: (v: string) => void; placeholder: string }) {
  return (
    <View style={styles.search}>
      <Search size={17} color={Colors.textSubtle} />
      <TextInput
        style={[styles.searchInput, Platform.OS === 'web' && ({ outlineStyle: 'none' } as any)]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={Colors.textSubtle}
        autoCorrect={false}
        returnKeyType="search"
        accessibilityLabel={placeholder}
      />
      {value ? (
        <TouchableOpacity onPress={() => onChangeText('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Clear search">
          <X size={16} color={Colors.textSubtle} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

/* ── Filter chips ────────────────────────────────────────────────────────── */

export function FilterChips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <TouchableOpacity
            key={o.value}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => onChange(o.value)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{o.label}</Text>
            {o.count !== undefined ? (
              <View style={[styles.chipCount, active && styles.chipCountActive]}>
                <Text style={[styles.chipCountText, active && styles.chipCountTextActive]}>{o.count}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

/* ── Badges ──────────────────────────────────────────────────────────────── */

const TONES = {
  success: { bg: Colors.statusApproved.bg, fg: Colors.statusApproved.text },
  warning: { bg: Colors.statusPending.bg, fg: Colors.statusPending.text },
  danger: { bg: Colors.statusRejected.bg, fg: Colors.statusRejected.text },
  info: { bg: Colors.statusActive.bg, fg: Colors.statusActive.text },
  neutral: { bg: Colors.cardSurface, fg: Colors.textMuted },
  brand: { bg: Colors.primaryLight, fg: Colors.primaryDark },
};
export type BadgeTone = keyof typeof TONES;

export function Badge({ label, tone = 'neutral', icon: Icon }: { label: string; tone?: BadgeTone; icon?: IconType }) {
  const t = TONES[tone];
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }]}>
      {Icon ? <Icon size={12} color={t.fg} /> : null}
      <Text style={[styles.badgeText, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

/* ── Card & actions ──────────────────────────────────────────────────────── */

export function Card({ children, style, muted }: { children: React.ReactNode; style?: any; muted?: boolean }) {
  return <View style={[styles.card, muted && styles.cardMuted, style]}>{children}</View>;
}

export function IconAction({
  icon: Icon,
  label,
  onPress,
  tone,
  busy,
}: {
  icon: IconType;
  label: string;
  onPress: () => void;
  tone?: 'danger';
  busy?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.iconAction, tone === 'danger' && styles.iconActionDanger]}
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
    >
      {busy ? <ActivityIndicator size="small" color={Colors.primary} /> : <Icon size={17} color={tone === 'danger' ? Colors.danger : Colors.textMuted} />}
    </TouchableOpacity>
  );
}

export function TextAction({
  label,
  onPress,
  tone = 'secondary',
  icon: Icon,
  busy,
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  tone?: 'primary' | 'secondary' | 'danger';
  icon?: IconType;
  busy?: boolean;
  disabled?: boolean;
  style?: any;
}) {
  const fg = tone === 'primary' ? '#FFFFFF' : tone === 'danger' ? Colors.danger : Colors.text;
  return (
    <TouchableOpacity
      style={[styles.textAction, styles[`textAction_${tone}` as const], (disabled || busy) && { opacity: 0.6 }, style]}
      onPress={onPress}
      disabled={disabled || busy}
      activeOpacity={0.85}
      accessibilityRole="button"
    >
      {busy ? (
        <ActivityIndicator size="small" color={fg} />
      ) : (
        <>
          {Icon ? <Icon size={15} color={fg} /> : null}
          <Text style={[styles.textActionLabel, { color: fg }]}>{label}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

/* ── Empty / error states ────────────────────────────────────────────────── */

export function EmptyState({
  icon: Icon,
  title,
  message,
  actionLabel,
  onAction,
}: {
  icon: IconType;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Icon size={28} color={Colors.primary} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {message ? <Text style={styles.emptyText}>{message}</Text> : null}
      {actionLabel && onAction ? <TextAction label={actionLabel} tone="primary" onPress={onAction} style={styles.emptyBtn} /> : null}
    </View>
  );
}

export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: Colors.statusRejected.bg }]}>
        <CircleAlert size={28} color={Colors.danger} />
      </View>
      <Text style={styles.emptyTitle}>Couldn’t load</Text>
      <Text style={styles.emptyText}>{message}</Text>
      <TextAction label="Try again" icon={RotateCcw} tone="primary" onPress={onRetry} style={styles.emptyBtn} />
    </View>
  );
}

/* ── Floating add button ─────────────────────────────────────────────────── */

export function Fab({ label, icon: Icon, onPress }: { label: string; icon: IconType; onPress: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <TouchableOpacity
      style={[styles.fab, { bottom: Math.max(insets.bottom, 12) + 12 }]}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Icon size={20} color="#FFFFFF" />
      <Text style={styles.fabText}>{label}</Text>
    </TouchableOpacity>
  );
}

/** Bottom padding for lists so the last card isn't hidden behind the floating button. */
export const FAB_SPACE = 104;

/* ── Small helpers ───────────────────────────────────────────────────────── */

export const formatGBP = (n: unknown) => {
  const v = Number(n);
  return `£${(isNaN(v) ? 0 : v).toFixed(2)}`;
};

export const initials = (name?: string) =>
  (name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('') || '?';

export const listStyles = StyleSheet.create({
  toolbar: { backgroundColor: Colors.background, borderBottomWidth: 1, borderBottomColor: Colors.cardBorder, paddingTop: 12, paddingBottom: 4 },
  frame: { width: '100%', maxWidth: 820, alignSelf: 'center' },
  sectionHeader: { fontSize: 12, fontWeight: '800', color: Colors.textSubtle, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 8, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  flex: { flex: 1, minWidth: 0 },
  title: { fontSize: 16, fontWeight: '800', color: Colors.text, letterSpacing: -0.2 },
  sub: { fontSize: 13, color: Colors.textMuted, marginTop: 2 },
  meta: { fontSize: 13, color: Colors.textMuted },
  divider: { height: 1, backgroundColor: Colors.cardBorder, marginVertical: 12 },
});

const styles = StyleSheet.create({
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 44,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.cardSurface,
  },
  searchInput: { flex: 1, minWidth: 0, fontSize: 15, color: Colors.text, paddingVertical: 0 },

  chips: { gap: 8, paddingVertical: 10 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.background,
  },
  chipActive: { backgroundColor: Colors.text, borderColor: Colors.text },
  chipText: { fontSize: 13, fontWeight: '700', color: Colors.textMuted },
  chipTextActive: { color: '#FFFFFF' },
  chipCount: { minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: 10, backgroundColor: Colors.cardSurface, alignItems: 'center', justifyContent: 'center' },
  chipCountActive: { backgroundColor: 'rgba(255,255,255,0.2)' },
  chipCountText: { fontSize: 11, fontWeight: '800', color: Colors.textMuted },
  chipCountTextActive: { color: '#FFFFFF' },

  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 24, paddingHorizontal: 9, borderRadius: 12, alignSelf: 'flex-start' },
  badgeText: { fontSize: 12, fontWeight: '800' },

  card: { backgroundColor: Colors.background, borderRadius: 16, borderWidth: 1, borderColor: Colors.cardBorder, padding: 16, marginBottom: 12 },
  cardMuted: { opacity: 0.7 },

  iconAction: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
  iconActionDanger: { borderColor: '#FECACA' },
  textAction: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 40, paddingHorizontal: 14, borderRadius: 12 },
  textAction_primary: { backgroundColor: Colors.primary },
  textAction_secondary: { backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.cardBorder },
  textAction_danger: { backgroundColor: Colors.background, borderWidth: 1, borderColor: '#FECACA' },
  textActionLabel: { fontSize: 14, fontWeight: '800' },

  empty: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 },
  emptyIcon: { width: 64, height: 64, borderRadius: 20, backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: Colors.text, textAlign: 'center' },
  emptyText: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', marginTop: 6, lineHeight: 20, maxWidth: 360 },
  emptyBtn: { marginTop: 16, minWidth: 160 },

  fab: {
    position: 'absolute',
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 52,
    paddingHorizontal: 20,
    borderRadius: 26,
    backgroundColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  fabText: { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },
});

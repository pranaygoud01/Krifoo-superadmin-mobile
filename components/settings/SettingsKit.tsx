/**
 * Shared building blocks for the Settings screens (super admin + store owner).
 * Keeps both screens visually identical and lets each one describe its items as data.
 */
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, ChevronRight, House, Search, SearchX, X } from 'lucide-react-native';
import { Colors } from '../../constants/colors';

export type IconType = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

export type SettingsItem = {
  key: string;
  title: string;
  subtitle?: string;
  icon: IconType;
  color: string; // icon colour
  bg: string; // icon tile background
  badge?: { label: string; tone?: 'info' | 'success' | 'warning' | 'neutral' };
  onPress?: () => void;
  /** Extra words that should match search (e.g. "printer" for "Thermal Printing"). */
  keywords?: string;
  /** Custom content rendered under the title instead of a chevron row (e.g. a segmented control). */
  render?: () => React.ReactNode;
};

export type SettingsSectionData = { key: string; title: string; description?: string; items: SettingsItem[] };

/** Filters sections/items by a free-text query across title, subtitle, keywords and section title. */
export function filterSections(sections: SettingsSectionData[], query: string): SettingsSectionData[] {
  const q = query.trim().toLowerCase();
  if (!q) return sections;
  return sections
    .map((s) => ({
      ...s,
      items: s.items.filter((it) =>
        [it.title, it.subtitle, it.keywords, s.title].filter(Boolean).join(' ').toLowerCase().includes(q)
      ),
    }))
    .filter((s) => s.items.length > 0);
}

/* ── Layout helpers ──────────────────────────────────────────────────────── */

export function useSettingsLayout() {
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const twoColumns = width >= 1024;
  return { isTablet, twoColumns, gutter: isTablet ? 24 : 16 };
}

/* ── Top bar (same pattern as Orders / Stores / Users) ───────────────────── */

export function SettingsTopBar({
  query,
  onQueryChange,
  placeholder = 'Search settings',
}: {
  query: string;
  onQueryChange: (v: string) => void;
  placeholder?: string;
}) {
  const router = useRouter();
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const { gutter } = useSettingsLayout();
  // Show a back arrow only when this screen was pushed (e.g. from the header cog), not on the tab itself.
  const isTabScreen = segments[0] === '(tabs)';
  const showBack = !isTabScreen && router.canGoBack();

  return (
    <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
      <View style={[styles.frame, styles.topBarRow, { paddingHorizontal: gutter }]}>
        {showBack && (
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <ArrowLeft size={20} color={Colors.text} />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.homeBtn}
          onPress={() => router.navigate('/(tabs)')}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Go to Home"
        >
          <House size={20} color={Colors.primary} />
        </TouchableOpacity>
        <View style={styles.search}>
          <Search size={18} color={Colors.textSubtle} />
          <TextInput
            style={[styles.searchInput, Platform.OS === 'web' && ({ outlineStyle: 'none' } as any)]}
            placeholder={placeholder}
            placeholderTextColor={Colors.textSubtle}
            value={query}
            onChangeText={onQueryChange}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            accessibilityLabel="Search settings"
          />
          {query.length > 0 && (
            <TouchableOpacity
              onPress={() => onQueryChange('')}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={styles.clearBtn}
              accessibilityLabel="Clear search"
            >
              <X size={14} color="#FFFFFF" strokeWidth={3} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

/* ── Sections & rows ─────────────────────────────────────────────────────── */

const BADGE_TONES = {
  info: { bg: Colors.statusActive.bg, text: Colors.statusActive.text },
  success: { bg: Colors.statusApproved.bg, text: Colors.statusApproved.text },
  warning: { bg: Colors.statusPending.bg, text: Colors.statusPending.text },
  neutral: { bg: Colors.cardSurface, text: Colors.textMuted },
};

/** Every settings icon uses the same brand colour so the list reads as one calm, consistent set. */
const ICON_COLOR = Colors.primary;
const ICON_BG = Colors.primaryLight;

export function SettingsRow({ item, last }: { item: SettingsItem; last?: boolean }) {
  const Icon = item.icon;
  const tone = BADGE_TONES[item.badge?.tone || 'info'];
  const content = (
    <>
      <View style={[styles.rowIcon, { backgroundColor: ICON_BG }]}>
        <Icon size={19} color={ICON_COLOR} />
      </View>
      <View style={styles.rowBody}>
        <View style={styles.rowTitleLine}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {item.title}
          </Text>
          {item.badge && (
            <View style={[styles.badge, { backgroundColor: tone.bg }]}>
              <Text style={[styles.badgeText, { color: tone.text }]}>{item.badge.label}</Text>
            </View>
          )}
        </View>
        {item.subtitle ? (
          <Text style={styles.rowSubtitle} numberOfLines={2}>
            {item.subtitle}
          </Text>
        ) : null}
        {item.render?.()}
      </View>
      {item.onPress && <ChevronRight size={18} color={Colors.textSubtle} />}
    </>
  );

  if (!item.onPress) return <View style={[styles.row, !last && styles.rowDivider]}>{content}</View>;
  return (
    <TouchableOpacity
      style={[styles.row, !last && styles.rowDivider]}
      onPress={item.onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={item.subtitle ? `${item.title}. ${item.subtitle}` : item.title}
    >
      {content}
    </TouchableOpacity>
  );
}

export function SettingsSection({ section }: { section: SettingsSectionData }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{section.title}</Text>
      {section.description ? <Text style={styles.sectionDesc}>{section.description}</Text> : null}
      <View style={styles.card}>
        {section.items.map((it, i) => (
          <SettingsRow key={it.key} item={it} last={i === section.items.length - 1} />
        ))}
      </View>
    </View>
  );
}

/** Lays sections out in one column, or two balanced columns on wide tablets. */
export function SettingsSectionsGrid({ sections }: { sections: SettingsSectionData[] }) {
  const { twoColumns } = useSettingsLayout();
  if (!twoColumns) return <>{sections.map((s) => <SettingsSection key={s.key} section={s} />)}</>;

  // Balance columns by item count so neither side runs much longer than the other.
  const left: SettingsSectionData[] = [];
  const right: SettingsSectionData[] = [];
  let l = 0;
  let r = 0;
  sections.forEach((s) => {
    const weight = s.items.length + 1;
    if (l <= r) {
      left.push(s);
      l += weight;
    } else {
      right.push(s);
      r += weight;
    }
  });
  return (
    <View style={styles.columns}>
      <View style={styles.column}>{left.map((s) => <SettingsSection key={s.key} section={s} />)}</View>
      <View style={styles.column}>{right.map((s) => <SettingsSection key={s.key} section={s} />)}</View>
    </View>
  );
}

export function SettingsNoResults({ query, onClear }: { query: string; onClear: () => void }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <SearchX size={28} color={Colors.textSubtle} />
      </View>
      <Text style={styles.emptyTitle}>No settings found</Text>
      <Text style={styles.emptyText}>Nothing matches “{query.trim()}”. Try “printer”, “delivery” or “hours”.</Text>
      <TouchableOpacity style={styles.emptyBtn} onPress={onClear}>
        <Text style={styles.emptyBtnText}>Clear search</Text>
      </TouchableOpacity>
    </View>
  );
}

/* ── Danger zone & sign out ──────────────────────────────────────────────── */

export function DangerZone({
  deleteSubtitle,
  onDelete,
  signOutLabel,
  onSignOut,
}: {
  /** Omit to hide the "Delete account" panel (e.g. for super admins). */
  deleteSubtitle?: string;
  onDelete?: () => void;
  signOutLabel: string;
  onSignOut: () => void;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Account</Text>
      <TouchableOpacity
        style={styles.signOutBtn}
        onPress={onSignOut}
        activeOpacity={0.8}
        accessibilityRole="button"
      >
        <Text style={styles.signOutText}>{signOutLabel}</Text>
      </TouchableOpacity>
      {onDelete && (
      <View style={[styles.card, styles.dangerCard]}>
        <View style={styles.dangerRow}>
          <View style={styles.flex}>
            <Text style={styles.dangerTitle}>Delete account</Text>
            <Text style={styles.rowSubtitle}>{deleteSubtitle}</Text>
          </View>
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={onDelete}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Delete account"
          >
            <Text style={styles.deleteText}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
      )}
    </View>
  );
}

/* ── Styles ──────────────────────────────────────────────────────────────── */

export const settingsStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.backgroundSecondary },
  scroll: { paddingTop: 16, paddingBottom: 120 },
  frame: { width: '100%', maxWidth: 1100, alignSelf: 'center' },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: Colors.background,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 16,
    marginBottom: 20,
  },
  heroTablet: { padding: 22, gap: 18 },
  heroAvatar: { width: 60, height: 60, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  heroAvatarText: { fontSize: 22, fontWeight: '800' },
  heroBody: { flex: 1, minWidth: 0 },
  heroTitle: { fontSize: 19, fontWeight: '800', color: Colors.text, letterSpacing: -0.3 },
  heroSub: { fontSize: 13, color: Colors.textMuted, marginTop: 2 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { fontSize: 11, fontWeight: '800' },
  version: { textAlign: 'center', fontSize: 12, color: Colors.textSubtle, marginTop: 8 },
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  frame: { width: '100%', maxWidth: 1100, alignSelf: 'center' },

  topBar: {
    backgroundColor: Colors.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
    paddingBottom: 12,
  },
  topBarRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  homeBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  search: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: Colors.cardSurface,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  searchInput: { flex: 1, minWidth: 0, height: '100%', fontSize: 15, color: Colors.text, paddingVertical: 0 },
  clearBtn: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.textSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },

  columns: { flexDirection: 'row', alignItems: 'flex-start', gap: 20 },
  column: { flex: 1, minWidth: 0 },

  section: { marginBottom: 22 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.textSubtle,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginBottom: 8,
    marginLeft: 4,
  },
  sectionDesc: { fontSize: 13, color: Colors.textMuted, marginTop: -4, marginBottom: 8, marginLeft: 4 },
  card: {
    backgroundColor: Colors.background,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 14, minHeight: 64 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: Colors.cardBorder },
  rowIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1, minWidth: 0 },
  rowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowTitle: { flexShrink: 1, fontSize: 15, fontWeight: '700', color: Colors.text },
  rowSubtitle: { fontSize: 13, color: Colors.textMuted, marginTop: 2, lineHeight: 18 },
  badge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999 },
  badgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },

  empty: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 },
  emptyIcon: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: Colors.text },
  emptyText: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', marginTop: 6, maxWidth: 360, lineHeight: 20 },
  emptyBtn: {
    marginTop: 18,
    height: 42,
    paddingHorizontal: 18,
    borderRadius: 12,
    justifyContent: 'center',
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  emptyBtnText: { fontSize: 14, fontWeight: '700', color: Colors.text },

  signOutBtn: {
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
    borderWidth: 1.5,
    borderColor: Colors.cardBorder,
    marginBottom: 12,
  },
  signOutText: { fontSize: 15, fontWeight: '800', color: Colors.danger },
  dangerCard: { borderColor: '#FECACA' },
  dangerRow: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 16 },
  dangerTitle: { fontSize: 15, fontWeight: '700', color: Colors.text },
  deleteBtn: {
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#FECACA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteText: { fontSize: 14, fontWeight: '800', color: Colors.danger },
});

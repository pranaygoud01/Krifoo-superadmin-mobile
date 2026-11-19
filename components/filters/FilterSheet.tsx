import React from 'react';
import { Modal, View, Text, ScrollView, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, RotateCcw, SlidersHorizontal, X } from 'lucide-react-native';

/**
 * Shared filter / sort sheet used by the Orders and Menu tabs so both look and behave the same:
 * bottom sheet on phones, centred dialog on tablets, sticky footer with Reset + "Show N results".
 */

const BRAND = '#FF5C39';

type SheetProps = {
  visible: boolean;
  onClose: () => void;
  title: string;
  /** e.g. "Showing 12 of 40 orders" */
  subtitle?: string;
  /** Number of non-default choices in this sheet; shows Reset when > 0. */
  activeCount: number;
  onReset: () => void;
  /** Primary button label, e.g. "Show 12 orders". */
  applyLabel: string;
  children: React.ReactNode;
};

export function FilterSheet({ visible, onClose, title, subtitle, activeCount, onReset, applyLabel, children }: SheetProps) {
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType={isTablet ? 'fade' : 'slide'} onRequestClose={onClose}>
      <View style={[styles.overlay, isTablet && styles.overlayTablet]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} accessibilityLabel="Close filters" />

        <View style={[styles.sheet, isTablet && styles.sheetTablet]}>
          {!isTablet && <View style={styles.grabber} />}

          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <SlidersHorizontal size={18} color={BRAND} />
            </View>
            <View style={styles.flex}>
              <View style={styles.titleRow}>
                <Text style={styles.title}>{title}</Text>
                {activeCount > 0 && (
                  <View style={styles.activeBadge}>
                    <Text style={styles.activeBadgeText}>{activeCount}</Text>
                  </View>
                )}
              </View>
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close">
              <X size={18} color="#475569" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>

          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 14) }]}>
            <TouchableOpacity
              style={[styles.resetBtn, activeCount === 0 && styles.resetBtnDisabled]}
              onPress={onReset}
              disabled={activeCount === 0}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel="Reset all filters"
            >
              <RotateCcw size={15} color={activeCount === 0 ? '#9BA1A6' : '#11181C'} />
              <Text style={[styles.resetText, activeCount === 0 && { color: '#9BA1A6' }]}>Reset</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.applyBtn} onPress={onClose} activeOpacity={0.85} accessibilityRole="button">
              <Check size={17} color="#FFFFFF" strokeWidth={2.6} />
              <Text style={styles.applyText} numberOfLines={1}>{applyLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function FilterSection({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {hint ? <Text style={styles.sectionHint}>{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}

export type FilterOption<T extends string> = {
  value: T;
  label: string;
  /** Number of results for this option (shown as a small badge). */
  count?: number;
  Icon?: React.ComponentType<{ size?: number; color?: string }>;
  /** Small coloured dot before the label (e.g. veg / non-veg). */
  dotColor?: string;
  /** Accent used when selected (defaults to brand orange). */
  accent?: string;
};

type ChipsProps<T extends string> = {
  options: readonly FilterOption<T>[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel?: string;
};

/** Single-select chip group. The first option is conventionally "All". */
export function FilterChips<T extends string>({ options, value, onChange, accessibilityLabel }: ChipsProps<T>) {
  return (
    <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel}>
      {options.map((opt) => {
        const selected = opt.value === value;
        const accent = opt.accent || BRAND;
        const { Icon } = opt;
        return (
          <TouchableOpacity
            key={opt.value}
            style={[styles.chip, selected && { borderColor: accent, backgroundColor: `${accent}14` }]}
            onPress={() => onChange(opt.value)}
            activeOpacity={0.75}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={opt.count !== undefined ? `${opt.label}, ${opt.count}` : opt.label}
          >
            {selected && !Icon && !opt.dotColor ? <Check size={14} color={accent} strokeWidth={3} /> : null}
            {Icon ? <Icon size={15} color={selected ? accent : '#687076'} /> : null}
            {opt.dotColor ? <View style={[styles.dot, { backgroundColor: opt.dotColor }]} /> : null}
            <Text style={[styles.chipText, selected && { color: accent, fontWeight: '800' }]}>{opt.label}</Text>
            {opt.count !== undefined && (
              <View style={[styles.count, selected && { backgroundColor: accent }]}>
                <Text style={[styles.countText, selected && { color: '#FFFFFF' }]}>{opt.count}</Text>
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  overlay: { flex: 1, backgroundColor: 'rgba(17, 24, 28, 0.5)', justifyContent: 'flex-end' },
  overlayTablet: { justifyContent: 'center', alignItems: 'center', padding: 24 },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '88%',
    overflow: 'hidden',
  },
  sheetTablet: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '85%',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 12,
  },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#D9DCE0', marginTop: 8 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F1F3',
  },
  headerIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#FFF0EC', alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 18, fontWeight: '800', color: '#11181C', letterSpacing: -0.3 },
  activeBadge: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  activeBadgeText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  subtitle: { fontSize: 13, color: '#687076', marginTop: 2, fontWeight: '500' },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F4F5F7', alignItems: 'center', justifyContent: 'center' },

  body: { flexGrow: 0 },
  bodyContent: { paddingHorizontal: 18, paddingTop: 6, paddingBottom: 18 },
  section: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F4F5F7' },
  sectionHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 10 },
  sectionTitle: { fontSize: 12.5, fontWeight: '800', color: '#11181C', letterSpacing: 0.6, textTransform: 'uppercase' },
  sectionHint: { fontSize: 12, color: '#9BA1A6', fontWeight: '500', flexShrink: 1, textAlign: 'right' },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  chipText: { fontSize: 13.5, fontWeight: '600', color: '#374151' },
  dot: { width: 9, height: 9, borderRadius: 5 },
  count: { minWidth: 22, height: 20, borderRadius: 10, backgroundColor: '#F1F3F5', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  countText: { fontSize: 11.5, fontWeight: '800', color: '#687076' },

  footer: { flexDirection: 'row', gap: 10, paddingHorizontal: 18, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F0F1F3' },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 50,
    paddingHorizontal: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D0D5DB',
  },
  resetBtnDisabled: { borderColor: '#EEF0F2' },
  resetText: { fontSize: 15, fontWeight: '700', color: '#11181C' },
  applyBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 50, borderRadius: 10, backgroundColor: BRAND },
  applyText: { fontSize: 15.5, fontWeight: '800', color: '#FFFFFF' },
});

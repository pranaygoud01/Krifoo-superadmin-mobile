/**
 * Dropdown field with a searchable list.
 * Tapping the field opens a sheet (bottom sheet on phones, centred card on tablets)
 * with a search box and the filtered options.
 */
import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  FlatList,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
  useWindowDimensions,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronDown, Search, X, Check } from 'lucide-react-native';

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
}

interface Props {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Title shown at the top of the sheet. */
  title?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  loading?: boolean;
  /** Optional action shown at the bottom of the sheet (e.g. "Manage categories"). */
  footerAction?: { label: string; onPress: () => void };
  error?: boolean;
}

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Select…',
  title = 'Select',
  searchPlaceholder = 'Search…',
  emptyText = 'No matches',
  loading,
  footerAction,
  error,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isTablet = width >= 768;

  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    // Names starting with the search first, then names containing it
    const starts = options.filter((o) => o.label.toLowerCase().startsWith(q));
    const contains = options.filter((o) => !o.label.toLowerCase().startsWith(q) && o.label.toLowerCase().includes(q));
    return [...starts, ...contains];
  }, [options, query]);

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  const pick = (v: string) => {
    onChange(v);
    close();
  };

  return (
    <>
      <TouchableOpacity
        style={[styles.trigger, error && styles.triggerError]}
        onPress={() => setOpen(true)}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={`${title}: ${selected ? selected.label : 'not selected'}`}
        accessibilityHint="Opens a searchable list"
      >
        <Text style={[styles.triggerText, !selected && styles.placeholder]} numberOfLines={1}>
          {selected ? selected.label : value || placeholder}
        </Text>
        {loading ? <ActivityIndicator size="small" color="#94A3B8" /> : <ChevronDown size={18} color="#64748B" />}
      </TouchableOpacity>

      <Modal visible={open} transparent animationType={isTablet ? 'fade' : 'slide'} onRequestClose={close} statusBarTranslucent>
        <KeyboardAvoidingView style={[styles.backdrop, isTablet && styles.backdropTablet]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={close} accessibilityLabel="Close" />
          <View
            style={[
              styles.sheet,
              isTablet ? styles.sheetTablet : { paddingBottom: Math.max(insets.bottom, 12) },
              { maxHeight: height * (isTablet ? 0.7 : 0.8) },
            ]}
          >
            {!isTablet && <View style={styles.handle} />}

            <View style={styles.header}>
              <Text style={styles.title}>{title}</Text>
              <TouchableOpacity onPress={close} style={styles.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Close">
                <X size={16} color="#475569" />
              </TouchableOpacity>
            </View>

            <View style={styles.search}>
              <Search size={16} color="#94A3B8" />
              <TextInput
                style={styles.searchInput}
                placeholder={searchPlaceholder}
                placeholderTextColor="#94A3B8"
                value={query}
                onChangeText={setQuery}
                autoFocus
                autoCorrect={false}
                returnKeyType="search"
                onSubmitEditing={() => filtered.length === 1 && pick(filtered[0].value)}
                accessibilityLabel={searchPlaceholder}
              />
              {query ? (
                <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Clear search">
                  <X size={15} color="#94A3B8" />
                </TouchableOpacity>
              ) : null}
            </View>

            <FlatList
              data={filtered}
              keyExtractor={(o) => o.value}
              keyboardShouldPersistTaps="handled"
              style={styles.list}
              initialNumToRender={20}
              renderItem={({ item }) => {
                const isSelected = item.value === value;
                return (
                  <TouchableOpacity
                    style={[styles.option, isSelected && styles.optionSelected]}
                    onPress={() => pick(item.value)}
                    activeOpacity={0.7}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isSelected }}
                  >
                    <View style={styles.flex}>
                      <Text style={[styles.optionLabel, isSelected && styles.optionLabelSelected]} numberOfLines={1}>
                        {item.label}
                      </Text>
                      {item.description ? (
                        <Text style={styles.optionDesc} numberOfLines={1}>
                          {item.description}
                        </Text>
                      ) : null}
                    </View>
                    {isSelected ? <Check size={18} color="#FF5C39" strokeWidth={2.5} /> : null}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Text style={styles.emptyText}>{loading ? 'Loading…' : query ? `No results for “${query}”` : emptyText}</Text>
                </View>
              }
            />

            {footerAction ? (
              <TouchableOpacity
                style={styles.footerBtn}
                onPress={() => {
                  close();
                  footerAction.onPress();
                }}
                accessibilityRole="button"
              >
                <Text style={styles.footerBtnText}>{footerAction.label}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    borderWidth: 1.2,
    borderRadius: 11,
    paddingHorizontal: 13,
    height: 46,
  },
  triggerError: { borderColor: '#DC2626' },
  triggerText: { flex: 1, fontSize: 13.5, color: '#0F172A', fontWeight: '600' },
  placeholder: { color: '#94A3B8', fontWeight: '400' },

  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15, 23, 42, 0.45)' },
  backdropTablet: { justifyContent: 'center', alignItems: 'center', padding: 24 },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  sheetTablet: { width: 460, maxWidth: '100%', borderRadius: 18, paddingBottom: 12 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#E2E8F0', marginBottom: 8 },
  header: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  title: { flex: 1, fontSize: 16, fontWeight: '800', color: '#0F172A' },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    borderRadius: 11,
    paddingHorizontal: 12,
    height: 44,
    marginBottom: 8,
  },
  searchInput: { flex: 1, minWidth: 0, fontSize: 14, color: '#0F172A', paddingVertical: 0 },
  list: { flexGrow: 0 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    minHeight: 48,
    paddingVertical: 10,
    borderRadius: 10,
  },
  optionSelected: { backgroundColor: '#FFF4F1' },
  optionLabel: { fontSize: 14.5, fontWeight: '600', color: '#0F172A' },
  optionLabelSelected: { color: '#FF5C39', fontWeight: '800' },
  optionDesc: { fontSize: 12, color: '#64748B', marginTop: 1 },
  empty: { paddingVertical: 28, alignItems: 'center' },
  emptyText: { fontSize: 13.5, color: '#64748B' },
  footerBtn: {
    marginTop: 8,
    height: 44,
    borderRadius: 11,
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerBtnText: { fontSize: 13.5, fontWeight: '700', color: '#334155' },
});

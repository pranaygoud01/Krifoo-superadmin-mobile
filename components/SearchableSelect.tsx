/**
 * Dropdown field with a searchable list.
 * Tapping the field opens a sheet (bottom sheet on phones, centred card on tablets)
 * with a search box and the filtered options. With `create`, the same sheet can also
 * create a new option (shown in place — no second modal on top of this one).
 */
import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  FlatList,
  ScrollView,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
  useWindowDimensions,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronDown, Search, X, Check, Plus, ArrowLeft } from 'lucide-react-native';
import { KEYBOARD_BEHAVIOR } from '../utils/keyboard';

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
  /**
   * Allow creating a new option from the sheet. `onCreate` saves it and returns the value to
   * select (or throws / returns null on failure — its error message is shown in the form).
   */
  create?: {
    /** Noun for the button and form title, e.g. "category". */
    noun: string;
    onCreate: (input: { name: string; description: string }) => Promise<string | null>;
    namePlaceholder?: string;
    descriptionPlaceholder?: string;
    maxNameLength?: number;
  };
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
  create,
  error,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  // Create mode (replaces the list inside the same sheet)
  const [mode, setMode] = useState<'list' | 'create'>('list');
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
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
    if (creating) return;
    setOpen(false);
    setQuery('');
    setMode('list');
    setCreateError(null);
  };

  const trimmedQuery = query.trim();
  const exactMatch = options.some((o) => o.label.trim().toLowerCase() === trimmedQuery.toLowerCase());
  const noun = create?.noun || 'option';
  const capitalNoun = noun.charAt(0).toUpperCase() + noun.slice(1);

  const startCreate = (prefill: string) => {
    setNewName(prefill.slice(0, create?.maxNameLength ?? 60));
    setNewDescription('');
    setCreateError(null);
    setMode('create');
  };

  const submitCreate = async () => {
    if (!create) return;
    const name = newName.trim();
    if (!name) {
      setCreateError(`Enter a name for the ${noun}.`);
      return;
    }
    const existing = options.find((o) => o.label.trim().toLowerCase() === name.toLowerCase());
    if (existing) {
      // Already there — just select it.
      onChange(existing.value);
      close();
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const createdValue = await create.onCreate({ name, description: newDescription.trim() });
      if (!createdValue) throw new Error(`Couldn’t create the ${noun}.`);
      setCreating(false);
      onChange(createdValue);
      setOpen(false);
      setQuery('');
      setMode('list');
    } catch (e: any) {
      setCreateError(e?.message || `Couldn’t create the ${noun}. Please try again.`);
      setCreating(false);
    }
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
        <KeyboardAvoidingView style={[styles.backdrop, isTablet && styles.backdropTablet, { paddingTop: insets.top + 8 }]} behavior={KEYBOARD_BEHAVIOR}>
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
              {mode === 'create' ? (
                <TouchableOpacity
                  onPress={() => !creating && setMode('list')}
                  style={[styles.closeBtn, styles.backBtn]}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityLabel="Back to list"
                >
                  <ArrowLeft size={16} color="#475569" />
                </TouchableOpacity>
              ) : null}
              <Text style={styles.title}>{mode === 'create' ? `New ${noun}` : title}</Text>
              <TouchableOpacity onPress={close} style={styles.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Close">
                <X size={16} color="#475569" />
              </TouchableOpacity>
            </View>

            {mode === 'create' && create ? (
              <ScrollView style={styles.createScroll} contentContainerStyle={styles.createForm} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <Text style={styles.fieldLabel}>
                  {capitalNoun} name <Text style={styles.required}>*</Text>
                </Text>
                <TextInput
                  style={[styles.field, createError && !newName.trim() && styles.fieldError]}
                  value={newName}
                  onChangeText={(t) => {
                    setNewName(t);
                    if (createError) setCreateError(null);
                  }}
                  placeholder={create.namePlaceholder || `e.g. Starters`}
                  placeholderTextColor="#94A3B8"
                  maxLength={create.maxNameLength ?? 60}
                  autoFocus
                  autoCapitalize="words"
                  returnKeyType="done"
                  onSubmitEditing={submitCreate}
                  accessibilityLabel={`${capitalNoun} name`}
                />
                <Text style={styles.fieldLabel}>Description (optional)</Text>
                <TextInput
                  style={[styles.field, styles.fieldMultiline]}
                  value={newDescription}
                  onChangeText={setNewDescription}
                  placeholder={create.descriptionPlaceholder || 'Shown to customers under the name'}
                  placeholderTextColor="#94A3B8"
                  multiline
                  maxLength={200}
                  accessibilityLabel="Description"
                />
                {createError ? <Text style={styles.createError}>{createError}</Text> : null}
                <View style={styles.footerRow}>
                  <TouchableOpacity style={styles.footerBtn} onPress={() => setMode('list')} disabled={creating} accessibilityRole="button">
                    <Text style={styles.footerBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.footerBtn, styles.footerBtnPrimary, creating && { opacity: 0.7 }]}
                    onPress={submitCreate}
                    disabled={creating}
                    accessibilityRole="button"
                  >
                    {creating ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <>
                        <Check size={15} color="#FFFFFF" strokeWidth={2.5} />
                        <Text style={[styles.footerBtnText, styles.footerBtnTextPrimary]}>Create & select</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </ScrollView>
            ) : (
              <>
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
              ListHeaderComponent={
                create && trimmedQuery && !exactMatch ? (
                  <TouchableOpacity style={styles.createRow} onPress={() => startCreate(trimmedQuery)} activeOpacity={0.7} accessibilityRole="button">
                    <View style={styles.createIcon}>
                      <Plus size={16} color="#FF5C39" strokeWidth={2.5} />
                    </View>
                    <Text style={styles.createRowText} numberOfLines={1}>
                      Create {noun} “{trimmedQuery}”
                    </Text>
                  </TouchableOpacity>
                ) : null
              }
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
                  <Text style={styles.emptyText}>
                    {loading ? 'Loading…' : query ? (create ? `No ${noun} called “${trimmedQuery}” yet.` : `No results for “${query}”`) : emptyText}
                  </Text>
                </View>
              }
            />

            {create || footerAction ? (
              <View style={styles.footerRow}>
                {create ? (
                  <TouchableOpacity style={[styles.footerBtn, styles.footerBtnPrimary]} onPress={() => startCreate(trimmedQuery)} accessibilityRole="button">
                    <Plus size={15} color="#FFFFFF" strokeWidth={2.5} />
                    <Text style={[styles.footerBtnText, styles.footerBtnTextPrimary]}>New {noun}</Text>
                  </TouchableOpacity>
                ) : null}
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
            ) : null}
              </>
            )}
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
  // flexShrink: when the keyboard lifts the sheet, it shrinks (list/form scrolls) instead of running off the top.
  sheet: {
    flexShrink: 1,
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
  list: { flexGrow: 0, flexShrink: 1 },
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
  footerRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  footerBtn: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    height: 44,
    borderRadius: 11,
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerBtnPrimary: { backgroundColor: '#FF5C39', borderColor: '#FF5C39' },
  footerBtnTextPrimary: { color: '#FFFFFF' },
  backBtn: { marginRight: 10 },
  createRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 12,
    marginBottom: 4,
    borderRadius: 10,
    borderWidth: 1.2,
    borderStyle: 'dashed',
    borderColor: '#FDBA74',
    backgroundColor: '#FFF7ED',
  },
  createIcon: { width: 28, height: 28, borderRadius: 8, backgroundColor: '#FFEDD5', alignItems: 'center', justifyContent: 'center' },
  createRowText: { flex: 1, fontSize: 14.5, fontWeight: '700', color: '#C2410C' },
  createScroll: { flexGrow: 0, flexShrink: 1 },
  createForm: { paddingTop: 4, paddingBottom: 4 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: '#0F172A', marginBottom: 6, marginTop: 8 },
  required: { color: '#DC2626' },
  field: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    borderRadius: 11,
    paddingHorizontal: 12,
    height: 46,
    fontSize: 14.5,
    color: '#0F172A',
  },
  fieldMultiline: { height: 84, paddingTop: 10, textAlignVertical: 'top' },
  fieldError: { borderColor: '#DC2626' },
  createError: { fontSize: 12.5, fontWeight: '600', color: '#DC2626', marginTop: 8 },
  footerBtnText: { fontSize: 13.5, fontWeight: '700', color: '#334155' },
});

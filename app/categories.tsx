import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Modal,
  Switch,
  ScrollView,
  RefreshControl,
  KeyboardAvoidingView,
  ActivityIndicator,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { resolveMediaImageSource } from '../services/image.helper';
import { ScreenHeader } from '../components/ScreenHeader';
import { ConfirmModal } from '../components/ConfirmModal';
import { Colors } from '../constants/colors';
import { categoryService } from '../services/category.service';
import { useToast } from '../context/ToastContext';
import { Category } from '../types';
import { Plus, Search, Pencil, Trash2, Layers, X, ImagePlus, SearchX, ImageOff, EyeOff } from 'lucide-react-native';
import {
  ErrorView,
  Field,
  LoadingState,
  PrimaryButton,
  Segmented,
  ToggleRow,
  formStyles,
  useFormLayout,
} from '../components/settings/FormKit';
import { KEYBOARD_BEHAVIOR } from '../utils/keyboard';

/**
 * Global menu categories (super admin).
 * Backend: GET/POST /api/admin/categories, PUT/DELETE /api/admin/categories/:id.
 * POST/PUT are multipart: categoryName, description, isActive ('true'|'false'), categoryType,
 * and an optional image file in the `categoryImage` field (the backend stores it on Cloudflare R2).
 * Images from the old Cloudinary account no longer load; those tiles are flagged "Re-upload image".
 * Deleting a category also removes it from every menu item.
 */

type CategoryType = 'both' | 'food' | 'grocery' | 'meat_poultry';
type StatusFilter = 'all' | 'active' | 'inactive';
type TypeFilter = 'any' | CategoryType;

const TYPE_OPTIONS: { value: CategoryType; label: string }[] = [
  { value: 'both', label: 'All stores' },
  { value: 'food', label: 'Food' },
  { value: 'grocery', label: 'Grocery' },
  { value: 'meat_poultry', label: 'Meat' },
];
const TYPE_LABELS: Record<string, string> = {
  both: 'All stores',
  food: 'Food',
  grocery: 'Grocery',
  meat_poultry: 'Meat & Poultry',
};

type Draft = {
  id: string | null;
  categoryName: string;
  description: string;
  categoryType: CategoryType;
  isActive: boolean;
  existingImageUrl: string | null;
  newImageUri: string | null;
};

const EMPTY_DRAFT: Draft = {
  id: null,
  categoryName: '',
  description: '',
  categoryType: 'both',
  isActive: true,
  existingImageUrl: null,
  newImageUri: null,
};

/** Appends a picked image to FormData in the format each platform expects. */
async function appendImage(form: FormData, uri: string) {
  const ext = (uri.split('?')[0].split('.').pop() || 'jpg').toLowerCase();
  const mime = `image/${ext === 'jpg' ? 'jpeg' : ext.length > 4 ? 'jpeg' : ext}`;
  if (Platform.OS === 'web') {
    const blob = await (await fetch(uri)).blob();
    form.append('categoryImage', blob, `category.${ext.length > 4 ? 'jpg' : ext}`);
  } else {
    form.append('categoryImage', {
      uri: Platform.OS === 'android' ? uri : uri.replace('file://', ''),
      name: `category.${ext}`,
      type: mime,
    } as any);
  }
}

export default function CategoriesScreen() {
  const { showToast } = useToast();
  const { gutter, isTablet } = useFormLayout();
  const insets = useSafeAreaInsets();

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('any');
  const [needsImageOnly, setNeedsImageOnly] = useState(false);
  /** Categories whose image failed to load (e.g. deleted Cloudinary files) */
  const [brokenImages, setBrokenImages] = useState<Set<string>>(() => new Set());
  const { width } = useWindowDimensions();

  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [nameError, setNameError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [toDelete, setToDelete] = useState<Category | null>(null);
  const [deleting, setDeleting] = useState(false);

  /* ── Data ─────────────────────────────────────────────────────────────── */

  const fetchCategories = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'initial') setLoading(true);
    setLoadError(null);
    try {
      const res = await categoryService.getCategories();
      if (res.success && res.data) setCategories(res.data);
      else setLoadError(res.message || 'Categories could not be loaded.');
    } catch (e: any) {
      setLoadError(e?.message || 'Could not reach the server.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const counts = useMemo(
    () => ({
      all: categories.length,
      active: categories.filter((c) => c.isActive).length,
      inactive: categories.filter((c) => !c.isActive).length,
    }),
    [categories]
  );

  const needsImage = useCallback(
    (c: Category) => !resolveMediaImageSource(c.imageUrl) || brokenImages.has(c._id),
    [brokenImages]
  );
  const typeCounts = useMemo(() => {
    const out: Record<string, number> = { any: categories.length, both: 0, food: 0, grocery: 0, meat_poultry: 0 };
    categories.forEach((c) => {
      const k = c.categoryType || 'both';
      out[k] = (out[k] || 0) + 1;
    });
    return out;
  }, [categories]);
  const needsImageCount = useMemo(() => categories.filter(needsImage).length, [categories, needsImage]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return categories.filter((c) => {
      if (status === 'active' && !c.isActive) return false;
      if (status === 'inactive' && c.isActive) return false;
      if (typeFilter !== 'any' && (c.categoryType || 'both') !== typeFilter) return false;
      if (needsImageOnly && !needsImage(c)) return false;
      if (!q) return true;
      return (
        c.categoryName?.toLowerCase().includes(q) ||
        c.description?.toLowerCase().includes(q) ||
        TYPE_LABELS[c.categoryType || 'both']?.toLowerCase().includes(q)
      );
    });
  }, [categories, query, status, typeFilter, needsImageOnly, needsImage]);

  const upsertLocal = (cat: Category) =>
    setCategories((prev) => {
      const exists = prev.some((c) => c._id === cat._id);
      const next = exists ? prev.map((c) => (c._id === cat._id ? cat : c)) : [...prev, cat];
      return next.sort((a, b) => (a.categoryName || '').localeCompare(b.categoryName || ''));
    });

  /* ── Editor ───────────────────────────────────────────────────────────── */

  const openAdd = () => {
    setDraft(EMPTY_DRAFT);
    setNameError(undefined);
    setEditorOpen(true);
  };

  const openEdit = (c: Category) => {
    setDraft({
      id: c._id,
      categoryName: c.categoryName || '',
      description: c.description || '',
      categoryType: ((c.categoryType as CategoryType) || 'both'),
      isActive: c.isActive ?? true,
      existingImageUrl: c.imageUrl || null,
      newImageUri: null,
    });
    setNameError(undefined);
    setEditorOpen(true);
  };

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showToast({ title: 'Permission needed', message: 'Allow photo access to choose a category image.', type: 'error' });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.length) {
      setDraft((d) => ({ ...d, newImageUri: result.assets[0].uri }));
    }
  };

  const validateName = (): string | undefined => {
    const name = draft.categoryName.trim();
    if (!name) return 'Enter a category name.';
    if (name.length > 50) return 'Keep it under 50 characters.';
    const clash = categories.some(
      (c) => c._id !== draft.id && (c.categoryName || '').trim().toLowerCase() === name.toLowerCase()
    );
    if (clash) return 'A category with this name already exists.';
    return undefined;
  };

  const saveDraft = async () => {
    const err = validateName();
    setNameError(err);
    if (err) return;

    setSubmitting(true);
    try {
      const form = new FormData();
      form.append('categoryName', draft.categoryName.trim());
      form.append('description', draft.description.trim());
      form.append('isActive', String(draft.isActive));
      form.append('categoryType', draft.categoryType);
      if (draft.newImageUri) await appendImage(form, draft.newImageUri);

      const res = draft.id
        ? await categoryService.updateCategory(draft.id, form)
        : await categoryService.createCategory(form);

      if (res.success) {
        if (res.data) upsertLocal(res.data);
        else fetchCategories('refresh');
        if (draft.id && draft.newImageUri) {
          setBrokenImages((prev) => {
            const next = new Set(prev);
            next.delete(draft.id as string);
            return next;
          });
        }
        setEditorOpen(false);
        showToast({
          title: draft.id ? 'Category updated' : 'Category created',
          message: `“${draft.categoryName.trim()}” has been saved.`,
          type: 'success',
        });
      } else {
        // 409 = duplicate name — show it on the field.
        if (/already exists/i.test(res.message || '')) setNameError('A category with this name already exists.');
        else showToast({ title: 'Save failed', message: res.message || 'Could not save the category.', type: 'error' });
      }
    } catch (e: any) {
      showToast({ title: 'Save failed', message: e?.message || 'Could not reach the server.', type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Quick actions ────────────────────────────────────────────────────── */

  const toggleActive = async (c: Category, next: boolean) => {
    setTogglingId(c._id);
    upsertLocal({ ...c, isActive: next }); // optimistic
    try {
      const form = new FormData();
      form.append('isActive', String(next));
      const res = await categoryService.updateCategory(c._id, form);
      if (res.success) {
        if (res.data) upsertLocal(res.data);
      } else {
        upsertLocal(c);
        showToast({ title: 'Update failed', message: res.message || 'Could not change the status.', type: 'error' });
      }
    } catch (e: any) {
      upsertLocal(c);
      showToast({ title: 'Update failed', message: e?.message || 'Could not reach the server.', type: 'error' });
    } finally {
      setTogglingId(null);
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    const target = toDelete;
    setDeleting(true);
    try {
      const res = await categoryService.deleteCategory(target._id);
      if (res.success) {
        setCategories((prev) => prev.filter((c) => c._id !== target._id));
        showToast({ title: 'Category deleted', message: `“${target.categoryName}” was removed from all menus.`, type: 'success' });
      } else {
        showToast({ title: 'Delete failed', message: res.message || 'Could not delete the category.', type: 'error' });
      }
    } catch (e: any) {
      showToast({ title: 'Delete failed', message: e?.message || 'Could not reach the server.', type: 'error' });
    } finally {
      setDeleting(false);
      setToDelete(null);
    }
  };

  /* ── Rendering ────────────────────────────────────────────────────────── */

  const columns = width >= 1024 ? 4 : isTablet ? 3 : 2;

  const renderItem = ({ item }: { item: Category }) => {
    const img = resolveMediaImageSource(item.imageUrl);
    const broken = brokenImages.has(item._id);
    const showImage = Boolean(img) && !broken;
    const typeLabel = TYPE_LABELS[item.categoryType || 'both'] || 'All stores';
    return (
      <View style={[styles.cell, { width: `${100 / columns}%` }]}>
        <View style={[styles.tile, !item.isActive && styles.tileInactive]}>
          <TouchableOpacity
            onPress={() => openEdit(item)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={`Edit ${item.categoryName}`}
          >
            <View style={styles.tileMedia}>
              {showImage ? (
                <Image
                  source={img!}
                  style={[styles.tileImage, !item.isActive && { opacity: 0.55 }]}
                  contentFit="cover"
                  transition={150}
                  cachePolicy="memory-disk"
                  onError={() => setBrokenImages((prev) => new Set(prev).add(item._id))}
                />
              ) : (
                <View style={[styles.tileImage, styles.tileFallback]}>
                  <Text style={styles.tileInitial}>{(item.categoryName || '?').trim().charAt(0).toUpperCase()}</Text>
                </View>
              )}

              {!item.isActive && (
                <View style={[styles.badge, styles.badgeLeft, styles.badgeHidden]}>
                  <EyeOff size={11} color="#FFFFFF" />
                  <Text style={styles.badgeHiddenText}>Hidden</Text>
                </View>
              )}
              {(broken || !img) && (
                <View style={[styles.badge, styles.badgeBottom, styles.badgeWarn]}>
                  <ImageOff size={11} color={Colors.statusPending.text} />
                  <Text style={styles.badgeWarnText}>{broken ? 'Re-upload image' : 'No image'}</Text>
                </View>
              )}
            </View>

            <View style={styles.tileBody}>
              <Text style={styles.tileTitle} numberOfLines={1}>
                {item.categoryName}
              </Text>
              <Text style={styles.tileMeta} numberOfLines={1}>
                {typeLabel}
              </Text>
            </View>
          </TouchableOpacity>

          <View style={styles.tileFooter}>
            {togglingId === item._id ? (
              <ActivityIndicator color={Colors.primary} style={{ width: 44 }} />
            ) : (
              <Switch
                value={!!item.isActive}
                onValueChange={(v) => toggleActive(item, v)}
                trackColor={{ false: Colors.cardBorder, true: Colors.success }}
                thumbColor="#FFFFFF"
                ios_backgroundColor={Colors.cardBorder}
                style={Platform.OS === 'ios' ? { transform: [{ scale: 0.8 }] } : undefined}
                accessibilityLabel={`${item.categoryName} active`}
              />
            )}
            <View style={{ flex: 1 }} />
            <TouchableOpacity style={styles.iconBtn} onPress={() => openEdit(item)} accessibilityLabel={`Edit ${item.categoryName}`}>
              <Pencil size={16} color={Colors.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn} onPress={() => setToDelete(item)} accessibilityLabel={`Delete ${item.categoryName}`}>
              <Trash2 size={16} color={Colors.danger} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  const emptyState = () => {
    const searching = query.trim().length > 0 || status !== 'all' || typeFilter !== 'any' || needsImageOnly;
    return (
      <View style={styles.empty}>
        <View style={styles.emptyIcon}>{searching ? <SearchX size={28} color={Colors.textSubtle} /> : <Layers size={28} color={Colors.primary} />}</View>
        <Text style={styles.emptyTitle}>{searching ? 'No matching categories' : 'No categories yet'}</Text>
        <Text style={styles.emptyText}>
          {searching ? 'Try a different search or filter.' : 'Create categories so stores can organise their menus.'}
        </Text>
        {searching ? (
          <PrimaryButton label="Clear filters" tone="secondary" onPress={() => { setQuery(''); setStatus('all'); setTypeFilter('any'); setNeedsImageOnly(false); }} style={{ marginTop: 16 }} />
        ) : (
          <PrimaryButton label="Add category" icon={Plus} onPress={openAdd} style={{ marginTop: 16 }} />
        )}
      </View>
    );
  };

  const previewSource = draft.newImageUri ? { uri: draft.newImageUri } : resolveMediaImageSource(draft.existingImageUrl);

  return (
    <View style={formStyles.screen}>
      <ScreenHeader
        title="Menu categories"
        subtitle={loading ? undefined : `${counts.all} categories · ${counts.active} active`}
        rightElement={
          <TouchableOpacity style={styles.addBtn} onPress={openAdd} accessibilityRole="button" accessibilityLabel="Add category">
            <Plus size={16} color="#FFFFFF" strokeWidth={2.6} />
            <Text style={styles.addBtnText}>Add</Text>
          </TouchableOpacity>
        }
      />

      {/* Search + status filter */}
      <View style={styles.toolbar}>
        <View style={[styles.frame, { paddingHorizontal: gutter }]}>
          <View style={styles.search}>
            <Search size={18} color={Colors.textSubtle} />
            <TextInput
              style={[styles.searchInput, Platform.OS === 'web' && ({ outlineStyle: 'none' } as any)]}
              placeholder="Search categories"
              placeholderTextColor={Colors.textSubtle}
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
              accessibilityLabel="Search categories"
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery('')} style={styles.clearBtn} accessibilityLabel="Clear search">
                <X size={14} color="#FFFFFF" strokeWidth={3} />
              </TouchableOpacity>
            )}
          </View>
          <View style={{ marginTop: 10 }}>
            <Segmented<StatusFilter>
              value={status}
              onChange={setStatus}
              options={[
                { value: 'all', label: `All (${counts.all})` },
                { value: 'active', label: `Active (${counts.active})` },
                { value: 'inactive', label: `Inactive (${counts.inactive})` },
              ]}
            />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
            {([{ value: 'any', label: 'All types' }, ...TYPE_OPTIONS] as { value: TypeFilter; label: string }[]).map((opt) => {
              const selected = typeFilter === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.chip, selected && styles.chipOn]}
                  onPress={() => setTypeFilter(opt.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextOn]}>
                    {opt.label} <Text style={[styles.chipCount, selected && styles.chipTextOn]}>{typeCounts[opt.value] ?? 0}</Text>
                  </Text>
                </TouchableOpacity>
              );
            })}
            {needsImageCount > 0 && (
              <TouchableOpacity
                style={[styles.chip, styles.chipWarn, needsImageOnly && styles.chipWarnOn]}
                onPress={() => setNeedsImageOnly((v) => !v)}
                accessibilityRole="switch"
                accessibilityState={{ checked: needsImageOnly }}
              >
                <ImageOff size={13} color={needsImageOnly ? '#FFFFFF' : Colors.statusPending.text} />
                <Text style={[styles.chipText, { color: needsImageOnly ? '#FFFFFF' : Colors.statusPending.text }]}>
                  Needs image {needsImageCount}
                </Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      </View>

      {loading ? (
        <LoadingState label="Loading categories…" />
      ) : loadError && categories.length === 0 ? (
        <ErrorView message={loadError} onRetry={() => fetchCategories()} />
      ) : (
        <FlatList
          key={`cats-${columns}`}
          data={visible}
          numColumns={columns}
          keyExtractor={(c) => c._id}
          renderItem={renderItem}
          extraData={[togglingId, brokenImages]}
          ListEmptyComponent={emptyState}
          contentContainerStyle={[
            styles.frame,
            styles.list,
            { paddingHorizontal: gutter - 6 },
            !visible.length && { flexGrow: 1 },
          ]}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                fetchCategories('refresh');
              }}
              tintColor={Colors.primary}
              colors={[Colors.primary]}
            />
          }
        />
      )}

      {/* Add / edit sheet */}
      <Modal visible={editorOpen} transparent animationType={isTablet ? 'fade' : 'slide'} statusBarTranslucent onRequestClose={() => !submitting && setEditorOpen(false)}>
        <KeyboardAvoidingView style={[styles.overlay, isTablet && styles.overlayTablet]} behavior={KEYBOARD_BEHAVIOR}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => !submitting && setEditorOpen(false)} accessibilityLabel="Close" />
          <View style={[styles.sheet, isTablet && styles.sheetTablet, { paddingBottom: isTablet ? 16 : Math.max(insets.bottom, 16) }]}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>{draft.id ? 'Edit category' : 'New category'}</Text>
              <TouchableOpacity style={styles.closeBtn} onPress={() => setEditorOpen(false)} disabled={submitting} accessibilityLabel="Close">
                <X size={16} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {/* Image */}
              <View style={styles.imageRow}>
                <TouchableOpacity style={styles.imagePicker} onPress={pickImage} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Choose image">
                  {previewSource ? (
                    <Image source={previewSource} style={styles.imagePreview} contentFit="cover" />
                  ) : (
                    <ImagePlus size={26} color={Colors.primary} />
                  )}
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                  <Text style={styles.imageTitle}>Category image</Text>
                  <Text style={styles.imageHint}>Square photo works best. JPG or PNG.</Text>
                  <TouchableOpacity onPress={pickImage} style={{ marginTop: 6 }}>
                    <Text style={styles.link}>{previewSource ? 'Change image' : 'Choose image'}</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <Field
                label="Name"
                required
                placeholder="e.g. Starters, Fresh produce"
                value={draft.categoryName}
                onChangeText={(v) => {
                  setDraft((d) => ({ ...d, categoryName: v }));
                  if (nameError) setNameError(undefined);
                }}
                maxLength={50}
                autoCapitalize="words"
                error={nameError}
              />

              <Text style={styles.label}>Available to</Text>
              <Segmented<CategoryType> value={draft.categoryType} onChange={(v) => setDraft((d) => ({ ...d, categoryType: v }))} options={TYPE_OPTIONS} />

              <Field
                label="Description"
                placeholder="Optional — shown to store owners when picking a category"
                value={draft.description}
                onChangeText={(v) => setDraft((d) => ({ ...d, description: v }))}
                multiline
                maxLength={200}
                hint={`${draft.description.length}/200`}
              />

              <ToggleRow
                title="Active"
                description={draft.isActive ? 'Stores can use this category.' : 'Hidden from stores until turned on.'}
                value={draft.isActive}
                onChange={(v) => setDraft((d) => ({ ...d, isActive: v }))}
                last
              />
            </ScrollView>

            <View style={styles.sheetFooter}>
              <PrimaryButton label="Cancel" tone="secondary" onPress={() => setEditorOpen(false)} disabled={submitting} style={{ flex: 1 }} />
              <PrimaryButton label={draft.id ? 'Save changes' : 'Create category'} onPress={saveDraft} loading={submitting} style={{ flex: 1 }} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <ConfirmModal
        visible={!!toDelete}
        title="Delete this category?"
        message={`“${toDelete?.categoryName || ''}” will be deleted and removed from every menu item that uses it. This can’t be undone.`}
        confirmText={deleting ? 'Deleting…' : 'Delete'}
        cancelText="Cancel"
        isDestructive
        onConfirm={confirmDelete}
        onClose={() => !deleting && setToDelete(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: '100%', maxWidth: 1000, alignSelf: 'center' },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: Colors.primary,
  },
  addBtnText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },

  toolbar: { backgroundColor: Colors.background, borderBottomWidth: 1, borderBottomColor: Colors.cardBorder, paddingTop: 12 },
  search: {
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
  clearBtn: { width: 20, height: 20, borderRadius: 10, backgroundColor: Colors.textSubtle, alignItems: 'center', justifyContent: 'center' },

  list: { paddingTop: 14, paddingBottom: 40 },
  cell: { paddingHorizontal: 6, marginBottom: 12 },
  tile: {
    backgroundColor: Colors.background,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    overflow: 'hidden',
  },
  tileInactive: { backgroundColor: Colors.cardSurface },
  tileMedia: { position: 'relative' },
  tileImage: { width: '100%', aspectRatio: 1, backgroundColor: Colors.cardSurface },
  tileFallback: { backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  tileInitial: { fontSize: 34, fontWeight: '700', color: Colors.primary },
  badge: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 22,
    paddingHorizontal: 7,
    borderRadius: 6,
  },
  badgeLeft: { top: 8, left: 8 },
  badgeBottom: { bottom: 8, left: 8, right: 8, justifyContent: 'center' },
  badgeHidden: { backgroundColor: 'rgba(17, 24, 28, 0.72)' },
  badgeHiddenText: { fontSize: 11, fontWeight: '600', color: '#FFFFFF' },
  badgeWarn: { backgroundColor: Colors.statusPending.bg, borderWidth: 1, borderColor: Colors.statusPending.border },
  badgeWarnText: { fontSize: 11, fontWeight: '600', color: Colors.statusPending.text },
  tileBody: { paddingHorizontal: 12, paddingTop: 10 },
  tileTitle: { fontSize: 15, fontWeight: '700', color: Colors.text },
  tileMeta: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  tileFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 8,
    paddingRight: 4,
    paddingVertical: 4,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.cardBorder,
  },
  iconBtn: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },

  chips: { gap: 8, paddingTop: 10, paddingBottom: 12 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.background,
  },
  chipOn: { backgroundColor: Colors.text, borderColor: Colors.text },
  chipText: { fontSize: 13, fontWeight: '600', color: Colors.text },
  chipCount: { fontSize: 13, fontWeight: '500', color: Colors.textMuted },
  chipTextOn: { color: '#FFFFFF' },
  chipWarn: { backgroundColor: Colors.statusPending.bg, borderColor: Colors.statusPending.border },
  chipWarnOn: { backgroundColor: Colors.statusPending.text, borderColor: Colors.statusPending.text },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 48, paddingHorizontal: 24 },
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
  emptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.text },
  emptyText: { fontSize: 14, color: Colors.textMuted, marginTop: 6, textAlign: 'center', maxWidth: 340 },

  overlay: { flex: 1, backgroundColor: 'rgba(17, 24, 28, 0.45)', justifyContent: 'flex-end' },
  overlayTablet: { justifyContent: 'center', alignItems: 'center', padding: 24 },
  sheet: { backgroundColor: Colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%' },
  sheetTablet: { width: '100%', maxWidth: 520, borderRadius: 20, maxHeight: '88%' },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 6,
  },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: Colors.text },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.cardSurface, alignItems: 'center', justifyContent: 'center' },
  sheetBody: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 8 },
  sheetFooter: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.cardBorder },

  imageRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
  imagePicker: {
    width: 76,
    height: 76,
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  imagePreview: { width: '100%', height: '100%' },
  imageTitle: { fontSize: 14, fontWeight: '700', color: Colors.text },
  imageHint: { fontSize: 12, color: Colors.textSubtle, marginTop: 2 },
  link: { fontSize: 13, fontWeight: '700', color: Colors.primary },
  label: { fontSize: 13, fontWeight: '700', color: Colors.text, marginBottom: 8 },
});

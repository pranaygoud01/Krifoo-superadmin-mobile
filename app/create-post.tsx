/**
 * New marketing post (restaurant owner) — full-screen page, opened from Marketing.
 * An announcement, or an offer with a promo code (discount, which dishes it applies to,
 * validity period). A live preview shows what customers will see.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import {
  Megaphone,
  Tag,
  Send,
  Check,
  X,
  Layers,
  UtensilsCrossed,
  Sparkles,
  Percent,
  CalendarDays,
  Eye,
  FileText,
} from 'lucide-react-native';
import { Colors } from '../constants/colors';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { ScreenHeader } from '../components/ScreenHeader';
import {
  Field,
  FieldRow,
  FormFrame,
  FormSection,
  Segmented,
  PrimaryButton,
  formStyles,
  sanitizeDecimal,
  useFormLayout,
  useUnsavedChangesGuard,
} from '../components/settings/FormKit';
import { FilterChips, SearchBar, formatGBP, listStyles } from '../components/ui/ListKit';
import { DateField } from '../components/ui/DateField';
import { menuService } from '../services/menu.service';
import { restaurantOwnerService } from '../services/restaurant-owner.service';
import { KEYBOARD_BEHAVIOR } from '../utils/keyboard';

type PostType = 'text' | 'offer';
type ApplyTo = 'ALL' | 'CATEGORY' | 'ITEMS';

interface MenuDish {
  _id: string;
  itemName: string;
  basePrice?: number;
  displayImageUrl?: string;
  categoryIds: string[];
  categoryNames: string[];
}

type PostForm = {
  type: PostType;
  title: string;
  content: string;
  promoCode: string;
  discountType: 'percentage' | 'flat';
  discountValue: string;
  minOrderValue: string;
  startDate: Date;
  endDate: Date;
  applyTo: ApplyTo;
  categoryIds: string[];
  itemIds: string[];
};

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
const endOfDayIso = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59).toISOString();
const daysFromNow = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
};
const fmtDate = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

const makeEmptyForm = (): PostForm => ({
  type: 'offer',
  title: '',
  content: '',
  promoCode: '',
  discountType: 'percentage',
  discountValue: '',
  minOrderValue: '',
  startDate: new Date(),
  endDate: daysFromNow(30),
  applyTo: 'ALL',
  categoryIds: [],
  itemIds: [],
});

const POST_TYPES: { value: PostType; title: string; sub: string; icon: typeof Tag }[] = [
  { value: 'offer', title: 'Offer', sub: 'Promo code customers use at checkout', icon: Tag },
  { value: 'text', title: 'Announcement', sub: 'News, new dishes, opening hours', icon: Megaphone },
];

const APPLY_OPTIONS: { value: ApplyTo; label: string; sub: string; icon: typeof Sparkles }[] = [
  { value: 'ALL', label: 'All menu items', sub: 'Whole restaurant', icon: Sparkles },
  { value: 'CATEGORY', label: 'By category', sub: '1 or more categories', icon: Layers },
  { value: 'ITEMS', label: 'Individual dishes', sub: 'Specific items', icon: UtensilsCrossed },
];

const discountText = (type: 'percentage' | 'flat', value: number) =>
  type === 'percentage' ? `${value || 0}% off` : `${formatGBP(value)} off`;

/** Menu items from the API → dishes with category ids + names (categories may be populated or ids). */
function toDishes(items: any[], categoryNameById: Map<string, string>): MenuDish[] {
  return (items || [])
    .filter((it) => it && it._id)
    .map((it) => {
      const cats: any[] = Array.isArray(it.categories) ? it.categories : [];
      const categoryIds = cats.map((c) => (typeof c === 'object' ? String(c?._id || '') : String(c || ''))).filter(Boolean);
      const categoryNames = cats
        .map((c) => (typeof c === 'object' ? c?.categoryName || c?.name : categoryNameById.get(String(c))))
        .filter(Boolean) as string[];
      return {
        _id: String(it._id),
        itemName: it.itemName || it.name || 'Dish',
        basePrice: Number(it.basePrice ?? it.price ?? 0),
        displayImageUrl: it.displayImageUrl || it.imageUrls?.[0] || it.image,
        categoryIds,
        categoryNames,
      };
    })
    .sort((a, b) => a.itemName.localeCompare(b.itemName));
}

export default function CreatePostScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const { user } = useAuth();
  const { gutter } = useFormLayout();
  const { width } = useWindowDimensions();
  const isWide = width >= 1024; // form + sticky preview side by side

  const restaurantId =
    (typeof user?.restaurantId === 'object' ? (user?.restaurantId as any)?._id : user?.restaurantId) || user?._id || '';

  const [form, setForm] = useState<PostForm>(makeEmptyForm);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [saving, setSaving] = useState(false);
  const [published, setPublished] = useState(false);

  // Menu for "apply promo code to"
  const [dishes, setDishes] = useState<MenuDish[]>([]);
  const [menuLoading, setMenuLoading] = useState(false);
  const [menuLoaded, setMenuLoaded] = useState(false);
  const [dishQuery, setDishQuery] = useState('');
  const [dishCategory, setDishCategory] = useState<string>('all');

  const isOffer = form.type === 'offer';
  const dirty = !published && (!!form.title.trim() || !!form.content.trim() || !!form.promoCode || !!form.discountValue);
  useUnsavedChangesGuard(dirty);

  // Leave after publishing — in an effect, so the guard has already seen dirty = false.
  useEffect(() => {
    if (published) router.back();
  }, [published, router]);

  const set = <K extends keyof PostForm>(key: K, value: PostForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined, ...(key === 'categoryIds' || key === 'itemIds' || key === 'applyTo' ? { applyTo: undefined } : {}) }));
  };

  const loadMenu = useCallback(async () => {
    if (!restaurantId) return;
    setMenuLoading(true);
    try {
      const [menuRes, catRes] = await Promise.all([
        menuService.getRestaurantMenu(String(restaurantId)),
        menuService.getAllCategories().catch(() => ({ success: false, data: [] as any[] })),
      ]);
      const nameById = new Map<string, string>(
        ((catRes as any)?.data || []).map((c: any) => [String(c._id), c.categoryName || c.name || 'Category'])
      );
      if (menuRes.success) {
        setDishes(toDishes(menuRes.data || [], nameById));
        setMenuLoaded(true);
      }
    } catch {
      // the selector shows a retry link
    } finally {
      setMenuLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    if (isOffer && form.applyTo !== 'ALL' && !menuLoaded && !menuLoading) loadMenu();
  }, [isOffer, form.applyTo, menuLoaded, menuLoading, loadMenu]);

  const menuCategories = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number }>();
    dishes.forEach((d) =>
      d.categoryIds.forEach((id, i) => {
        const cur = map.get(id) || { id, name: d.categoryNames[i] || 'Category', count: 0 };
        cur.count += 1;
        map.set(id, cur);
      })
    );
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [dishes]);

  const filteredDishes = useMemo(() => {
    const q = dishQuery.trim().toLowerCase();
    return dishes.filter((d) => (dishCategory === 'all' || d.categoryIds.includes(dishCategory)) && (!q || d.itemName.toLowerCase().includes(q)));
  }, [dishes, dishQuery, dishCategory]);

  const selectedDishes = dishes.filter((d) => form.itemIds.includes(d._id));
  const selectedCategoryNames = menuCategories.filter((c) => form.categoryIds.includes(c.id)).map((c) => c.name);

  const toggleId = (key: 'categoryIds' | 'itemIds', id: string) =>
    set(key, form[key].includes(id) ? form[key].filter((x) => x !== id) : [...form[key], id]);

  const startsLater = isOffer && startOfDay(form.startDate) > startOfDay(new Date());
  const value = Number(form.discountValue);

  /* ── Publish ─────────────────────────────────────────────────────────── */

  const publish = async () => {
    const e: Record<string, string> = {};
    if (!form.title.trim()) e.title = 'Give it a short headline.';
    if (!form.content.trim()) e.content = 'Tell customers what it’s about.';
    let details: Record<string, any> | undefined;

    if (isOffer) {
      const code = form.promoCode.trim().toUpperCase();
      if (!/^[A-Z0-9]{3,15}$/.test(code)) e.promoCode = '3–15 letters or numbers, no spaces.';
      if (form.discountType === 'percentage' && !(value >= 1 && value <= 100)) e.discountValue = 'Between 1% and 100%.';
      if (form.discountType === 'flat' && !(value > 0)) e.discountValue = 'Enter an amount above £0.';
      const min = Number(form.minOrderValue || 0);
      if (isNaN(min) || min < 0) e.minOrderValue = 'Enter £0 or more.';
      else if (form.discountType === 'flat' && min > 0 && value >= min) e.minOrderValue = 'Must be more than the discount.';

      const today = startOfDay(new Date());
      if (startOfDay(form.endDate) < today) e.endDate = 'The end date can’t be in the past.';
      else if (startOfDay(form.endDate) < startOfDay(form.startDate)) e.endDate = 'Must be on or after the start date.';

      if (form.applyTo === 'CATEGORY' && form.categoryIds.length === 0) e.applyTo = 'Select at least one category.';
      if (form.applyTo === 'ITEMS' && form.itemIds.length === 0) e.applyTo = 'Select at least one dish.';

      const from = startOfDay(form.startDate);
      details = {
        promoCode: code,
        discountType: form.discountType.toUpperCase(),
        discountValue: Math.round(value * 100) / 100,
        minOrderValue: Math.round(min * 100) / 100,
        validFrom: from > today ? from.toISOString() : null,
        validUntil: endOfDayIso(form.endDate),
        applicableTo: form.applyTo,
        applicableCategories: form.applyTo === 'CATEGORY' ? form.categoryIds : [],
        applicableItems: form.applyTo === 'ITEMS' ? form.itemIds : [],
      };
    }

    setErrors(e);
    if (Object.keys(e).length) {
      showToast({ title: 'Check highlighted fields', message: `${Object.keys(e).length} thing${Object.keys(e).length === 1 ? '' : 's'} to fix before publishing.`, type: 'error' });
      return;
    }

    setSaving(true);
    try {
      const data = new FormData();
      data.append('title', form.title.trim());
      data.append('content', form.content.trim());
      data.append('announcementType', form.type);
      if (details) data.append('offerDetails', JSON.stringify(details));
      const res = await restaurantOwnerService.createAnnouncement(data);
      if (!res.success) throw new Error(res.message || 'Couldn’t publish.');
      setPublished(true);
      showToast({
        title: isOffer ? (startsLater ? 'Offer scheduled' : 'Offer is live') : 'Announcement is live',
        message: startsLater ? `Customers can use it from ${fmtDate(form.startDate)}.` : 'Customers can see it in the Krifoo app.',
        type: 'success',
      });
    } catch (err: any) {
      const msg = err?.message || 'Please try again.';
      if (/promo code/i.test(msg)) setErrors((x) => ({ ...x, promoCode: msg }));
      showToast({ title: 'Couldn’t publish', message: msg, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  /* ── Sections ────────────────────────────────────────────────────────── */

  const typeSection = (
    <View style={styles.typeRow}>
      {POST_TYPES.map((t) => {
        const active = form.type === t.value;
        const Icon = t.icon;
        return (
          <TouchableOpacity
            key={t.value}
            style={[styles.typeCard, active && styles.typeCardActive]}
            onPress={() => set('type', t.value)}
            activeOpacity={0.85}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
          >
            <View style={[styles.typeIcon, active && styles.typeIconActive]}>
              <Icon size={20} color={active ? '#FFFFFF' : Colors.primary} />
            </View>
            <View style={listStyles.flex}>
              <Text style={[styles.typeTitle, active && styles.typeTitleActive]}>{t.title}</Text>
              <Text style={styles.typeSub}>{t.sub}</Text>
            </View>
            <View style={[styles.radio, active && styles.radioOn]}>{active ? <View style={styles.radioDot} /> : null}</View>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const detailsSection = (
    <FormSection icon={FileText} title="Message" description="What customers read in the Krifoo app.">
      <Field
        label="Headline"
        required
        value={form.title}
        onChangeText={(v) => set('title', v)}
        placeholder={isOffer ? 'e.g. 20% off this weekend' : 'e.g. New summer menu is here'}
        maxLength={60}
        hint={`${form.title.length}/60`}
        error={errors.title}
      />
      <Field
        label="Message"
        required
        value={form.content}
        onChangeText={(v) => set('content', v)}
        placeholder="A sentence or two for your customers"
        multiline
        maxLength={300}
        hint={`${form.content.length}/300`}
        error={errors.content}
      />
    </FormSection>
  );

  const discountSection = (
    <FormSection icon={Percent} title="Discount" description="The code and what it takes off.">
      <Field
        label="Promo code"
        required
        value={form.promoCode}
        onChangeText={(v) => set('promoCode', v.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
        placeholder="e.g. WEEKEND20"
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={15}
        hint="3–15 letters or numbers. Customers type this at checkout."
        error={errors.promoCode}
      />
      <Text style={styles.label}>Discount type</Text>
      <Segmented
        options={[
          { value: 'percentage', label: 'Percentage (%)' },
          { value: 'flat', label: 'Amount (£)' },
        ]}
        value={form.discountType}
        onChange={(v) => set('discountType', v)}
      />
      <FieldRow>
        <Field
          label={form.discountType === 'percentage' ? 'Percentage off' : 'Amount off'}
          required
          value={form.discountValue}
          onChangeText={(v) => set('discountValue', sanitizeDecimal(v))}
          keyboardType="decimal-pad"
          prefix={form.discountType === 'flat' ? '£' : undefined}
          suffix={form.discountType === 'percentage' ? '%' : undefined}
          placeholder={form.discountType === 'percentage' ? '20' : '5.00'}
          error={errors.discountValue}
        />
        <Field
          label="Minimum order"
          value={form.minOrderValue}
          onChangeText={(v) => set('minOrderValue', sanitizeDecimal(v))}
          keyboardType="decimal-pad"
          prefix="£"
          placeholder="0.00"
          hint="Leave empty for none"
          error={errors.minOrderValue}
        />
      </FieldRow>
    </FormSection>
  );

  const appliesSection = (
    <FormSection icon={UtensilsCrossed} title="Apply promo code to" description="Your whole menu, specific categories or individual dishes.">
      <View style={styles.applyGrid}>
        {APPLY_OPTIONS.map((opt) => {
          const active = form.applyTo === opt.value;
          const Icon = opt.icon;
          return (
            <TouchableOpacity
              key={opt.value}
              style={[styles.applyCard, active && styles.applyCardActive]}
              onPress={() => set('applyTo', opt.value)}
              activeOpacity={0.85}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
            >
              <View style={styles.applyHead}>
                <Icon size={18} color={active ? Colors.primary : Colors.textMuted} />
                {active ? <Check size={16} color={Colors.primary} strokeWidth={3} /> : null}
              </View>
              <Text style={[styles.applyTitle, active && styles.applyTitleActive]}>{opt.label}</Text>
              <Text style={styles.applySub}>{opt.sub}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {form.applyTo !== 'ALL' && (
        <View style={[styles.pickerBox, errors.applyTo && styles.pickerBoxError]}>
          {menuLoading && !menuLoaded ? (
            <Text style={listStyles.meta}>Loading your menu…</Text>
          ) : !menuLoaded ? (
            <TouchableOpacity onPress={loadMenu}>
              <Text style={styles.linkText}>Couldn’t load your menu. Tap to retry.</Text>
            </TouchableOpacity>
          ) : form.applyTo === 'CATEGORY' ? (
            <>
              <View style={styles.pickerHeader}>
                <Text style={styles.pickerTitle}>Categories</Text>
                <Text style={listStyles.meta}>{form.categoryIds.length} of {menuCategories.length} selected</Text>
              </View>
              <View style={styles.chipWrap}>
                {menuCategories.map((c) => {
                  const on = form.categoryIds.includes(c.id);
                  return (
                    <TouchableOpacity
                      key={c.id}
                      style={[styles.catChip, on && styles.catChipOn]}
                      onPress={() => toggleId('categoryIds', c.id)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                    >
                      {on ? <Check size={14} color="#FFFFFF" strokeWidth={3} /> : null}
                      <Text style={[styles.catChipText, on && styles.catChipTextOn]}>{c.name}</Text>
                      <Text style={[styles.catChipCount, on && styles.catChipTextOn]}>{c.count}</Text>
                    </TouchableOpacity>
                  );
                })}
                {menuCategories.length === 0 ? <Text style={listStyles.meta}>Your dishes don’t have categories yet.</Text> : null}
              </View>
            </>
          ) : (
            <>
              <View style={styles.pickerHeader}>
                <View style={listStyles.flex}>
                  <Text style={styles.pickerTitle}>Dishes</Text>
                  <Text style={listStyles.meta}>{form.itemIds.length} of {dishes.length} selected</Text>
                </View>
                <TouchableOpacity
                  onPress={() => set('itemIds', Array.from(new Set([...form.itemIds, ...filteredDishes.map((d) => d._id)])))}
                  disabled={filteredDishes.length === 0}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.linkText}>Select shown ({filteredDishes.length})</Text>
                </TouchableOpacity>
                {form.itemIds.length > 0 ? (
                  <TouchableOpacity onPress={() => set('itemIds', [])} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={styles.linkMuted}>Clear</Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              {selectedDishes.length > 0 ? (
                <View style={styles.selectedBox}>
                  {selectedDishes.map((d) => (
                    <TouchableOpacity key={d._id} style={styles.selectedChip} onPress={() => toggleId('itemIds', d._id)} accessibilityLabel={`Remove ${d.itemName}`}>
                      <Text style={styles.selectedChipText} numberOfLines={1}>{d.itemName}</Text>
                      <X size={13} color={Colors.textMuted} />
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}

              <SearchBar value={dishQuery} onChangeText={setDishQuery} placeholder="Search dishes by name" />
              {menuCategories.length > 0 ? (
                <FilterChips<string>
                  options={[{ value: 'all', label: 'All categories' }, ...menuCategories.map((c) => ({ value: c.id, label: c.name }))]}
                  value={dishCategory}
                  onChange={setDishCategory}
                />
              ) : null}

              <View style={[styles.dishGrid, isWide && styles.dishGridWide]}>
                {filteredDishes.slice(0, 80).map((d) => {
                  const on = form.itemIds.includes(d._id);
                  return (
                    <TouchableOpacity
                      key={d._id}
                      style={[styles.dishRow, isWide && styles.dishRowWide, on && styles.dishRowOn]}
                      onPress={() => toggleId('itemIds', d._id)}
                      activeOpacity={0.85}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                    >
                      {d.displayImageUrl ? (
                        <Image source={{ uri: d.displayImageUrl }} style={styles.dishImg} contentFit="cover" transition={120} />
                      ) : (
                        <View style={[styles.dishImg, styles.dishImgEmpty]}>
                          <UtensilsCrossed size={16} color={Colors.textSubtle} />
                        </View>
                      )}
                      <View style={listStyles.flex}>
                        <Text style={styles.dishName} numberOfLines={1}>{d.itemName}</Text>
                        <Text style={styles.dishMeta} numberOfLines={1}>
                          {formatGBP(d.basePrice)}
                          {d.categoryNames[0] ? `  ·  ${d.categoryNames[0]}` : ''}
                        </Text>
                      </View>
                      <View style={[styles.checkbox, on && styles.checkboxOn]}>{on ? <Check size={14} color="#FFFFFF" strokeWidth={3} /> : null}</View>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {filteredDishes.length > 80 ? <Text style={listStyles.meta}>Showing 80 of {filteredDishes.length} — search to narrow down.</Text> : null}
              {filteredDishes.length === 0 ? <Text style={listStyles.meta}>No dishes match.</Text> : null}
            </>
          )}
        </View>
      )}
      {errors.applyTo ? <Text style={styles.errorText}>{errors.applyTo}</Text> : null}
    </FormSection>
  );

  const validitySection = (
    <FormSection icon={CalendarDays} title="Validity period" description="The code works for whole days, from the start date until the end date.">
      <FieldRow>
        <DateField
          label="Starts"
          value={form.startDate}
          minimumDate={new Date()}
          onChange={(d) => {
            set('startDate', d);
            if (startOfDay(form.endDate) < startOfDay(d)) set('endDate', d);
          }}
          hint={startsLater ? 'Scheduled — not usable before this date' : 'Live as soon as you publish'}
        />
        <DateField
          label="Ends"
          value={form.endDate}
          minimumDate={form.startDate > new Date() ? form.startDate : new Date()}
          onChange={(d) => set('endDate', d)}
          error={errors.endDate}
          hint="Last day the code can be used"
        />
      </FieldRow>
    </FormSection>
  );

  /* ── Live preview ────────────────────────────────────────────────────── */

  const appliesSummary =
    form.applyTo === 'CATEGORY'
      ? selectedCategoryNames.length
        ? `On ${selectedCategoryNames.slice(0, 2).join(', ')}${selectedCategoryNames.length > 2 ? ` + ${selectedCategoryNames.length - 2} more` : ''}`
        : 'On selected categories'
      : form.applyTo === 'ITEMS'
      ? selectedDishes.length
        ? `On ${selectedDishes.slice(0, 2).map((d) => d.itemName).join(', ')}${selectedDishes.length > 2 ? ` + ${selectedDishes.length - 2} more` : ''}`
        : 'On selected dishes'
      : 'On your whole menu';

  const preview = (
    <View style={styles.previewWrap}>
      <View style={styles.previewLabelRow}>
        <Eye size={15} color={Colors.textMuted} />
        <Text style={styles.previewLabel}>What customers see</Text>
      </View>
      <View style={styles.previewCard}>
        <View style={styles.previewHead}>
          <View style={[styles.previewIcon, isOffer && styles.previewIconOffer]}>
            {isOffer ? <Tag size={16} color="#7C3AED" /> : <Megaphone size={16} color={Colors.primary} />}
          </View>
          <Text style={styles.previewKind}>{isOffer ? 'Offer' : 'Announcement'}</Text>
        </View>
        <Text style={[styles.previewTitle, !form.title && styles.placeholder]}>{form.title || 'Your headline'}</Text>
        <Text style={[styles.previewBody, !form.content && styles.placeholder]}>{form.content || 'Your message to customers appears here.'}</Text>
        {isOffer ? (
          <View style={styles.coupon}>
            <View style={styles.couponCode}>
              <Text style={styles.couponCodeText}>{form.promoCode || 'CODE'}</Text>
            </View>
            <View style={listStyles.flex}>
              <Text style={styles.couponValue}>{value > 0 ? discountText(form.discountType, value) : 'Discount'}</Text>
              <Text style={styles.couponMeta} numberOfLines={1}>{appliesSummary}</Text>
              <Text style={styles.couponMeta}>
                {Number(form.minOrderValue) > 0 ? `Orders over ${formatGBP(form.minOrderValue)} · ` : ''}
                {startsLater ? `${fmtDate(form.startDate)} – ` : 'Until '}
                {fmtDate(form.endDate)}
              </Text>
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );

  const formColumn = (
    <>
      {typeSection}
      {detailsSection}
      {isOffer ? (
        <>
          {discountSection}
          {appliesSection}
          {validitySection}
        </>
      ) : null}
      {!isWide ? preview : null}
    </>
  );

  return (
    <KeyboardAvoidingView style={formStyles.screen} behavior={KEYBOARD_BEHAVIOR}>
      <ScreenHeader title="New post" subtitle="Share news or an offer with your customers" />

      <ScrollView
        contentContainerStyle={[formStyles.scroll, { paddingHorizontal: gutter, paddingBottom: 120 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {isWide ? (
          <View style={styles.wideRow}>
            <View style={styles.wideForm}>{formColumn}</View>
            <View style={styles.wideSide}>{preview}</View>
          </View>
        ) : (
          <FormFrame>{formColumn}</FormFrame>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={[styles.footerInner, isWide && styles.footerInnerWide]}>
          <PrimaryButton label="Cancel" tone="secondary" onPress={() => router.back()} disabled={saving} style={styles.cancelBtn} />
          <PrimaryButton
            label={isOffer ? (startsLater ? 'Schedule offer' : 'Publish offer') : 'Publish announcement'}
            icon={Send}
            loading={saving}
            onPress={publish}
            style={styles.flex}
          />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  label: { fontSize: 13, fontWeight: '700', color: Colors.text, marginBottom: 7 },

  // Post type
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  typeCard: {
    flex: 1,
    minWidth: 240,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.background,
  },
  typeCardActive: { borderColor: Colors.primary, borderWidth: 2, padding: 13, backgroundColor: '#FFF7ED' },
  typeIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primaryLight },
  typeIconActive: { backgroundColor: Colors.primary },
  typeTitle: { fontSize: 15.5, fontWeight: '800', color: Colors.text },
  typeTitleActive: { color: Colors.primary },
  typeSub: { fontSize: 12.5, color: Colors.textMuted, marginTop: 2 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: Colors.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.primary },

  // Apply to
  applyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  applyCard: {
    flex: 1,
    minWidth: 150,
    gap: 4,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.background,
  },
  applyCardActive: { borderColor: Colors.primary, borderWidth: 2, backgroundColor: '#FFF7ED', padding: 11 },
  applyHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  applyTitle: { fontSize: 14, fontWeight: '700', color: Colors.text },
  applyTitleActive: { color: Colors.primary },
  applySub: { fontSize: 12, color: Colors.textMuted },

  pickerBox: { borderWidth: 1, borderColor: Colors.cardBorder, borderRadius: 12, padding: 12, gap: 10, backgroundColor: Colors.backgroundSecondary },
  pickerBoxError: { borderColor: '#DC2626' },
  pickerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14 },
  pickerTitle: { fontSize: 14.5, fontWeight: '800', color: Colors.text },
  linkText: { fontSize: 13, fontWeight: '700', color: Colors.primary },
  linkMuted: { fontSize: 13, fontWeight: '700', color: Colors.textMuted },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catChip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 38, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: Colors.cardBorder, backgroundColor: '#FFFFFF' },
  catChipOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  catChipText: { fontSize: 13.5, fontWeight: '600', color: Colors.text },
  catChipCount: { fontSize: 12, fontWeight: '700', color: Colors.textMuted },
  catChipTextOn: { color: '#FFFFFF' },
  selectedBox: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, padding: 8, borderRadius: 10, backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#FED7AA' },
  selectedChip: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '100%', paddingHorizontal: 10, minHeight: 30, borderRadius: 999, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#FED7AA' },
  selectedChipText: { fontSize: 13, fontWeight: '600', color: Colors.text, flexShrink: 1 },
  dishGrid: { gap: 8 },
  dishGridWide: { flexDirection: 'row', flexWrap: 'wrap' },
  dishRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, borderRadius: 12, borderWidth: 1, borderColor: Colors.cardBorder, backgroundColor: '#FFFFFF' },
  dishRowWide: { flexBasis: '48%', flexGrow: 1 },
  dishRowOn: { borderColor: Colors.primary, backgroundColor: '#FFF7ED' },
  dishImg: { width: 48, height: 48, borderRadius: 8, backgroundColor: Colors.cardSurface },
  dishImgEmpty: { alignItems: 'center', justifyContent: 'center' },
  dishName: { fontSize: 14.5, fontWeight: '700', color: Colors.text },
  dishMeta: { fontSize: 12.5, color: Colors.textMuted, marginTop: 2 },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  checkboxOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  errorText: { fontSize: 12, fontWeight: '600', color: '#DC2626', marginTop: 8 },

  // Preview
  previewWrap: { marginBottom: 16 },
  previewLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  previewLabel: { fontSize: 12, fontWeight: '800', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  previewCard: { backgroundColor: Colors.background, borderRadius: 14, borderWidth: 1, borderColor: Colors.cardBorder, padding: 16 },
  previewHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  previewIcon: { width: 30, height: 30, borderRadius: 9, backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  previewIconOffer: { backgroundColor: '#F3E8FF' },
  previewKind: { fontSize: 12.5, fontWeight: '700', color: Colors.textMuted },
  previewTitle: { fontSize: 17, fontWeight: '800', color: Colors.text },
  previewBody: { fontSize: 14, color: Colors.text, lineHeight: 20, marginTop: 6 },
  placeholder: { color: Colors.textSubtle },
  coupon: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14, padding: 12, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: '#C4B5FD', backgroundColor: '#FAF5FF' },
  couponCode: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#7C3AED' },
  couponCodeText: { fontSize: 14, fontWeight: '900', color: '#FFFFFF', letterSpacing: 1 },
  couponValue: { fontSize: 15, fontWeight: '800', color: '#5B21B6' },
  couponMeta: { fontSize: 12, color: '#6D28D9', marginTop: 1 },

  // Wide layout
  wideRow: { flexDirection: 'row', gap: 20, alignItems: 'flex-start', width: '100%', maxWidth: 1180, alignSelf: 'center' },
  wideForm: { flex: 1, minWidth: 0 },
  wideSide: { width: 360 },

  // Footer
  footer: { backgroundColor: Colors.background, borderTopWidth: 1, borderTopColor: Colors.cardBorder, paddingTop: 12, paddingHorizontal: 16 },
  footerInner: { flexDirection: 'row', gap: 10, width: '100%', maxWidth: 820, alignSelf: 'center' },
  footerInnerWide: { maxWidth: 1180 },
  cancelBtn: { minWidth: 110 },
});

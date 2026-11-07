import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { ScreenHeader } from '../components/ScreenHeader';
import { Colors } from '../constants/colors';
import { restaurantOwnerService } from '../services/restaurant-owner.service';
import { useToast } from '../context/ToastContext';
import { Store, User, MapPin, Mail, Lock, TriangleAlert, Check } from 'lucide-react-native';
import {
  EmailListEditor,
  ErrorView,
  Field,
  FieldRow,
  FormFrame,
  FormSection,
  LoadingState,
  Notice,
  SAVE_BAR_SPACE,
  SaveBar,
  formStyles,
  isEqualJSON,
  useFormLayout,
  useUnsavedChangesGuard,
} from '../components/settings/FormKit';

/**
 * Store profile (restaurant owner).
 * Backend: GET /api/restaurants/me, PUT /api/restaurants/profile.
 * The profile endpoint accepts: restaurantName, ownerFullName, primaryContactName, phoneNumber,
 * restaurantType, orderNotificationEmails, address.{shopNo, floor, area, city, landmark}.
 * Login email is read-only. Store online/offline is NOT sent from here (it's controlled on the
 * Settings screen) so saving the profile can never flip the store's live status.
 */

type BusinessType = 'food_delivery_and_dining' | 'food_delivery' | 'groceries' | 'meat_poultry';

const BUSINESS_TYPES: { value: BusinessType; label: string; desc: string }[] = [
  { value: 'food_delivery_and_dining', label: 'Food & Dining', desc: 'Delivery, pickup and dine-in' },
  { value: 'food_delivery', label: 'Delivery only', desc: 'Takeaway kitchen' },
  { value: 'groceries', label: 'Groceries', desc: 'Convenience & grocery' },
  { value: 'meat_poultry', label: 'Meat & Poultry', desc: 'Butcher & halal' },
];

type ProfileForm = {
  restaurantName: string;
  restaurantType: BusinessType;
  ownerFullName: string;
  primaryContactName: string;
  phoneNumber: string;
  orderNotificationEmails: string[];
  shopNo: string;
  floor: string;
  landmark: string;
  area: string;
  city: string;
};

type FormKey = keyof ProfileForm;

const EMPTY_FORM: ProfileForm = {
  restaurantName: '',
  restaurantType: 'food_delivery_and_dining',
  ownerFullName: '',
  primaryContactName: '',
  phoneNumber: '',
  orderNotificationEmails: [],
  shopNo: '',
  floor: '',
  landmark: '',
  area: '',
  city: '',
};

const toForm = (r: any): ProfileForm => ({
  restaurantName: r?.restaurantName || '',
  restaurantType: (r?.restaurantType as BusinessType) || 'food_delivery_and_dining',
  ownerFullName: r?.ownerFullName || '',
  primaryContactName: r?.primaryContactName || '',
  phoneNumber: r?.phoneNumber || '',
  orderNotificationEmails: Array.isArray(r?.orderNotificationEmails) ? r.orderNotificationEmails : [],
  shopNo: r?.address?.shopNo || '',
  floor: r?.address?.floor || '',
  landmark: r?.address?.landmark || '',
  area: r?.address?.area || '',
  city: r?.address?.city || '',
});

const PHONE_RE = /^\+?[\d\s()-]{7,20}$/;
const NAME_RE = /^[A-Za-zÀ-ÖØ-öø-ÿ' .-]+$/;

function validate(f: ProfileForm): Partial<Record<FormKey, string>> {
  const e: Partial<Record<FormKey, string>> = {};
  const name = f.restaurantName.trim();
  if (!name) e.restaurantName = 'Enter your business name.';
  else if (name.length < 2) e.restaurantName = 'Business name is too short.';
  else if (name.length > 80) e.restaurantName = 'Keep it under 80 characters.';

  const owner = f.ownerFullName.trim();
  if (!owner) e.ownerFullName = 'Enter the owner’s name.';
  else if (!NAME_RE.test(owner)) e.ownerFullName = 'Use letters, spaces, hyphens or apostrophes only.';

  if (f.primaryContactName.trim() && !NAME_RE.test(f.primaryContactName.trim())) {
    e.primaryContactName = 'Use letters, spaces, hyphens or apostrophes only.';
  }

  const phone = f.phoneNumber.trim();
  const digits = phone.replace(/\D/g, '');
  if (!phone) e.phoneNumber = 'Enter a phone number customers can reach.';
  else if (!PHONE_RE.test(phone) || digits.length < 7 || digits.length > 15) e.phoneNumber = 'Enter a valid phone number.';

  if (!f.city.trim()) e.city = 'Enter your city.';
  return e;
}

export default function StoreProfileScreen() {
  const { showToast } = useToast();
  const { gutter, isTablet, isCompact } = useFormLayout();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [email, setEmail] = useState('');
  const [form, setForm] = useState<ProfileForm>(EMPTY_FORM);
  const [saved, setSaved] = useState<ProfileForm>(EMPTY_FORM);
  const [showErrors, setShowErrors] = useState(false);

  const dirty = !isEqualJSON(form, saved);
  useUnsavedChangesGuard(dirty);

  const errors = useMemo(() => validate(form), [form]);
  const visibleErrors = showErrors ? errors : {};
  const errorCount = showErrors ? Object.keys(errors).length : 0;

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await restaurantOwnerService.getRestaurantProfile();
      if (res.success && res.data) {
        const f = toForm(res.data);
        setEmail(res.data.email || '');
        setForm(f);
        setSaved(f);
      } else {
        setLoadError(res.message || 'Your store profile could not be loaded.');
      }
    } catch (e: any) {
      setLoadError(e?.message || 'Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const set = <K extends FormKey>(key: K, value: ProfileForm[K]) => setForm((prev) => ({ ...prev, [key]: value }));

  const bind = (key: Exclude<FormKey, 'restaurantType' | 'orderNotificationEmails'>) => ({
    value: form[key],
    onChangeText: (v: string) => set(key, v),
    error: visibleErrors[key],
  });

  const save = async () => {
    if (Object.keys(errors).length) {
      setShowErrors(true);
      showToast({ title: 'Check highlighted fields', message: 'Some details need fixing before saving.', type: 'error' });
      return;
    }
    setSaving(true);
    try {
      const res = await restaurantOwnerService.updateRestaurantProfile({
        restaurantName: form.restaurantName.trim(),
        ownerFullName: form.ownerFullName.trim(),
        primaryContactName: form.primaryContactName.trim(),
        phoneNumber: form.phoneNumber.trim(),
        restaurantType: form.restaurantType,
        orderNotificationEmails: form.orderNotificationEmails,
        address: {
          shopNo: form.shopNo.trim(),
          floor: form.floor.trim(),
          landmark: form.landmark.trim(),
          area: form.area.trim().toUpperCase(),
          city: form.city.trim(),
        },
      });
      if (res.success) {
        // Reflect exactly what the server stored.
        const stored = res.data ? toForm(res.data) : form;
        setForm(stored);
        setSaved(stored);
        setShowErrors(false);
        showToast({ title: 'Profile saved', message: 'Your store details have been updated.', type: 'success' });
      } else {
        showToast({ title: 'Save failed', message: res.message || 'Could not save your profile.', type: 'error' });
      }
    } catch (e: any) {
      showToast({ title: 'Save failed', message: e?.message || 'Could not reach the server.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const losingDining =
    saved.restaurantType === 'food_delivery_and_dining' && form.restaurantType !== 'food_delivery_and_dining';

  return (
    <KeyboardAvoidingView style={formStyles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader title="Store profile" subtitle="Business details, contact and address" />

      {loading ? (
        <LoadingState label="Loading your store profile…" />
      ) : loadError ? (
        <ErrorView message={loadError} onRetry={loadProfile} />
      ) : (
        <ScrollView
          contentContainerStyle={[formStyles.scroll, { paddingHorizontal: gutter, paddingBottom: SAVE_BAR_SPACE }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <FormFrame>
            {/* Business */}
            <FormSection icon={Store} title="Business" description="How your store appears to customers.">
              <Field
                label="Business name"
                required
                placeholder="e.g. Krifoo Grill"
                autoCapitalize="words"
                maxLength={80}
                {...bind('restaurantName')}
              />
              <Text style={styles.label}>Business type</Text>
              <View style={styles.typeGrid}>
                {BUSINESS_TYPES.map((t) => {
                  const active = form.restaurantType === t.value;
                  return (
                    <TouchableOpacity
                      key={t.value}
                      style={[styles.typeCard, { flexBasis: isTablet ? '23%' : '47%' }, active && styles.typeCardActive]}
                      onPress={() => set('restaurantType', t.value)}
                      activeOpacity={0.8}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: active }}
                    >
                      <View style={styles.typeHead}>
                        <Text style={[styles.typeLabel, active && styles.typeLabelActive]} numberOfLines={1}>
                          {t.label}
                        </Text>
                        {active && <Check size={16} color={Colors.primary} strokeWidth={3} />}
                      </View>
                      <Text style={styles.typeDesc} numberOfLines={1}>
                        {t.desc}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {losingDining && (
                <Notice tone="warning" icon={TriangleAlert} title="Dine-in will be turned off">
                  Only “Food & Dining” stores can take table bookings and dine-in orders. Saving this change disables them.
                </Notice>
              )}
            </FormSection>

            {/* Contact */}
            <FormSection icon={User} title="Contact" description="Who customers and Krifoo should contact.">
              <FieldRow stack={!isTablet}>
                <Field label="Owner name" required autoCapitalize="words" autoComplete="name" {...bind('ownerFullName')} />
                <Field label="Primary contact" placeholder="Optional" autoCapitalize="words" {...bind('primaryContactName')} />
              </FieldRow>
              <FieldRow stack={!isTablet}>
                <Field
                  label="Phone number"
                  required
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  placeholder="07123 456789"
                  {...bind('phoneNumber')}
                />
                <Field
                  label="Login email"
                  value={email}
                  editable={false}
                  hint="Used to sign in. Contact Krifoo support to change it."
                  leading={<Lock size={15} color={Colors.textSubtle} />}
                />
              </FieldRow>
            </FormSection>

            {/* Order emails */}
            <FormSection
              icon={Mail}
              title="Order notification emails"
              description="Extra addresses that get an email for every new order."
            >
              <EmailListEditor
                emails={form.orderNotificationEmails}
                onChange={(next) => set('orderNotificationEmails', next)}
                emptyText="No extra addresses — order emails go to your login email only."
              />
            </FormSection>

            {/* Address */}
            <FormSection icon={MapPin} title="Address" description="Used for delivery distances and shown to customers.">
              <FieldRow stack={isCompact}>
                <Field label="Shop / unit no." placeholder="Unit 4B" {...bind('shopNo')} />
                <Field label="Floor" placeholder="Ground floor" {...bind('floor')} />
              </FieldRow>
              <Field label="Street / landmark" placeholder="12 High Street, near the station" {...bind('landmark')} />
              <FieldRow stack={isCompact}>
                <Field
                  label="Postcode"
                  placeholder="EC1A 1BB"
                  autoCapitalize="characters"
                  autoComplete="postal-code"
                  {...bind('area')}
                />
                <Field label="City" required placeholder="London" autoCapitalize="words" {...bind('city')} />
              </FieldRow>
            </FormSection>
          </FormFrame>
        </ScrollView>
      )}

      <SaveBar
        visible={dirty && !loading}
        saving={saving}
        errorCount={errorCount}
        onSave={save}
        onDiscard={() => {
          setForm(saved);
          setShowErrors(false);
        }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '700', color: Colors.text, marginBottom: 8 },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  typeCard: {
    flexGrow: 1,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.cardSurface,
  },
  typeCardActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  typeHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  typeLabel: { flexShrink: 1, fontSize: 14, fontWeight: '800', color: Colors.text },
  typeLabelActive: { color: Colors.primaryDark },
  typeDesc: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
});

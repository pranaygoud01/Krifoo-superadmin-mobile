import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, KeyboardAvoidingView, Linking } from 'react-native';
import { ScreenHeader } from '../components/ScreenHeader';
import { Colors } from '../constants/colors';
import { restaurantOwnerService } from '../services/restaurant-owner.service';
import { useToast } from '../context/ToastContext';
import { LogoPicker } from '../components/settings/LogoPicker';
import { Store, User, MapPin, Mail, Lock, TriangleAlert, Check, Search, ExternalLink } from 'lucide-react-native';
import { AddressFinderSheet } from '../components/settings/AddressFinderSheet';
import type { AddressMatch } from '../services/location.service';
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
import { KEYBOARD_BEHAVIOR } from '../utils/keyboard';

/**
 * Store profile (restaurant owner).
 * Backend: GET /api/restaurants/me, PUT /api/restaurants/profile, PUT/DELETE /api/restaurants/logo.
 * The profile endpoint accepts: restaurantName, ownerFullName, primaryContactName, phoneNumber,
 * restaurantType, orderNotificationEmails, address.{shopNo, floor, area, city, landmark, coordinates}.
 * The map location (address.coordinates, GeoJSON [lng, lat]) is set by searching a real address —
 * delivery distances and fees are calculated from it.
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
  /** Map location used for delivery distances (null = not set) */
  lat: number | null;
  lng: number | null;
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
  lat: null,
  lng: null,
};

/** Reads GeoJSON [lng, lat]; [0, 0] (an unset placeholder) counts as not set. */
const coordsFrom = (r: any): { lat: number | null; lng: number | null } => {
  const c = r?.address?.coordinates?.coordinates;
  const lng = Number(c?.[0]);
  const lat = Number(c?.[1]);
  return Array.isArray(c) && Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0) ? { lat, lng } : { lat: null, lng: null };
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
  ...coordsFrom(r),
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

  // Logo saves on its own (not part of the form / Save bar).
  const [logoUrl, setLogoUrl] = useState('');

  // Address finder: picks a real address and its map location
  const [finderOpen, setFinderOpen] = useState(false);
  /** Street/postcode/city at the moment the map location was set; edits after that make the pin stale */
  const [pinnedText, setPinnedText] = useState<string | null>(null);
  const addressText = `${form.landmark}|${form.area}|${form.city}`.toLowerCase().trim();
  const hasPin = form.lat !== null && form.lng !== null;
  const pinStale = hasPin && pinnedText !== null && pinnedText !== addressText;

  const applyMatch = (m: AddressMatch) => {
    const postcode = (m.postalCode || '').toUpperCase();
    setForm(prev => {
      const next = {
        ...prev,
        landmark: m.line1 || prev.landmark,
        area: postcode || prev.area,
        city: m.city || prev.city,
        lat: m.lat,
        lng: m.lon,
      };
      setPinnedText(`${next.landmark}|${next.area}|${next.city}`.toLowerCase().trim());
      return next;
    });
    showToast({ title: 'Address found', message: 'Check the unit and floor, then save.', type: 'success' });
  };

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
        setLogoUrl(res.data.logoUrl || '');
        setForm(f);
        setSaved(f);
        setPinnedText(`${f.landmark}|${f.area}|${f.city}`.toLowerCase().trim());
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

  const bind = (key: Exclude<FormKey, 'restaurantType' | 'orderNotificationEmails' | 'lat' | 'lng'>) => ({
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
          ...(form.lat !== null && form.lng !== null
            ? { coordinates: { type: 'Point', coordinates: [form.lng, form.lat] } }
            : {}),
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
    <KeyboardAvoidingView style={formStyles.screen} behavior={KEYBOARD_BEHAVIOR}>
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
              <LogoPicker logoUrl={logoUrl} restaurantName={form.restaurantName} onChange={setLogoUrl} />
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
              <TouchableOpacity
                style={styles.findBtn}
                onPress={() => setFinderOpen(true)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Find your address"
              >
                <View style={styles.findIcon}>
                  <Search size={18} color={Colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.findTitle}>{hasPin ? 'Search again' : 'Find your address'}</Text>
                  <Text style={styles.findSub}>Search a postcode or street to fill this in and pin the map location</Text>
                </View>
              </TouchableOpacity>

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

              {/* Map location status */}
              {hasPin && !pinStale ? (
                <View style={[styles.pinStatus, styles.pinOk]}>
                  <Check size={16} color={Colors.statusApproved.text} />
                  <Text style={[styles.pinText, { color: Colors.statusApproved.text }]}>
                    Map location set ({form.lat!.toFixed(5)}, {form.lng!.toFixed(5)})
                  </Text>
                  <TouchableOpacity
                    onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${form.lat},${form.lng}`).catch(() => {})}
                    style={styles.pinLink}
                    accessibilityLabel="View on map"
                  >
                    <Text style={styles.pinLinkText}>View on map</Text>
                    <ExternalLink size={13} color={Colors.primary} />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={[styles.pinStatus, styles.pinWarn]} onPress={() => setFinderOpen(true)} activeOpacity={0.8}>
                  <TriangleAlert size={16} color={Colors.statusPending.text} />
                  <Text style={[styles.pinText, { color: Colors.statusPending.text }]}>
                    {pinStale
                      ? 'Address changed — search again to update the map location.'
                      : 'Map location not set — delivery distances can’t be calculated. Tap to find your address.'}
                  </Text>
                </TouchableOpacity>
              )}
            </FormSection>
          </FormFrame>
        </ScrollView>
      )}

      <AddressFinderSheet
        visible={finderOpen}
        onClose={() => setFinderOpen(false)}
        onPick={applyMatch}
        initialQuery={form.area || form.landmark}
      />

      <SaveBar
        visible={dirty && !loading}
        saving={saving}
        errorCount={errorCount}
        onSave={save}
        onDiscard={() => {
          setForm(saved);
          setPinnedText(`${saved.landmark}|${saved.area}|${saved.city}`.toLowerCase().trim());
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
  findBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    marginBottom: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  findIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' },
  findTitle: { fontSize: 15, fontWeight: '700', color: Colors.primaryDark },
  findSub: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  pinStatus: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, padding: 12, borderRadius: 12, borderWidth: 1, marginTop: 4 },
  pinOk: { backgroundColor: Colors.statusApproved.bg, borderColor: Colors.statusApproved.border },
  pinWarn: { backgroundColor: Colors.statusPending.bg, borderColor: Colors.statusPending.border },
  pinText: { flex: 1, minWidth: 160, fontSize: 13, fontWeight: '600' },
  pinLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pinLinkText: { fontSize: 13, fontWeight: '700', color: Colors.primary },
});

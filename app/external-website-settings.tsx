import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { ScreenHeader } from '../components/ScreenHeader';
import { Colors } from '../constants/colors';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { restaurantService } from '../services/restaurant.service';
import { restaurantOwnerService } from '../services/restaurant-owner.service';
import { Globe, Truck, Plus, Trash2, Calculator, Info } from 'lucide-react-native';
import { RestaurantPicker } from '../components/settings/RestaurantPicker';
import { ExternalDistanceTier, Restaurant } from '../types';
import {
  ErrorView,
  Field,
  FieldRow,
  FormFrame,
  FormSection,
  LoadingState,
  Notice,
  PrimaryButton,
  SAVE_BAR_SPACE,
  SaveBar,
  Segmented,
  StepperField,
  ToggleRow,
  formStyles,
  isEqualJSON,
  numberError,
  sanitizeDecimal,
  useFormLayout,
  useUnsavedChangesGuard,
} from '../components/settings/FormKit';

/**
 * Delivery for orders placed on a restaurant's own website.
 * Owner:       GET /api/restaurants/me,              PUT /api/restaurants/settings
 * Super admin: GET /api/admin/restaurants/:id,       PUT /api/admin/restaurants/:id
 * Payload: { externalWebsiteSettings: { isPublished }, externalDeliverySettings: {...} }.
 * Only `isPublished` is sent for the website, so brand/domain/colours stored elsewhere are never overwritten.
 */

type ChargeType = 'tiered' | 'fixed' | 'per_mile';

type Form = {
  isPublished: boolean;
  enabled: boolean;
  deliveryChargeType: ChargeType;
  maxDeliveryRadius: string;
  freeDeliveryOver: string;
  fixedCharge: string;
  baseDeliveryCharge: string;
  baseDeliveryDistance: string;
  chargePerMile: string;
  distanceTiers: ExternalDistanceTier[];
};

const DEFAULT_TIERS: ExternalDistanceTier[] = [
  { maxDistance: 2, charge: 2 },
  { maxDistance: 4, charge: 3.5 },
  { maxDistance: 6, charge: 5 },
];

const money = (n: unknown, fallback: number) => (typeof n === 'number' && !isNaN(n) ? n : fallback).toFixed(2);
const num = (n: unknown, fallback: number) => String(typeof n === 'number' && !isNaN(n) ? n : fallback);

const toForm = (r: Restaurant | any): Form => {
  const ds = r?.externalDeliverySettings || {};
  return {
    isPublished: r?.externalWebsiteSettings?.isPublished === true,
    enabled: ds.enabled === true,
    deliveryChargeType: (ds.deliveryChargeType as ChargeType) || 'tiered',
    maxDeliveryRadius: num(ds.maxDeliveryRadius, 8),
    freeDeliveryOver:
      ds.freeDeliveryOverOrderValue !== null && ds.freeDeliveryOverOrderValue !== undefined
        ? money(ds.freeDeliveryOverOrderValue, 0)
        : '',
    fixedCharge: money(ds.fixedCharge, 2.5),
    baseDeliveryCharge: money(ds.baseDeliveryCharge, 2),
    baseDeliveryDistance: num(ds.baseDeliveryDistance, 2),
    chargePerMile: money(ds.chargePerMile, 1.5),
    distanceTiers:
      Array.isArray(ds.distanceTiers) && ds.distanceTiers.length
        ? [...ds.distanceTiers].sort((a: ExternalDistanceTier, b: ExternalDistanceTier) => a.maxDistance - b.maxDistance)
        : DEFAULT_TIERS,
  };
};

type Errors = Partial<Record<keyof Form, string>>;

function validate(f: Form): Errors {
  const e: Errors = {};
  if (!f.enabled) return e;
  e.maxDeliveryRadius = numberError(f.maxDeliveryRadius, 0.5, 100);
  e.freeDeliveryOver = numberError(f.freeDeliveryOver, 0, 10000, { optional: true });
  if (f.deliveryChargeType === 'fixed') e.fixedCharge = numberError(f.fixedCharge, 0, 100);
  if (f.deliveryChargeType === 'per_mile') {
    e.baseDeliveryCharge = numberError(f.baseDeliveryCharge, 0, 100);
    e.baseDeliveryDistance = numberError(f.baseDeliveryDistance, 0, 100);
    e.chargePerMile = numberError(f.chargePerMile, 0, 50);
    if (!e.baseDeliveryDistance && !e.maxDeliveryRadius && Number(f.baseDeliveryDistance) > Number(f.maxDeliveryRadius)) {
      e.baseDeliveryDistance = 'Can’t be more than the maximum distance.';
    }
  }
  if (f.deliveryChargeType === 'tiered' && f.distanceTiers.length === 0) e.distanceTiers = 'Add at least one distance band.';
  (Object.keys(e) as (keyof Form)[]).forEach((k) => e[k] === undefined && delete e[k]);
  return e;
}

/** Delivery fee for a distance, mirroring the selected charge type. */
function feeFor(f: Form, d: number): number | null {
  const max = Number(f.maxDeliveryRadius);
  if (d > max) return null;
  if (f.deliveryChargeType === 'fixed') return Number(f.fixedCharge);
  if (f.deliveryChargeType === 'per_mile') {
    const base = Number(f.baseDeliveryCharge);
    const baseDist = Number(f.baseDeliveryDistance);
    return d <= baseDist ? base : base + (d - baseDist) * Number(f.chargePerMile);
  }
  const tier = f.distanceTiers.find((t) => d <= t.maxDistance);
  return tier ? tier.charge : null;
}

export default function ExternalWebsiteSettingsScreen() {
  const params = useLocalSearchParams<{ restaurantId?: string }>();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { gutter, isTablet, isCompact } = useFormLayout();
  const isSuperAdmin = user?.userType === 'super_admin';

  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Form>(toForm(null));
  const [saved, setSaved] = useState<Form>(toForm(null));
  const [tierDraft, setTierDraft] = useState({ distance: '', charge: '' });
  const [tierError, setTierError] = useState<string | undefined>();

  const dirty = !isEqualJSON(form, saved);
  useUnsavedChangesGuard(dirty);
  const errors = useMemo(() => validate(form), [form]);
  const errorCount = Object.keys(errors).length;

  const apply = (r: Restaurant) => {
    const f = toForm(r);
    setRestaurant(r);
    setForm(f);
    setSaved(f);
  };

  /* ── Data ─────────────────────────────────────────────────────────────── */

  const loadRestaurant = useCallback(async (id: string) => {
    const res = await restaurantService.getRestaurantById(id);
    if (res.success && res.data) apply(res.data);
    else throw new Error(res.message || 'Restaurant details could not be loaded.');
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      if (isSuperAdmin) {
        const list = await restaurantService.getRestaurants({ limit: 100 });
        const items: Restaurant[] = (list as any).data || [];
        setRestaurants(items);
        const target = params.restaurantId || items[0]?._id;
        if (!target) throw new Error('There are no restaurants to configure yet.');
        await loadRestaurant(target);
      } else {
        const res = await restaurantOwnerService.getRestaurantProfile();
        if (res.success && res.data) apply(res.data);
        else throw new Error(res.message || 'Your store settings could not be loaded.');
      }
    } catch (e: any) {
      setLoadError(e?.message || 'Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }, [isSuperAdmin, params.restaurantId, loadRestaurant]);

  useEffect(() => {
    load();
  }, [load]);

  const switchRestaurant = async (r: Restaurant) => {
    if (r._id === restaurant?._id) return;
    if (dirty) {
      showToast({ title: 'Unsaved changes', message: 'Save or discard your changes before switching restaurant.', type: 'error' });
      return;
    }
    setLoading(true);
    try {
      await loadRestaurant(r._id);
    } catch (e: any) {
      showToast({ title: 'Couldn’t load restaurant', message: e?.message || 'Try again.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  /* ── Form helpers ─────────────────────────────────────────────────────── */

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((prev) => ({ ...prev, [key]: value }));
  const setStr = (key: keyof Form) => (v: string) => set(key, v as any);

  const addTier = () => {
    const d = Number(tierDraft.distance);
    const c = Number(tierDraft.charge);
    if (!tierDraft.distance || isNaN(d) || d <= 0) return setTierError('Enter a distance greater than 0.');
    if (tierDraft.charge === '' || isNaN(c) || c < 0) return setTierError('Enter a valid charge.');
    if (form.distanceTiers.some((t) => t.maxDistance === d)) return setTierError(`There’s already a band up to ${d} mi.`);
    set('distanceTiers', [...form.distanceTiers, { maxDistance: d, charge: c }].sort((a, b) => a.maxDistance - b.maxDistance));
    setTierDraft({ distance: '', charge: '' });
    setTierError(undefined);
  };

  const save = async () => {
    if (errorCount) {
      showToast({ title: 'Check highlighted fields', message: 'Some values need fixing before saving.', type: 'error' });
      return;
    }
    const payload = {
      externalWebsiteSettings: { isPublished: form.isPublished },
      externalDeliverySettings: {
        enabled: form.enabled,
        deliveryChargeType: form.deliveryChargeType,
        maxDeliveryRadius: Number(form.maxDeliveryRadius),
        freeDeliveryOverOrderValue: form.freeDeliveryOver.trim() ? Number(form.freeDeliveryOver) : null,
        fixedCharge: Number(form.fixedCharge),
        baseDeliveryCharge: Number(form.baseDeliveryCharge),
        baseDeliveryDistance: Number(form.baseDeliveryDistance),
        chargePerMile: Number(form.chargePerMile),
        distanceTiers: form.distanceTiers,
      },
    };
    setSaving(true);
    try {
      const res: any = isSuperAdmin
        ? await restaurantService.updateRestaurantDetails(restaurant!._id, payload as any)
        : await restaurantOwnerService.updateRestaurantSettings(payload);
      if (res.success) {
        if (res.data) apply(res.data);
        else setSaved(form);
        showToast({ title: 'Saved', message: 'Website delivery settings updated.', type: 'success' });
      } else {
        showToast({ title: 'Save failed', message: res.message || 'Could not save settings.', type: 'error' });
      }
    } catch (e: any) {
      showToast({ title: 'Save failed', message: e?.message || 'Could not reach the server.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  /* ── Derived ──────────────────────────────────────────────────────────── */

  const ws = restaurant?.externalWebsiteSettings;
  const siteName = ws?.brandName || restaurant?.restaurantName || 'Your website';
  const siteDomain = ws?.domain || ws?.customDomain || (ws?.subdomain ? `${ws.subdomain}.krifoo.co.uk` : '');
  const maxR = Number(form.maxDeliveryRadius);
  const lastTier = form.distanceTiers[form.distanceTiers.length - 1];

  const examples = useMemo(() => {
    if (!form.enabled || errorCount) return [];
    const pts = Array.from(new Set([1, Math.round(maxR / 2), maxR].filter((d) => d > 0))).sort((a, b) => a - b);
    return pts.map((d) => ({ d, fee: feeFor(form, d) }));
  }, [form, errorCount, maxR]);


  /* ── Render ───────────────────────────────────────────────────────────── */

  return (
    <KeyboardAvoidingView style={formStyles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader title="Website delivery" subtitle="Delivery for orders from your own website" />

      {loading ? (
        <LoadingState label="Loading website settings…" />
      ) : loadError ? (
        <ErrorView message={loadError} onRetry={load} />
      ) : (
        <ScrollView
          contentContainerStyle={[formStyles.scroll, { paddingHorizontal: gutter, paddingBottom: SAVE_BAR_SPACE }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <FormFrame>
            {isSuperAdmin && (
              <RestaurantPicker
                restaurants={restaurants}
                selectedId={restaurant?._id}
                selectedName={restaurant?.restaurantName}
                onSelect={switchRestaurant}
              />
            )}

            {/* Website status */}
            <FormSection icon={Globe} title={siteName} description={siteDomain || 'No domain connected yet'}>
              <ToggleRow
                title="Website published"
                description={form.isPublished ? 'Customers can order on your website.' : 'Your website is hidden from customers.'}
                value={form.isPublished}
                onChange={(v) => set('isPublished', v)}
                last
              />
            </FormSection>

            {/* Delivery */}
            <FormSection icon={Truck} title="Website delivery fees" description="Use your own delivery fees for website orders.">
              <ToggleRow
                title="Custom delivery fees"
                description={form.enabled ? 'The fees below apply to website orders.' : 'Your standard Krifoo delivery settings are used.'}
                value={form.enabled}
                onChange={(v) => set('enabled', v)}
                last={!form.enabled}
              />

              {form.enabled && (
                <View style={{ marginTop: 14 }}>
                  <Text style={styles.label}>How fees are calculated</Text>
                  <Segmented<ChargeType>
                    value={form.deliveryChargeType}
                    onChange={(v) => set('deliveryChargeType', v)}
                    options={[
                      { value: 'tiered', label: 'Distance bands' },
                      { value: 'fixed', label: 'Flat fee' },
                      { value: 'per_mile', label: 'Per mile' },
                    ]}
                  />

                  <FieldRow stack={!isTablet}>
                    <StepperField
                      label="Maximum distance"
                      value={form.maxDeliveryRadius}
                      onChange={setStr('maxDeliveryRadius')}
                      step={1}
                      min={0.5}
                      max={100}
                      decimals={1}
                      suffix="mi"
                      error={errors.maxDeliveryRadius}
                    />
                    <Field
                      label="Free delivery over"
                      prefix="£"
                      placeholder="Off"
                      keyboardType="decimal-pad"
                      value={form.freeDeliveryOver}
                      onChangeText={(v) => set('freeDeliveryOver', sanitizeDecimal(v))}
                      hint="Order value for free delivery. Leave blank to turn off."
                      error={errors.freeDeliveryOver}
                    />
                  </FieldRow>

                  {form.deliveryChargeType === 'fixed' && (
                    <StepperField
                      label="Flat delivery fee"
                      value={form.fixedCharge}
                      onChange={setStr('fixedCharge')}
                      step={0.5}
                      min={0}
                      max={100}
                      decimals={2}
                      prefix="£"
                      presets={[1.5, 2.5, 3.5]}
                      formatPreset={(n) => `£${n.toFixed(2)}`}
                      error={errors.fixedCharge}
                    />
                  )}

                  {form.deliveryChargeType === 'per_mile' && (
                    <FieldRow stack={!isTablet}>
                      <StepperField label="Base fee" value={form.baseDeliveryCharge} onChange={setStr('baseDeliveryCharge')} step={0.5} min={0} max={100} decimals={2} prefix="£" error={errors.baseDeliveryCharge} />
                      <StepperField label="Covers the first" value={form.baseDeliveryDistance} onChange={setStr('baseDeliveryDistance')} step={0.5} min={0} max={100} decimals={1} suffix="mi" error={errors.baseDeliveryDistance} />
                      <StepperField label="Each extra mile" value={form.chargePerMile} onChange={setStr('chargePerMile')} step={0.25} min={0} max={50} decimals={2} prefix="£" error={errors.chargePerMile} />
                    </FieldRow>
                  )}

                  {form.deliveryChargeType === 'tiered' && (
                    <View>
                      <Text style={styles.label}>Distance bands</Text>
                      {form.distanceTiers.length === 0 ? (
                        <Text style={[styles.empty, errors.distanceTiers && { color: Colors.danger }]}>
                          {errors.distanceTiers || 'No bands yet.'}
                        </Text>
                      ) : (
                        <View style={styles.tiers}>
                          {form.distanceTiers.map((t, i) => (
                            <View key={`${t.maxDistance}-${i}`} style={[styles.tier, i < form.distanceTiers.length - 1 && styles.tierDivider]}>
                              <Text style={styles.tierRange}>
                                {i === 0 ? 0 : form.distanceTiers[i - 1].maxDistance}–{t.maxDistance} mi
                              </Text>
                              <Text style={styles.tierFee}>{t.charge === 0 ? 'Free' : `£${Number(t.charge).toFixed(2)}`}</Text>
                              <TouchableOpacity
                                style={styles.iconBtn}
                                onPress={() => set('distanceTiers', form.distanceTiers.filter((_, idx) => idx !== i))}
                                accessibilityLabel={`Remove band up to ${t.maxDistance} miles`}
                              >
                                <Trash2 size={16} color={Colors.danger} />
                              </TouchableOpacity>
                            </View>
                          ))}
                        </View>
                      )}

                      <View style={styles.addTier}>
                        <FieldRow stack={isCompact}>
                          <Field
                            label="Up to"
                            suffix="mi"
                            placeholder="3"
                            keyboardType="decimal-pad"
                            value={tierDraft.distance}
                            onChangeText={(v) => {
                              setTierDraft((d) => ({ ...d, distance: sanitizeDecimal(v, 1) }));
                              setTierError(undefined);
                            }}
                          />
                          <Field
                            label="Fee"
                            prefix="£"
                            placeholder="2.50"
                            keyboardType="decimal-pad"
                            value={tierDraft.charge}
                            onChangeText={(v) => {
                              setTierDraft((d) => ({ ...d, charge: sanitizeDecimal(v) }));
                              setTierError(undefined);
                            }}
                            onSubmitEditing={addTier}
                          />
                        </FieldRow>
                        {tierError ? <Text style={styles.tierErrorText}>{tierError}</Text> : null}
                        <PrimaryButton label="Add band" icon={Plus} tone="secondary" onPress={addTier} />
                      </View>

                      {lastTier && !errors.maxDeliveryRadius && lastTier.maxDistance < maxR && (
                        <View style={{ marginTop: 12 }}>
                          <Notice tone="warning" icon={Info}>
                            {`Bands stop at ${lastTier.maxDistance} mi but you deliver up to ${maxR} mi. Orders beyond ${lastTier.maxDistance} mi can’t be priced — add a band or lower the maximum distance.`}
                          </Notice>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              )}
            </FormSection>

            {form.enabled && (
              <FormSection icon={Calculator} title="What customers pay" description="Example fees with these settings.">
                {examples.length ? (
                  <View style={styles.table}>
                    {examples.map((ex, i) => (
                      <View key={ex.d} style={[styles.tr, i < examples.length - 1 && styles.tierDivider]}>
                        <Text style={styles.td}>{ex.d} mi away</Text>
                        <Text style={[styles.tdValue, ex.fee === 0 && { color: Colors.success }]}>
                          {ex.fee === null ? 'Not covered' : ex.fee === 0 ? 'Free' : `£${ex.fee.toFixed(2)}`}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.empty}>Fix the highlighted values to see examples.</Text>
                )}
                {form.freeDeliveryOver.trim() && !errors.freeDeliveryOver ? (
                  <Text style={styles.footnote}>Orders over £{Number(form.freeDeliveryOver).toFixed(2)} get free delivery.</Text>
                ) : null}
              </FormSection>
            )}
          </FormFrame>
        </ScrollView>
      )}

      <SaveBar visible={dirty && !loading} saving={saving} errorCount={errorCount} onSave={save} onDiscard={() => setForm(saved)} />

    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '700', color: Colors.text, marginBottom: 8 },
  empty: { fontSize: 13, color: Colors.textSubtle, paddingVertical: 6 },
  footnote: { fontSize: 12, color: Colors.textSubtle, marginTop: 10 },


  tiers: { borderRadius: 12, borderWidth: 1, borderColor: Colors.cardBorder, overflow: 'hidden', marginBottom: 12 },
  tier: { flexDirection: 'row', alignItems: 'center', paddingLeft: 14, paddingRight: 4, minHeight: 48 },
  tierDivider: { borderBottomWidth: 1, borderBottomColor: Colors.cardBorder },
  tierRange: { flex: 1, fontSize: 14, fontWeight: '700', color: Colors.text },
  tierFee: { fontSize: 15, fontWeight: '800', color: Colors.primary, marginRight: 4 },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  addTier: { padding: 12, borderRadius: 12, backgroundColor: Colors.cardSurface },
  tierErrorText: { fontSize: 12, fontWeight: '600', color: Colors.danger, marginTop: -6, marginBottom: 10 },

  table: { borderRadius: 12, borderWidth: 1, borderColor: Colors.cardBorder, overflow: 'hidden' },
  tr: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12 },
  td: { fontSize: 14, color: Colors.text, fontWeight: '600' },
  tdValue: { fontSize: 15, fontWeight: '800', color: Colors.text },

});

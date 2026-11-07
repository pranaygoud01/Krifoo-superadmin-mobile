import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { ScreenHeader } from '../components/ScreenHeader';
import { Colors } from '../constants/colors';
import { restaurantOwnerService } from '../services/restaurant-owner.service';
import { useToast } from '../context/ToastContext';
import { Clock, MapPin, PoundSterling, Calculator } from 'lucide-react-native';
import {
  ErrorView,
  FieldRow,
  FormFrame,
  FormSection,
  LoadingState,
  SAVE_BAR_SPACE,
  SaveBar,
  StepperField,
  formStyles,
  isEqualJSON,
  numberError,
  useFormLayout,
  useUnsavedChangesGuard,
} from '../components/settings/FormKit';

/**
 * Standard (Krifoo platform) delivery settings for a restaurant owner.
 * Backend: GET /api/restaurants/me, PUT /api/restaurants/settings (validated).
 *   defaultDeliveryTime: integer 5–180, handlingChargesPercentage: number ≥ 0 (≤ 2 dp),
 *   deliverySettings: { freeDeliveryRadius 0–50, maxDeliveryRadius 0–100, chargePerMile 0–50 }, free ≤ max.
 * We only use the validated /settings endpoint — the old fallback to PUT /profile skipped validation.
 */

type DeliveryForm = {
  defaultDeliveryTime: string;
  freeDeliveryRadius: string;
  maxDeliveryRadius: string;
  chargePerMile: string;
  handlingChargesPercentage: string;
};

const EMPTY: DeliveryForm = {
  defaultDeliveryTime: '30',
  freeDeliveryRadius: '2',
  maxDeliveryRadius: '10',
  chargePerMile: '1.00',
  handlingChargesPercentage: '0',
};

const fmt = (n: unknown, fallback: number, decimals = 0) => {
  const v = typeof n === 'number' && !isNaN(n) ? n : fallback;
  return decimals ? v.toFixed(decimals) : String(v);
};

const toForm = (r: any): DeliveryForm => ({
  defaultDeliveryTime: fmt(r?.defaultDeliveryTime, 30),
  freeDeliveryRadius: fmt(r?.deliverySettings?.freeDeliveryRadius, 2),
  maxDeliveryRadius: fmt(r?.deliverySettings?.maxDeliveryRadius, 10),
  chargePerMile: fmt(r?.deliverySettings?.chargePerMile, 1, 2),
  handlingChargesPercentage: fmt(r?.handlingChargesPercentage, 0),
});

function validate(f: DeliveryForm): Partial<Record<keyof DeliveryForm, string>> {
  const e: Partial<Record<keyof DeliveryForm, string>> = {};
  e.defaultDeliveryTime = numberError(f.defaultDeliveryTime, 5, 180, { integer: true });
  e.freeDeliveryRadius = numberError(f.freeDeliveryRadius, 0, 50);
  e.maxDeliveryRadius = numberError(f.maxDeliveryRadius, 0.5, 100);
  e.chargePerMile = numberError(f.chargePerMile, 0, 50);
  e.handlingChargesPercentage = numberError(f.handlingChargesPercentage, 0, 100);
  if (!e.freeDeliveryRadius && !e.maxDeliveryRadius && Number(f.freeDeliveryRadius) > Number(f.maxDeliveryRadius)) {
    e.freeDeliveryRadius = 'Can’t be more than the maximum delivery radius.';
  }
  (Object.keys(e) as (keyof DeliveryForm)[]).forEach((k) => e[k] === undefined && delete e[k]);
  return e;
}

export default function DeliverySettingsScreen() {
  const { showToast } = useToast();
  const { gutter, isTablet } = useFormLayout();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<DeliveryForm>(EMPTY);
  const [saved, setSaved] = useState<DeliveryForm>(EMPTY);

  const dirty = !isEqualJSON(form, saved);
  useUnsavedChangesGuard(dirty);
  const errors = useMemo(() => validate(form), [form]);
  const errorCount = Object.keys(errors).length;

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await restaurantOwnerService.getRestaurantProfile();
      if (res.success && res.data) {
        const f = toForm(res.data);
        setForm(f);
        setSaved(f);
      } else {
        setLoadError(res.message || 'Delivery settings could not be loaded.');
      }
    } catch (e: any) {
      setLoadError(e?.message || 'Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const set = (key: keyof DeliveryForm) => (v: string) => setForm((prev) => ({ ...prev, [key]: v }));

  const save = async () => {
    if (errorCount) {
      showToast({ title: 'Check highlighted fields', message: 'Some values are out of range.', type: 'error' });
      return;
    }
    setSaving(true);
    try {
      const res = await restaurantOwnerService.updateRestaurantSettings({
        defaultDeliveryTime: parseInt(form.defaultDeliveryTime, 10),
        handlingChargesPercentage: Number(form.handlingChargesPercentage),
        deliverySettings: {
          freeDeliveryRadius: Number(form.freeDeliveryRadius),
          maxDeliveryRadius: Number(form.maxDeliveryRadius),
          chargePerMile: Number(form.chargePerMile),
        },
      });
      if (res.success) {
        // Re-read so the screen shows exactly what the server stored.
        const fresh = await restaurantOwnerService.getRestaurantProfile();
        const stored = fresh.success && fresh.data ? toForm(fresh.data) : form;
        setForm(stored);
        setSaved(stored);
        showToast({ title: 'Delivery settings saved', message: 'New orders will use these values.', type: 'success' });
      } else {
        showToast({ title: 'Save failed', message: res.message || 'Could not save delivery settings.', type: 'error' });
      }
    } catch (e: any) {
      showToast({ title: 'Save failed', message: e?.message || 'Could not reach the server.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // Live fee examples (only when the radius/rate values are valid).
  const free = Number(form.freeDeliveryRadius);
  const max = Number(form.maxDeliveryRadius);
  const rate = Number(form.chargePerMile);
  const canPreview = !errors.freeDeliveryRadius && !errors.maxDeliveryRadius && !errors.chargePerMile;
  const examples = useMemo(() => {
    if (!canPreview) return [];
    const points = Array.from(new Set([Math.min(1, max), Math.min(free + 1, max), Math.min(free + 3, max), max]))
      .filter((d) => d > 0)
      .sort((a, b) => a - b)
      .slice(0, 4);
    return points.map((d) => ({ distance: d, fee: d <= free ? 0 : (d - free) * rate }));
  }, [canPreview, free, max, rate]);

  return (
    <KeyboardAvoidingView style={formStyles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader title="Delivery settings" subtitle="Krifoo app delivery area and fees" />

      {loading ? (
        <LoadingState label="Loading delivery settings…" />
      ) : loadError ? (
        <ErrorView message={loadError} onRetry={load} />
      ) : (
        <ScrollView
          contentContainerStyle={[formStyles.scroll, { paddingHorizontal: gutter, paddingBottom: SAVE_BAR_SPACE }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <FormFrame>
            <FormSection icon={Clock} title="Delivery time" description="The estimate customers see at checkout. You can still change it per order.">
              <StepperField
                label="Default delivery time"
                value={form.defaultDeliveryTime}
                onChange={set('defaultDeliveryTime')}
                step={5}
                min={5}
                max={180}
                suffix="min"
                presets={[20, 30, 45, 60]}
                formatPreset={(n) => `${n} min`}
                hint="Between 5 and 180 minutes."
                error={errors.defaultDeliveryTime}
              />
            </FormSection>

            <FormSection icon={MapPin} title="Delivery area" description="How far you deliver, and where delivery is free.">
              <FieldRow stack={!isTablet}>
                <StepperField
                  label="Free delivery within"
                  value={form.freeDeliveryRadius}
                  onChange={set('freeDeliveryRadius')}
                  step={0.5}
                  min={0}
                  max={50}
                  decimals={1}
                  suffix="mi"
                  presets={[0, 1, 2, 3]}
                  formatPreset={(n) => (n === 0 ? 'None' : `${n} mi`)}
                  hint="0 means every delivery is charged."
                  error={errors.freeDeliveryRadius}
                />
                <StepperField
                  label="Maximum delivery distance"
                  value={form.maxDeliveryRadius}
                  onChange={set('maxDeliveryRadius')}
                  step={1}
                  min={0.5}
                  max={100}
                  decimals={1}
                  suffix="mi"
                  presets={[5, 10, 15]}
                  formatPreset={(n) => `${n} mi`}
                  hint="Orders further away can’t be placed."
                  error={errors.maxDeliveryRadius}
                />
              </FieldRow>
            </FormSection>

            <FormSection icon={PoundSterling} title="Fees" description="Charged on top of the order total.">
              <FieldRow stack={!isTablet}>
                <StepperField
                  label="Charge per mile"
                  value={form.chargePerMile}
                  onChange={set('chargePerMile')}
                  step={0.25}
                  min={0}
                  max={50}
                  decimals={2}
                  prefix="£"
                  presets={[0.5, 1, 1.5, 2]}
                  formatPreset={(n) => `£${n.toFixed(2)}`}
                  hint="For each mile beyond the free area."
                  error={errors.chargePerMile}
                />
                <StepperField
                  label="Handling fee"
                  value={form.handlingChargesPercentage}
                  onChange={set('handlingChargesPercentage')}
                  step={0.5}
                  min={0}
                  max={100}
                  decimals={1}
                  suffix="%"
                  presets={[0, 2.5, 5]}
                  formatPreset={(n) => `${n}%`}
                  hint="Percentage added to each order for packaging."
                  error={errors.handlingChargesPercentage}
                />
              </FieldRow>
            </FormSection>

            <FormSection icon={Calculator} title="What customers pay" description="Delivery fee examples with these settings.">
              {examples.length ? (
                <View style={styles.table}>
                  {examples.map((ex, i) => (
                    <View key={ex.distance} style={[styles.tr, i < examples.length - 1 && styles.trDivider]}>
                      <Text style={styles.td}>{ex.distance} mi away</Text>
                      <Text style={[styles.tdValue, ex.fee === 0 && styles.free]}>
                        {ex.fee === 0 ? 'Free' : `£${ex.fee.toFixed(2)}`}
                      </Text>
                    </View>
                  ))}
                  <Text style={styles.footnote}>Beyond {max} mi, delivery isn’t available.</Text>
                </View>
              ) : (
                <Text style={styles.footnote}>Fix the highlighted values to see examples.</Text>
              )}
            </FormSection>
          </FormFrame>
        </ScrollView>
      )}

      <SaveBar
        visible={dirty && !loading}
        saving={saving}
        errorCount={errorCount}
        onSave={save}
        onDiscard={() => setForm(saved)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  table: { borderRadius: 12, borderWidth: 1, borderColor: Colors.cardBorder, overflow: 'hidden' },
  tr: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12 },
  trDivider: { borderBottomWidth: 1, borderBottomColor: Colors.cardBorder },
  td: { fontSize: 14, color: Colors.text, fontWeight: '600' },
  tdValue: { fontSize: 15, fontWeight: '800', color: Colors.text },
  free: { color: Colors.success },
  footnote: { fontSize: 12, color: Colors.textSubtle, padding: 12, paddingTop: 10 },
});

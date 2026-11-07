import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  TextInputProps,
  Linking,
  ActivityIndicator,
  Switch,
  Alert,
  Platform,
  KeyboardAvoidingView,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { resolveMediaImageSource } from '../services/image.helper';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { Header } from '../components/Header';
import { ConfirmModal } from '../components/ConfirmModal';
import { Colors } from '../constants/colors';
import { restaurantService } from '../services/restaurant.service';
import { useToast } from '../context/ToastContext';
import { Restaurant, VerificationStatus, ExternalDistanceTier } from '../types';
import { getAddressText, getVerificationStatus, withVerificationStatus, STATUS_STYLES } from '../components/RestaurantCard';
import {
  Check,
  X,
  Clock,
  MapPin,
  Mail,
  Phone,
  User,
  Globe,
  Truck,
  Percent,
  Plus,
  Trash2,
  Pencil,
  ShieldCheck,
  ShieldX,
  Power,
  ExternalLink,
  CircleAlert,
  Info,
  CalendarDays,
  Navigation,
  RotateCcw,
  Store,
} from 'lucide-react-native';

/* ────────────────────────────────────────────────────────────────────────────
 * Form model
 * ──────────────────────────────────────────────────────────────────────────── */

type ChargeType = 'tiered' | 'fixed' | 'per_mile';

type FormState = {
  commissionRate: string;
  defaultDeliveryTime: string;
  handlingFee: string;
  extDomain: string;
  extBrandName: string;
  extPrimaryColor: string;
  extSecondaryColor: string;
  extHeroBanner: string;
  extLogoUrl: string;
  extPublished: boolean;
  extDeliveryEnabled: boolean;
  extChargeType: ChargeType;
  extFixedCharge: string;
  extFreeThreshold: string;
  extPerMile: string;
  extBaseDist: string;
  extBaseCharge: string;
  extMaxRadius: string;
  extDistanceTiers: ExternalDistanceTier[];
};

type FormKey = keyof FormState;
type Errors = Partial<Record<FormKey, string>>;

const formFromRestaurant = (r: Restaurant): FormState => {
  const ws = r.externalWebsiteSettings;
  const eds = r.externalDeliverySettings;
  return {
    commissionRate: String(r.commissionRate ?? 10),
    defaultDeliveryTime: String(r.defaultDeliveryTime ?? 30),
    handlingFee: String(r.handlingChargesPercentage ?? 0),
    extDomain: ws?.domain || '',
    extBrandName: ws?.brandName || '',
    extPrimaryColor: ws?.primaryColor || '#E11D48',
    extSecondaryColor: ws?.secondaryColor || '#4F46E5',
    extHeroBanner: ws?.heroBannerUrl || '',
    extLogoUrl: ws?.logoUrl || '',
    extPublished: ws?.isPublished ?? true,
    extDeliveryEnabled: eds?.enabled ?? false,
    extChargeType: (eds?.deliveryChargeType as ChargeType) || 'tiered',
    extFixedCharge: String(eds?.fixedCharge ?? 0),
    extFreeThreshold: eds?.freeDeliveryOverOrderValue != null ? String(eds.freeDeliveryOverOrderValue) : '',
    extPerMile: String(eds?.chargePerMile ?? 0),
    extBaseDist: String(eds?.baseDeliveryDistance ?? 0),
    extBaseCharge: String(eds?.baseDeliveryCharge ?? 0),
    extMaxRadius: String(eds?.maxDeliveryRadius ?? 10),
    extDistanceTiers: Array.isArray(eds?.distanceTiers)
      ? [...eds!.distanceTiers].sort((a, b) => a.maxDistance - b.maxDistance)
      : [],
  };
};

const DECIMAL_RE = /^\d+(\.\d{1,2})?$/;
const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const URL_RE = /^https?:\/\/[^\s]+\.[^\s]+$/i;
const DOMAIN_RE = /^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/i;

const sanitizeDecimal = (v: string) => {
  const cleaned = v.replace(/[^0-9.]/g, '');
  const [whole, ...rest] = cleaned.split('.');
  return rest.length ? `${whole}.${rest.join('').slice(0, 2)}` : whole;
};

const numberError = (v: string, min: number, max: number, opts?: { integer?: boolean; optional?: boolean }) => {
  const t = v.trim();
  if (!t) return opts?.optional ? undefined : 'Required.';
  if (opts?.integer ? !/^\d+$/.test(t) : !DECIMAL_RE.test(t)) return opts?.integer ? 'Whole number only.' : 'Enter a valid number.';
  const n = Number(t);
  if (n < min || n > max) return `Must be ${min}–${max}.`;
  return undefined;
};

function validateForm(f: FormState): Errors {
  const e: Errors = {};
  e.commissionRate = numberError(f.commissionRate, 0, 100);
  e.handlingFee = numberError(f.handlingFee, 0, 100);
  e.defaultDeliveryTime = numberError(f.defaultDeliveryTime, 1, 240, { integer: true });

  const domain = f.extDomain.trim().replace(/^https?:\/\//i, '').replace(/\/$/, '');
  if (domain && !DOMAIN_RE.test(domain)) e.extDomain = 'Enter a hostname like myrestaurant.co.uk.';
  if (f.extBrandName.trim().length > 60) e.extBrandName = 'Keep it under 60 characters.';
  if (!HEX_RE.test(f.extPrimaryColor.trim())) e.extPrimaryColor = 'Use a hex colour like #E11D48.';
  if (!HEX_RE.test(f.extSecondaryColor.trim())) e.extSecondaryColor = 'Use a hex colour like #4F46E5.';
  if (f.extHeroBanner.trim() && !URL_RE.test(f.extHeroBanner.trim())) e.extHeroBanner = 'Enter a full https:// link.';
  if (f.extLogoUrl.trim() && !URL_RE.test(f.extLogoUrl.trim())) e.extLogoUrl = 'Enter a full https:// link.';

  if (f.extDeliveryEnabled) {
    e.extMaxRadius = numberError(f.extMaxRadius, 0.1, 100);
    e.extFreeThreshold = numberError(f.extFreeThreshold, 0, 10000, { optional: true });
    if (f.extChargeType === 'fixed') e.extFixedCharge = numberError(f.extFixedCharge, 0, 100);
    if (f.extChargeType === 'per_mile') {
      e.extBaseCharge = numberError(f.extBaseCharge, 0, 100);
      e.extBaseDist = numberError(f.extBaseDist, 0, 100);
      e.extPerMile = numberError(f.extPerMile, 0, 50);
      if (!e.extBaseDist && !e.extMaxRadius && Number(f.extBaseDist) > Number(f.extMaxRadius)) {
        e.extBaseDist = 'Can’t exceed the max radius.';
      }
    }
    if (f.extChargeType === 'tiered' && f.extDistanceTiers.length === 0) {
      e.extDistanceTiers = 'Add at least one distance tier.';
    }
  }

  (Object.keys(e) as FormKey[]).forEach((k) => e[k] === undefined && delete e[k]);
  return e;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Presentational helpers
 * ──────────────────────────────────────────────────────────────────────────── */

type IconType = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

function Section({
  icon: Icon,
  title,
  subtitle,
  right,
  children,
}: {
  icon: IconType;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <View style={styles.sectionIcon}>
          <Icon size={17} color={Colors.primary} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {subtitle ? <Text style={styles.sectionSub}>{subtitle}</Text> : null}
        </View>
        {right}
      </View>
      {children}
    </View>
  );
}

type FieldProps = TextInputProps & {
  label: string;
  error?: string;
  hint?: string;
  prefix?: string;
  suffix?: string;
  leading?: React.ReactNode;
};

function Field({ label, error, hint, prefix, suffix, leading, style, ...rest }: FieldProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.field, style as any]}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputWrap, focused && styles.inputFocused, !!error && styles.inputError]}>
        {leading}
        {prefix ? <Text style={styles.affix}>{prefix}</Text> : null}
        <TextInput
          style={[styles.input, Platform.OS === 'web' && ({ outlineStyle: 'none' } as any)]}
          placeholderTextColor={Colors.textSubtle}
          accessibilityLabel={label}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          {...rest}
        />
        {suffix ? <Text style={styles.affix}>{suffix}</Text> : null}
      </View>
      {error ? (
        <View style={styles.msgRow}>
          <CircleAlert size={12} color={Colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

function Row({ children, stack }: { children: React.ReactNode; stack?: boolean }) {
  return (
    <View style={stack ? undefined : styles.row}>
      {React.Children.map(children, (c) => (c ? <View style={stack ? undefined : styles.rowItem}>{c}</View> : null))}
    </View>
  );
}

function ToggleRow({
  title,
  subtitle,
  value,
  onChange,
  busy,
}: {
  title: string;
  subtitle?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  busy?: boolean;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.flex}>
        <Text style={styles.toggleTitle}>{title}</Text>
        {subtitle ? <Text style={styles.toggleSub}>{subtitle}</Text> : null}
      </View>
      {busy ? (
        <ActivityIndicator color={Colors.primary} style={{ width: 51 }} />
      ) : (
        <Switch
          value={value}
          onValueChange={onChange}
          trackColor={{ false: Colors.cardBorder, true: Colors.success }}
          thumbColor="#FFFFFF"
          ios_backgroundColor={Colors.cardBorder}
          accessibilityLabel={title}
        />
      )}
    </View>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Screen
 * ──────────────────────────────────────────────────────────────────────────── */

const STATUS_ICON: Record<VerificationStatus, IconType> = { pending: Clock, approved: ShieldCheck, rejected: ShieldX };

export default function RestaurantDetailsScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams();
  const restaurantId = params.restaurantId as string;
  const { showToast } = useToast();

  const isWide = width >= 1024; // two-column layout
  const isTablet = width >= 768;
  const stackPairs = width < 380;
  const gutter = isTablet ? 24 : 16;

  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [form, setForm] = useState<FormState | null>(null);
  const [savedForm, setSavedForm] = useState<FormState | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  const [remarks, setRemarks] = useState('');
  const [statusToConfirm, setStatusToConfirm] = useState<VerificationStatus | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [deactivateVisible, setDeactivateVisible] = useState(false);
  const [togglingActive, setTogglingActive] = useState(false);

  const [tierDraft, setTierDraft] = useState<{ index: number | null; maxDistance: string; charge: string } | null>(null);
  const [tierError, setTierError] = useState<string | null>(null);

  const isDirty = useMemo(() => !!form && !!savedForm && JSON.stringify(form) !== JSON.stringify(savedForm), [form, savedForm]);

  /* ── Data ─────────────────────────────────────────────────────────────── */

  const fetchRestaurantDetail = useCallback(async () => {
    if (!restaurantId) {
      setLoadError('No restaurant was selected.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const res = await restaurantService.getRestaurantById(restaurantId);
      if (res.success && res.data) {
        const r = res.data;
        const f = formFromRestaurant(r);
        setRestaurant(r);
        setRemarks(r.verificationRemarks || '');
        setForm(f);
        setSavedForm(f);
        setErrors({});
      } else {
        setLoadError(res.message || 'Restaurant details could not be found.');
      }
    } catch (e: any) {
      console.error('Failed fetching restaurant details:', e);
      setLoadError(e?.message || 'Could not load restaurant details.');
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    fetchRestaurantDetail();
  }, [fetchRestaurantDetail]);

  // Warn before leaving with unsaved edits.
  const dirtyRef = useRef(false);
  dirtyRef.current = isDirty;
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e: any) => {
      if (!dirtyRef.current) return;
      e.preventDefault();
      const leave = () => navigation.dispatch(e.data.action);
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && window.confirm('Discard unsaved changes?')) leave();
        return;
      }
      Alert.alert('Discard changes?', 'You have unsaved changes to this restaurant.', [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: leave },
      ]);
    });
    return unsubscribe;
  }, [navigation]);

  /* ── Form helpers ─────────────────────────────────────────────────────── */

  const set = <K extends FormKey>(key: K, value: FormState[K]) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const num = (key: FormKey) => ({
    value: form ? (form[key] as string) : '',
    onChangeText: (v: string) => set(key, sanitizeDecimal(v) as any),
    keyboardType: 'decimal-pad' as const,
    error: errors[key],
  });

  const text = (key: FormKey) => ({
    value: form ? (form[key] as string) : '',
    onChangeText: (v: string) => set(key, v as any),
    error: errors[key],
  });

  const discardChanges = () => {
    if (savedForm) setForm(savedForm);
    setErrors({});
    setTierDraft(null);
  };

  const handleSave = async () => {
    if (!restaurant || !form) return;
    const v = validateForm(form);
    setErrors(v);
    if (Object.keys(v).length) {
      showToast({
        title: 'Check highlighted fields',
        message: `${Object.keys(v).length} ${Object.keys(v).length === 1 ? 'field needs' : 'fields need'} attention before saving.`,
        type: 'error',
      });
      return;
    }

    setSaving(true);
    try {
      const payload: Partial<Restaurant> = {
        commissionRate: parseFloat(form.commissionRate) || 0,
        defaultDeliveryTime: parseInt(form.defaultDeliveryTime, 10) || 30,
        handlingChargesPercentage: parseFloat(form.handlingFee) || 0,
        externalWebsiteSettings: {
          domain: form.extDomain.trim().replace(/^https?:\/\//i, '').replace(/\/$/, '').toLowerCase() || undefined,
          brandName: form.extBrandName.trim() || undefined,
          primaryColor: form.extPrimaryColor.trim().toUpperCase(),
          secondaryColor: form.extSecondaryColor.trim().toUpperCase(),
          heroBannerUrl: form.extHeroBanner.trim() || undefined,
          logoUrl: form.extLogoUrl.trim() || undefined,
          isPublished: form.extPublished,
        },
        externalDeliverySettings: {
          enabled: form.extDeliveryEnabled,
          deliveryChargeType: form.extChargeType,
          fixedCharge: parseFloat(form.extFixedCharge) || 0,
          freeDeliveryOverOrderValue: form.extFreeThreshold.trim() ? parseFloat(form.extFreeThreshold) : null,
          chargePerMile: parseFloat(form.extPerMile) || 0,
          baseDeliveryDistance: parseFloat(form.extBaseDist) || 0,
          baseDeliveryCharge: parseFloat(form.extBaseCharge) || 0,
          maxDeliveryRadius: parseFloat(form.extMaxRadius) || 10,
          distanceTiers: form.extDistanceTiers,
        },
      };

      const res = await restaurantService.updateRestaurantDetails(restaurant._id, payload);
      if (res.success) {
        setSavedForm(form);
        setRestaurant((prev) => (prev ? { ...prev, ...payload } as Restaurant : prev));
        showToast({ title: 'Changes saved', message: 'Restaurant settings have been updated.', type: 'success' });
      } else {
        showToast({ title: 'Save failed', message: res.message || 'Could not save settings.', type: 'error' });
      }
    } catch (e: any) {
      showToast({ title: 'Save failed', message: e?.message || 'Could not reach the server.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  /* ── Verification & availability ──────────────────────────────────────── */

  const applyStatus = async (newStatus: VerificationStatus) => {
    if (!restaurant) return;
    setUpdatingStatus(true);
    try {
      const res = await restaurantService.verifyRestaurant(restaurant._id, newStatus, remarks.trim());
      if (res.success) {
        // Update locally so unsaved form edits are preserved.
        setRestaurant((prev) => (prev ? withVerificationStatus(prev, newStatus, remarks.trim()) : prev));
        showToast({
          title: 'Verification updated',
          message: `${restaurant.restaurantName} is now ${STATUS_STYLES[newStatus].label.toLowerCase()}.`,
          type: 'success',
        });
      } else {
        showToast({ title: 'Update failed', message: res.message || 'Could not update verification.', type: 'error' });
      }
    } catch (e: any) {
      showToast({ title: 'Update failed', message: e?.message || 'Could not reach the server.', type: 'error' });
    } finally {
      setUpdatingStatus(false);
      setStatusToConfirm(null);
    }
  };

  const applyActive = async (nextActive: boolean) => {
    if (!restaurant) return;
    setTogglingActive(true);
    try {
      const res = await restaurantService.toggleActiveStatus(restaurant._id, nextActive);
      if (res.success) {
        setRestaurant((prev) => (prev ? { ...prev, isActive: nextActive } : prev));
        showToast({
          title: nextActive ? 'Restaurant is live' : 'Restaurant is offline',
          message: nextActive ? 'Customers can see the menu and order again.' : 'Customers can no longer order.',
          type: 'success',
        });
      } else {
        showToast({ title: 'Update failed', message: res.message || 'Could not change availability.', type: 'error' });
      }
    } catch (e: any) {
      showToast({ title: 'Update failed', message: e?.message || 'Could not reach the server.', type: 'error' });
    } finally {
      setTogglingActive(false);
    }
  };

  /* ── Distance tiers ───────────────────────────────────────────────────── */

  const saveTier = () => {
    if (!tierDraft || !form) return;
    const maxD = Number(tierDraft.maxDistance);
    const ch = Number(tierDraft.charge);
    if (!DECIMAL_RE.test(tierDraft.maxDistance) || maxD <= 0) return setTierError('Enter a distance greater than 0.');
    if (!DECIMAL_RE.test(tierDraft.charge)) return setTierError('Enter a valid charge.');
    const clash = form.extDistanceTiers.some((t, i) => t.maxDistance === maxD && i !== tierDraft.index);
    if (clash) return setTierError(`A tier for ${maxD} mi already exists.`);

    const next = [...form.extDistanceTiers];
    if (tierDraft.index !== null) next[tierDraft.index] = { maxDistance: maxD, charge: ch };
    else next.push({ maxDistance: maxD, charge: ch });
    set('extDistanceTiers', next.sort((a, b) => a.maxDistance - b.maxDistance));
    setTierDraft(null);
    setTierError(null);
  };

  /* ── States ───────────────────────────────────────────────────────────── */

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Restaurant" showBackButton />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.centerText}>Loading restaurant…</Text>
        </View>
      </View>
    );
  }

  if (!restaurant || !form) {
    return (
      <View style={styles.container}>
        <Header title="Restaurant" showBackButton />
        <View style={styles.center}>
          <View style={styles.centerIcon}>
            <Store size={30} color={Colors.textSubtle} />
          </View>
          <Text style={styles.centerTitle}>Couldn’t load this restaurant</Text>
          <Text style={styles.centerText}>{loadError || 'Something went wrong.'}</Text>
          <View style={styles.centerActions}>
            <TouchableOpacity style={styles.btnSecondary} onPress={() => router.back()}>
              <Text style={styles.btnSecondaryText}>Go back</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnPrimary} onPress={fetchRestaurantDetail}>
              <RotateCcw size={15} color="#FFFFFF" />
              <Text style={styles.btnPrimaryText}>Try again</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  /* ── Derived ──────────────────────────────────────────────────────────── */

  const status = getVerificationStatus(restaurant);
  const statusStyle = STATUS_STYLES[status];
  const StatusIcon = STATUS_ICON[status];
  const owner = restaurant.ownerFullName ?? restaurant.ownerName;
  const address = getAddressText(restaurant);
  const addr = typeof restaurant.address === 'object' && restaurant.address ? restaurant.address : null;
  const coords = addr?.coordinates?.coordinates;
  const joined = restaurant.createdAt
    ? new Date(restaurant.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;
  const logoSource = resolveMediaImageSource(
    restaurant.imageUrl ||
      (restaurant as any).logoUrl ||
      (restaurant as any).logo ||
      restaurant.externalWebsiteSettings?.logoUrl ||
      restaurant.externalWebsiteSettings?.heroBannerUrl
  );
  const errorCount = Object.keys(errors).length;

  const openMaps = () => {
    const q = coords ? `${coords[1]},${coords[0]}` : address;
    if (q) Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`).catch(() => {});
  };
  const openLink = (url: string) => Linking.openURL(url).catch(() => {});

  const statusActions: { status: VerificationStatus; label: string; icon: IconType; tone: 'success' | 'danger' | 'neutral' }[] =
    status === 'pending'
      ? [
          { status: 'rejected', label: 'Reject', icon: X, tone: 'danger' },
          { status: 'approved', label: 'Approve', icon: Check, tone: 'success' },
        ]
      : status === 'approved'
      ? [
          { status: 'pending', label: 'Back to pending', icon: Clock, tone: 'neutral' },
          { status: 'rejected', label: 'Reject', icon: X, tone: 'danger' },
        ]
      : [
          { status: 'pending', label: 'Back to pending', icon: Clock, tone: 'neutral' },
          { status: 'approved', label: 'Approve', icon: Check, tone: 'success' },
        ];

  /* ── Sections ─────────────────────────────────────────────────────────── */

  const verificationSection = (
    <Section icon={ShieldCheck} title="Verification" subtitle="Review the application and set its status">
      <View style={[styles.statusBanner, { backgroundColor: statusStyle.bg }]}>
        <StatusIcon size={20} color={statusStyle.text} />
        <View style={styles.flex}>
          <Text style={[styles.statusBannerTitle, { color: statusStyle.text }]}>{statusStyle.label}</Text>
          <Text style={[styles.statusBannerSub, { color: statusStyle.text }]}>
            {status === 'pending'
              ? 'This restaurant is waiting for your decision.'
              : status === 'approved'
              ? 'This restaurant can sign in and trade.'
              : 'This restaurant cannot sign in.'}
          </Text>
        </View>
      </View>

      <Text style={styles.label}>Remarks for the owner</Text>
      <TextInput
        style={[styles.textArea, Platform.OS === 'web' && ({ outlineStyle: 'none' } as any)]}
        placeholder="e.g. Hygiene certificate is out of date — please upload a new one."
        placeholderTextColor={Colors.textSubtle}
        multiline
        maxLength={500}
        textAlignVertical="top"
        value={remarks}
        onChangeText={setRemarks}
      />
      <Text style={styles.counter}>{remarks.length}/500 · sent with the status change</Text>

      <View style={styles.statusActions}>
        {statusActions.map((a) => {
          const Icon = a.icon;
          const toneStyle =
            a.tone === 'success' ? styles.actSuccess : a.tone === 'danger' ? styles.actDanger : styles.actNeutral;
          const iconColor = a.tone === 'success' ? '#FFFFFF' : a.tone === 'danger' ? Colors.danger : Colors.text;
          return (
            <TouchableOpacity
              key={a.status}
              style={[styles.actBtn, toneStyle, updatingStatus && styles.disabled]}
              disabled={updatingStatus}
              onPress={() => setStatusToConfirm(a.status)}
            >
              {updatingStatus && statusToConfirm === a.status ? (
                <ActivityIndicator size="small" color={iconColor} />
              ) : (
                <>
                  <Icon size={16} color={iconColor} strokeWidth={2.5} />
                  <Text style={[styles.actText, { color: iconColor }]}>{a.label}</Text>
                </>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </Section>
  );

  const availabilitySection = (
    <Section icon={Power} title="Availability">
      <ToggleRow
        title={restaurant.isActive ? 'Live — accepting orders' : 'Offline — hidden from customers'}
        subtitle="Controls whether customers can see this restaurant and place orders."
        value={restaurant.isActive}
        busy={togglingActive}
        onChange={(v) => (v ? applyActive(true) : setDeactivateVisible(true))}
      />
    </Section>
  );

  const contactSection = (
    <Section icon={User} title="Contact & location">
      <View style={styles.kv}>
        <User size={15} color={Colors.textSubtle} />
        <Text style={styles.kvLabel}>Owner</Text>
        <Text style={styles.kvValue} selectable>
          {owner || 'Not specified'}
        </Text>
      </View>
      <TouchableOpacity
        style={styles.kv}
        disabled={!restaurant.email}
        onPress={() => openLink(`mailto:${restaurant.email}`)}
      >
        <Mail size={15} color={Colors.textSubtle} />
        <Text style={styles.kvLabel}>Email</Text>
        <Text style={[styles.kvValue, !!restaurant.email && styles.kvLink]} numberOfLines={1}>
          {restaurant.email || 'Not provided'}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.kv}
        disabled={!restaurant.phoneNumber}
        onPress={() => openLink(`tel:${restaurant.phoneNumber?.replace(/\s/g, '')}`)}
      >
        <Phone size={15} color={Colors.textSubtle} />
        <Text style={styles.kvLabel}>Phone</Text>
        <Text style={[styles.kvValue, !!restaurant.phoneNumber && styles.kvLink]}>
          {restaurant.phoneNumber || 'Not provided'}
        </Text>
      </TouchableOpacity>
      <View style={styles.kv}>
        <MapPin size={15} color={Colors.textSubtle} />
        <Text style={styles.kvLabel}>Address</Text>
        <Text style={styles.kvValue} selectable>
          {address || 'Not provided'}
        </Text>
      </View>
      {restaurant.cuisineTypes?.length ? (
        <View style={[styles.kv, styles.kvLast]}>
          <Info size={15} color={Colors.textSubtle} />
          <Text style={styles.kvLabel}>Cuisines</Text>
          <Text style={styles.kvValue}>{restaurant.cuisineTypes.join(', ')}</Text>
        </View>
      ) : null}
      {(coords || address) && (
        <TouchableOpacity style={styles.mapBtn} onPress={openMaps}>
          <Navigation size={15} color={Colors.primary} />
          <Text style={styles.mapBtnText}>Open in Maps</Text>
        </TouchableOpacity>
      )}
    </Section>
  );

  const commercialSection = (
    <Section icon={Percent} title="Commercial & operations" subtitle="Rates Krifoo applies to this restaurant">
      <Row stack={stackPairs}>
        <Field label="Commission" suffix="%" maxLength={6} hint="0–100" {...num('commissionRate')} />
        <Field label="Handling charge" suffix="%" maxLength={6} hint="Added to each order" {...num('handlingFee')} />
      </Row>
      <View style={!stackPairs ? styles.half : undefined}>
        <Field
          label="Default prep time"
          suffix="min"
          maxLength={3}
          hint="Shown to customers as the estimate"
          {...num('defaultDeliveryTime')}
          onChangeText={(v) => set('defaultDeliveryTime', v.replace(/\D/g, ''))}
          keyboardType="number-pad"
        />
      </View>
    </Section>
  );

  const swatch = (hex: string) => (
    <View style={[styles.swatch, { backgroundColor: HEX_RE.test(hex.trim()) ? hex.trim() : Colors.cardSurface }]} />
  );

  const websiteSection = (
    <Section
      icon={Globe}
      title="Website & branding"
      subtitle="The restaurant’s own ordering site"
      right={
        <TouchableOpacity
          style={styles.linkBtn}
          onPress={() => router.push({ pathname: '/external-website-settings', params: { restaurantId: restaurant._id } })}
        >
          <Text style={styles.linkBtnText}>Open Studio</Text>
          <ExternalLink size={13} color={Colors.primary} />
        </TouchableOpacity>
      }
    >
      <ToggleRow
        title="Website published"
        subtitle={form.extPublished ? 'The site is live for customers.' : 'The site is hidden.'}
        value={form.extPublished}
        onChange={(v) => set('extPublished', v)}
      />
      <View style={styles.divider} />
      <Row stack={!isTablet}>
        <Field
          label="Custom domain"
          placeholder="myrestaurant.co.uk"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          {...text('extDomain')}
        />
        <Field label="Brand display name" placeholder="Demo Kitchen" maxLength={60} {...text('extBrandName')} />
      </Row>
      <Row stack={stackPairs}>
        <Field
          label="Primary colour"
          placeholder="#E11D48"
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={7}
          leading={swatch(form.extPrimaryColor)}
          {...text('extPrimaryColor')}
        />
        <Field
          label="Secondary colour"
          placeholder="#4F46E5"
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={7}
          leading={swatch(form.extSecondaryColor)}
          {...text('extSecondaryColor')}
        />
      </Row>
      <Field
        label="Logo image URL"
        placeholder="https://…"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        {...text('extLogoUrl')}
      />
      <Field
        label="Hero banner image URL"
        placeholder="https://…"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        {...text('extHeroBanner')}
      />
    </Section>
  );

  const CHARGE_TYPES: { value: ChargeType; label: string; desc: string }[] = [
    { value: 'tiered', label: 'Tiered', desc: 'Price by distance band' },
    { value: 'fixed', label: 'Fixed', desc: 'One flat fee' },
    { value: 'per_mile', label: 'Per mile', desc: 'Base fee + per mile' },
  ];

  const tiers = form.extDistanceTiers;
  const deliverySection = (
    <Section icon={Truck} title="External delivery" subtitle="Delivery fees for orders from the restaurant’s website">
      <ToggleRow
        title="Use custom delivery charges"
        subtitle={form.extDeliveryEnabled ? 'Fees below apply to website orders.' : 'Platform defaults are used.'}
        value={form.extDeliveryEnabled}
        onChange={(v) => set('extDeliveryEnabled', v)}
      />

      {form.extDeliveryEnabled && (
        <>
          <View style={styles.divider} />
          <Text style={styles.label}>Charge type</Text>
          <View style={styles.typeGrid}>
            {CHARGE_TYPES.map((t) => {
              const active = form.extChargeType === t.value;
              return (
                <TouchableOpacity
                  key={t.value}
                  style={[styles.typeCard, active && styles.typeCardActive]}
                  onPress={() => set('extChargeType', t.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                >
                  <View style={[styles.radio, active && styles.radioActive]}>{active && <View style={styles.radioDot} />}</View>
                  <Text style={[styles.typeLabel, active && { color: Colors.primaryDark }]}>{t.label}</Text>
                  <Text style={styles.typeDesc}>{t.desc}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Row stack={stackPairs}>
            <Field label="Max delivery radius" suffix="mi" maxLength={5} {...num('extMaxRadius')} />
            <Field
              label="Free delivery over"
              prefix="£"
              placeholder="Off"
              maxLength={7}
              hint="Leave blank to disable"
              {...num('extFreeThreshold')}
            />
          </Row>

          {form.extChargeType === 'fixed' && (
            <View style={!stackPairs ? styles.half : undefined}>
              <Field label="Fixed delivery charge" prefix="£" maxLength={6} {...num('extFixedCharge')} />
            </View>
          )}

          {form.extChargeType === 'per_mile' && (
            <Row stack={!isTablet}>
              <Field label="Base charge" prefix="£" maxLength={6} {...num('extBaseCharge')} />
              <Field label="Base distance" suffix="mi" maxLength={5} {...num('extBaseDist')} />
              <Field label="Each extra mile" prefix="£" maxLength={5} {...num('extPerMile')} />
            </Row>
          )}

          {form.extChargeType === 'tiered' && (
            <View style={styles.tiersBox}>
              <View style={styles.tiersHead}>
                <Text style={styles.label}>Distance tiers</Text>
                {!tierDraft && (
                  <TouchableOpacity
                    style={styles.addTierBtn}
                    onPress={() => {
                      setTierError(null);
                      setTierDraft({ index: null, maxDistance: '', charge: '' });
                    }}
                  >
                    <Plus size={14} color={Colors.primary} />
                    <Text style={styles.addTierText}>Add tier</Text>
                  </TouchableOpacity>
                )}
              </View>

              {tiers.length === 0 && !tierDraft ? (
                <Text style={[styles.emptyTiers, errors.extDistanceTiers && { color: Colors.danger }]}>
                  {errors.extDistanceTiers || 'No tiers yet. Add one to set a price for each distance band.'}
                </Text>
              ) : (
                tiers.map((t, i) => {
                  const from = i === 0 ? 0 : tiers[i - 1].maxDistance;
                  const editing = tierDraft?.index === i;
                  if (editing) return null;
                  return (
                    <View key={`${t.maxDistance}-${i}`} style={styles.tierRow}>
                      <View style={styles.flex}>
                        <Text style={styles.tierRange}>
                          {from}–{t.maxDistance} mi
                        </Text>
                      </View>
                      <Text style={styles.tierCharge}>{Number(t.charge) === 0 ? 'Free' : `£${Number(t.charge).toFixed(2)}`}</Text>
                      <TouchableOpacity
                        style={styles.iconBtn}
                        onPress={() => {
                          setTierError(null);
                          setTierDraft({ index: i, maxDistance: String(t.maxDistance), charge: String(t.charge) });
                        }}
                        accessibilityLabel={`Edit tier up to ${t.maxDistance} miles`}
                      >
                        <Pencil size={15} color={Colors.textMuted} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.iconBtn}
                        onPress={() => set('extDistanceTiers', tiers.filter((_, idx) => idx !== i))}
                        accessibilityLabel={`Delete tier up to ${t.maxDistance} miles`}
                      >
                        <Trash2 size={15} color={Colors.danger} />
                      </TouchableOpacity>
                    </View>
                  );
                })
              )}

              {tierDraft && (
                <View style={styles.tierEditor}>
                  <Text style={styles.tierEditorTitle}>{tierDraft.index !== null ? 'Edit tier' : 'New tier'}</Text>
                  <Row>
                    <Field
                      label="Up to"
                      suffix="mi"
                      placeholder="3"
                      keyboardType="decimal-pad"
                      maxLength={5}
                      value={tierDraft.maxDistance}
                      onChangeText={(v) => setTierDraft((d) => (d ? { ...d, maxDistance: sanitizeDecimal(v) } : d))}
                      autoFocus
                    />
                    <Field
                      label="Charge"
                      prefix="£"
                      placeholder="2.50"
                      keyboardType="decimal-pad"
                      maxLength={6}
                      value={tierDraft.charge}
                      onChangeText={(v) => setTierDraft((d) => (d ? { ...d, charge: sanitizeDecimal(v) } : d))}
                      onSubmitEditing={saveTier}
                    />
                  </Row>
                  {tierError && (
                    <View style={[styles.msgRow, { marginTop: -6, marginBottom: 10 }]}>
                      <CircleAlert size={12} color={Colors.danger} />
                      <Text style={styles.errorText}>{tierError}</Text>
                    </View>
                  )}
                  <View style={styles.tierEditorActions}>
                    <TouchableOpacity
                      style={styles.btnSecondarySm}
                      onPress={() => {
                        setTierDraft(null);
                        setTierError(null);
                      }}
                    >
                      <Text style={styles.btnSecondaryText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.btnPrimarySm} onPress={saveTier}>
                      <Text style={styles.btnPrimaryText}>{tierDraft.index !== null ? 'Update tier' : 'Add tier'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {tiers.length > 0 &&
                !errors.extMaxRadius &&
                tiers[tiers.length - 1].maxDistance < Number(form.extMaxRadius) && (
                  <View style={styles.note}>
                    <Info size={14} color={Colors.statusPending.text} />
                    <Text style={styles.noteText}>
                      Tiers stop at {tiers[tiers.length - 1].maxDistance} mi but the max radius is {form.extMaxRadius} mi.
                      Add a tier to cover the full radius.
                    </Text>
                  </View>
                )}
            </View>
          )}
        </>
      )}
    </Section>
  );

  /* ── Layout ───────────────────────────────────────────────────────────── */

  const bottomPad = isDirty ? 110 + insets.bottom : 32 + insets.bottom;

  return (
    <View style={styles.container}>
      <Header title="Restaurant" showBackButton />

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.frame, { paddingHorizontal: gutter, paddingTop: 16, paddingBottom: bottomPad }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Hero */}
          <View style={[styles.hero, isTablet && styles.heroTablet]}>
            {logoSource ? (
              <Image source={logoSource} style={[styles.logo, isTablet && styles.logoTablet]} contentFit="cover" transition={200} cachePolicy="memory-disk" />
            ) : (
              <View style={[styles.logo, isTablet && styles.logoTablet, styles.logoPlaceholder]}>
                <Text style={styles.logoInitial}>{restaurant.restaurantName?.trim().charAt(0).toUpperCase() || 'R'}</Text>
              </View>
            )}
            <View style={styles.heroText}>
              <Text style={[styles.heroName, isTablet && { fontSize: 26 }]} numberOfLines={2}>
                {restaurant.restaurantName}
              </Text>
              {owner ? <Text style={styles.heroOwner}>Owned by {owner}</Text> : null}
              <View style={styles.pillRow}>
                <View style={[styles.pill, { backgroundColor: statusStyle.bg }]}>
                  <View style={[styles.dot, { backgroundColor: statusStyle.dot }]} />
                  <Text style={[styles.pillText, { color: statusStyle.text }]}>{statusStyle.label}</Text>
                </View>
                <View style={[styles.pill, { backgroundColor: restaurant.isActive ? Colors.statusActive.bg : Colors.cardSurface }]}>
                  <View style={[styles.dot, { backgroundColor: restaurant.isActive ? Colors.info : Colors.textSubtle }]} />
                  <Text style={[styles.pillText, { color: restaurant.isActive ? Colors.statusActive.text : Colors.textMuted }]}>
                    {restaurant.isActive ? 'Live' : 'Offline'}
                  </Text>
                </View>
                {joined && (
                  <View style={styles.joined}>
                    <CalendarDays size={12} color={Colors.textSubtle} />
                    <Text style={styles.joinedText}>Joined {joined}</Text>
                  </View>
                )}
              </View>
            </View>
            {isTablet && (
              <View style={styles.heroActions}>
                {restaurant.phoneNumber ? (
                  <TouchableOpacity style={styles.heroBtn} onPress={() => openLink(`tel:${restaurant.phoneNumber!.replace(/\s/g, '')}`)}>
                    <Phone size={16} color={Colors.text} />
                    <Text style={styles.heroBtnText}>Call</Text>
                  </TouchableOpacity>
                ) : null}
                {restaurant.email ? (
                  <TouchableOpacity style={styles.heroBtn} onPress={() => openLink(`mailto:${restaurant.email}`)}>
                    <Mail size={16} color={Colors.text} />
                    <Text style={styles.heroBtnText}>Email</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            )}
          </View>

          {isWide ? (
            <View style={styles.columns}>
              <View style={styles.sideCol}>
                {verificationSection}
                {availabilitySection}
                {contactSection}
              </View>
              <View style={styles.mainCol}>
                {commercialSection}
                {websiteSection}
                {deliverySection}
              </View>
            </View>
          ) : (
            <>
              {verificationSection}
              {availabilitySection}
              {commercialSection}
              {websiteSection}
              {deliverySection}
              {contactSection}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Sticky save bar — only when there are unsaved edits */}
      {isDirty && (
        <View style={[styles.saveBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <View style={[styles.saveBarInner, styles.frame]}>
            <View style={styles.flex}>
              <Text style={styles.saveBarTitle}>{errorCount ? `${errorCount} field${errorCount === 1 ? '' : 's'} to fix` : 'Unsaved changes'}</Text>
              {isTablet && <Text style={styles.saveBarSub}>Save to apply these settings to the restaurant.</Text>}
            </View>
            <TouchableOpacity style={styles.btnSecondary} onPress={discardChanges} disabled={saving}>
              <Text style={styles.btnSecondaryText}>Discard</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btnPrimary, saving && styles.disabled]} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.btnPrimaryText}>Save changes</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )}

      <ConfirmModal
        visible={!!statusToConfirm && !updatingStatus}
        title={
          statusToConfirm === 'approved'
            ? 'Approve this restaurant?'
            : statusToConfirm === 'rejected'
            ? 'Reject this restaurant?'
            : 'Move back to pending?'
        }
        message={
          statusToConfirm === 'approved'
            ? `${restaurant.restaurantName} will be able to sign in and start trading.`
            : statusToConfirm === 'rejected'
            ? `${restaurant.restaurantName} won’t be able to sign in.${remarks.trim() ? ' Your remarks will be shared with the owner.' : ' Consider adding remarks so the owner knows why.'}`
            : `${restaurant.restaurantName} will return to the review queue.`
        }
        confirmText={statusToConfirm === 'approved' ? 'Approve' : statusToConfirm === 'rejected' ? 'Reject' : 'Move to pending'}
        isDestructive={statusToConfirm === 'rejected'}
        onConfirm={() => statusToConfirm && applyStatus(statusToConfirm)}
        onClose={() => setStatusToConfirm(null)}
      />

      <ConfirmModal
        visible={deactivateVisible}
        title="Take restaurant offline?"
        message={`${restaurant.restaurantName} will be hidden from customers and can’t receive new orders until you turn it back on.`}
        confirmText="Take offline"
        isDestructive
        onConfirm={() => {
          setDeactivateVisible(false);
          applyActive(false);
        }}
        onClose={() => setDeactivateVisible(false)}
      />
    </View>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Styles
 * ──────────────────────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.backgroundSecondary },
  flex: { flex: 1 },
  frame: { width: '100%', maxWidth: 1280, alignSelf: 'center' },
  disabled: { opacity: 0.6 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  centerIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  centerTitle: { fontSize: 18, fontWeight: '800', color: Colors.text },
  centerText: { fontSize: 14, color: Colors.textMuted, marginTop: 8, textAlign: 'center' },
  centerActions: { flexDirection: 'row', gap: 10, marginTop: 20 },

  // Hero
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: Colors.background,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 16,
    marginBottom: 16,
  },
  heroTablet: { padding: 22, gap: 18 },
  logo: { width: 68, height: 68, borderRadius: 16 },
  logoTablet: { width: 84, height: 84, borderRadius: 20 },
  logoPlaceholder: { backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  logoInitial: { fontSize: 28, fontWeight: '800', color: Colors.primary },
  heroText: { flex: 1, minWidth: 0 },
  heroName: { fontSize: 20, fontWeight: '800', color: Colors.text, letterSpacing: -0.4 },
  heroOwner: { fontSize: 13, color: Colors.textMuted, marginTop: 2 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 8 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
  pillText: { fontSize: 12, fontWeight: '700' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  joined: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 4 },
  joinedText: { fontSize: 12, color: Colors.textSubtle, fontWeight: '600' },
  heroActions: { flexDirection: 'row', gap: 8 },
  heroBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.background,
  },
  heroBtnText: { fontSize: 14, fontWeight: '700', color: Colors.text },

  // Columns
  columns: { flexDirection: 'row', alignItems: 'flex-start', gap: 16 },
  sideCol: { flex: 1, minWidth: 0 },
  mainCol: { flex: 1.5, minWidth: 0 },

  // Section
  section: {
    backgroundColor: Colors.background,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 18,
    marginBottom: 16,
  },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  sectionIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: Colors.text, letterSpacing: -0.2 },
  sectionSub: { fontSize: 12, color: Colors.textMuted, marginTop: 1 },
  divider: { height: 1, backgroundColor: Colors.cardBorder, marginVertical: 14 },

  // Fields
  row: { flexDirection: 'row', gap: 12 },
  rowItem: { flex: 1, minWidth: 0 },
  half: { width: '50%', paddingRight: 6 },
  field: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '700', color: Colors.text, marginBottom: 7 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 48,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.cardSurface,
  },
  inputFocused: { borderColor: Colors.primary, backgroundColor: Colors.background },
  inputError: { borderColor: Colors.danger, backgroundColor: '#FFFBFB' },
  input: { flex: 1, minWidth: 0, height: '100%', fontSize: 15, color: Colors.text, paddingVertical: 0 },
  affix: { fontSize: 15, fontWeight: '700', color: Colors.textMuted },
  msgRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 5, marginTop: 5 },
  errorText: { flex: 1, fontSize: 12, fontWeight: '600', color: Colors.danger, lineHeight: 16 },
  hint: { fontSize: 12, color: Colors.textSubtle, marginTop: 5 },
  swatch: { width: 22, height: 22, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)' },
  textArea: {
    minHeight: 90,
    maxHeight: 160,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.cardSurface,
    padding: 12,
    fontSize: 14,
    color: Colors.text,
  },
  counter: { fontSize: 11, color: Colors.textSubtle, marginTop: 5, textAlign: 'right' },

  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  toggleTitle: { fontSize: 15, fontWeight: '700', color: Colors.text },
  toggleSub: { fontSize: 13, color: Colors.textMuted, marginTop: 2, lineHeight: 18 },

  // Verification
  statusBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, marginBottom: 16 },
  statusBannerTitle: { fontSize: 15, fontWeight: '800' },
  statusBannerSub: { fontSize: 13, marginTop: 1, opacity: 0.9 },
  statusActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  actBtn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 10,
  },
  actSuccess: { backgroundColor: Colors.success },
  actDanger: { backgroundColor: Colors.background, borderWidth: 1.5, borderColor: '#FECACA' },
  actNeutral: { backgroundColor: Colors.background, borderWidth: 1.5, borderColor: Colors.cardBorder },
  actText: { fontSize: 14, fontWeight: '800' },

  // Contact
  kv: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  kvLast: { borderBottomWidth: 0 },
  kvLabel: { width: 72, fontSize: 13, color: Colors.textSubtle, fontWeight: '600' },
  kvValue: { flex: 1, fontSize: 14, color: Colors.text, lineHeight: 19 },
  kvLink: { color: Colors.primary, fontWeight: '600' },
  mapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 42,
    marginTop: 14,
    borderRadius: 12,
    backgroundColor: Colors.primaryLight,
  },
  mapBtnText: { fontSize: 14, fontWeight: '700', color: Colors.primary },

  linkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.primaryLight,
  },
  linkBtnText: { fontSize: 12, fontWeight: '800', color: Colors.primary },

  // Charge type
  typeGrid: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  typeCard: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.cardSurface,
  },
  typeCardActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: Colors.textSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  radioActive: { borderColor: Colors.primary },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.primary },
  typeLabel: { fontSize: 14, fontWeight: '800', color: Colors.text },
  typeDesc: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },

  // Tiers
  tiersBox: { marginTop: 2 },
  tiersHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  addTierBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 32,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: Colors.primaryLight,
    marginBottom: 7,
  },
  addTierText: { fontSize: 13, fontWeight: '700', color: Colors.primary },
  emptyTiers: { fontSize: 13, color: Colors.textMuted, paddingVertical: 8 },
  tierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingLeft: 14,
    paddingRight: 4,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.cardSurface,
  },
  tierRange: { fontSize: 14, fontWeight: '700', color: Colors.text },
  tierCharge: { fontSize: 15, fontWeight: '800', color: Colors.primary, marginRight: 6 },
  iconBtn: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  tierEditor: {
    padding: 14,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    backgroundColor: Colors.background,
  },
  tierEditorTitle: { fontSize: 14, fontWeight: '800', color: Colors.text, marginBottom: 10 },
  tierEditorActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  note: {
    flexDirection: 'row',
    gap: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: Colors.statusPending.bg,
    marginTop: 4,
  },
  noteText: { flex: 1, fontSize: 12, color: Colors.statusPending.text, lineHeight: 17 },

  // Buttons
  btnPrimary: {
    height: 44,
    minWidth: 120,
    paddingHorizontal: 18,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.primary,
  },
  btnPrimaryText: { fontSize: 14, fontWeight: '800', color: '#FFFFFF' },
  btnSecondary: {
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.background,
  },
  btnSecondaryText: { fontSize: 14, fontWeight: '700', color: Colors.textMuted },
  btnPrimarySm: {
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
  },
  btnSecondarySm: {
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: Colors.cardBorder,
  },

  // Save bar
  saveBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderTopColor: Colors.cardBorder,
    paddingTop: 12,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
  saveBarInner: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  saveBarTitle: { fontSize: 14, fontWeight: '800', color: Colors.text },
  saveBarSub: { fontSize: 12, color: Colors.textMuted, marginTop: 1 },
});

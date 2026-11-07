import React, { useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TextInputProps,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../context/AuthContext';
import { Colors } from '../constants/colors';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ShieldCheck,
  Mail,
  Phone,
  Lock,
  User,
  Store,
  Eye,
  EyeOff,
  MapPin,
  Building2,
  Landmark,
  CreditCard,
  FileCheck,
  Truck,
  CircleAlert,
  Info,
  UtensilsCrossed,
  ShoppingBasket,
  Bike,
  Beef,
} from 'lucide-react-native';

/* ────────────────────────────────────────────────────────────────────────────
 * Types & constants
 * ──────────────────────────────────────────────────────────────────────────── */

type IconType = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

type FormState = {
  ownerFullName: string;
  email: string;
  password: string;
  confirmPassword: string;
  phoneNumber: string;
  restaurantName: string;
  restaurantType: string;
  handlingChargesPercentage: string;
  shopNo: string;
  floor: string;
  area: string; // UK postcode
  city: string;
  landmark: string;
  freeDeliveryRadius: string;
  chargePerMile: string;
  maxDeliveryRadius: string;
  businessLicenseNumber: string;
  foodHygieneCertificateNumber: string;
  vatNumber: string;
  beneficiaryName: string;
  sortCode: string;
  accountNumber: string;
  bankAddress: string;
  termsAccepted: boolean;
  privacyAccepted: boolean;
};

type FieldKey = keyof FormState;
type TextKey = Exclude<FieldKey, 'restaurantType' | 'termsAccepted' | 'privacyAccepted'>;

const INITIAL_FORM: FormState = {
  ownerFullName: '',
  email: '',
  password: '',
  confirmPassword: '',
  phoneNumber: '',
  restaurantName: '',
  restaurantType: 'food_delivery_and_dining',
  handlingChargesPercentage: '5.00',
  shopNo: '',
  floor: '',
  area: '',
  city: '',
  landmark: '',
  freeDeliveryRadius: '2',
  chargePerMile: '1',
  maxDeliveryRadius: '10',
  businessLicenseNumber: '',
  foodHygieneCertificateNumber: '',
  vatNumber: '',
  beneficiaryName: '',
  sortCode: '',
  accountNumber: '',
  bankAddress: '',
  termsAccepted: false,
  privacyAccepted: false,
};

const STEPS: { title: string; short: string; desc: string; icon: IconType }[] = [
  {
    title: 'Owner Account',
    short: 'Owner',
    desc: 'Your login and contact details. We use these to reach you about your application.',
    icon: User,
  },
  {
    title: 'Store Profile',
    short: 'Store',
    desc: 'Tell us about your business and what you sell.',
    icon: Store,
  },
  {
    title: 'Location & Delivery',
    short: 'Location',
    desc: 'Where your store is and how far you deliver.',
    icon: MapPin,
  },
  {
    title: 'Compliance & Payouts',
    short: 'Payouts',
    desc: 'Your licences and the bank account we pay your earnings into.',
    icon: Landmark,
  },
];

/** Fields validated on each step, in on-screen order (drives "Next" key focus chaining). */
const STEP_FIELDS: FieldKey[][] = [
  ['ownerFullName', 'email', 'phoneNumber', 'password', 'confirmPassword'],
  ['restaurantName', 'restaurantType', 'handlingChargesPercentage'],
  ['shopNo', 'floor', 'landmark', 'area', 'city', 'freeDeliveryRadius', 'chargePerMile', 'maxDeliveryRadius'],
  [
    'businessLicenseNumber',
    'foodHygieneCertificateNumber',
    'vatNumber',
    'beneficiaryName',
    'sortCode',
    'accountNumber',
    'bankAddress',
    'termsAccepted',
    'privacyAccepted',
  ],
];

const NON_TEXT_FIELDS = new Set<FieldKey>(['restaurantType', 'termsAccepted', 'privacyAccepted']);

const BUSINESS_TYPES: { label: string; desc: string; value: string; icon: IconType }[] = [
  { label: 'Food & Dining', desc: 'Delivery + dine-in', value: 'food_delivery_and_dining', icon: UtensilsCrossed },
  { label: 'Delivery Only', desc: 'Takeaway kitchen', value: 'food_delivery', icon: Bike },
  { label: 'Groceries', desc: 'Convenience & grocery', value: 'groceries', icon: ShoppingBasket },
  { label: 'Meat & Poultry', desc: 'Butcher & halal', value: 'meat_poultry', icon: Beef },
];

/* ────────────────────────────────────────────────────────────────────────────
 * Validation helpers
 * ──────────────────────────────────────────────────────────────────────────── */

const NAME_RE = /^[A-Za-zÀ-ÖØ-öø-ÿ' .-]+$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const UK_PHONE_RE = /^(?:(?:\+|00)44|0)\d{9,10}$/;
const POSTCODE_RE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;
const CITY_RE = /^[A-Za-zÀ-ÖØ-öø-ÿ' .-]+$/;
const DECIMAL_RE = /^\d+(\.\d{1,2})?$/;
const REF_RE = /^[A-Za-z0-9\-/ ]+$/;
const VAT_RE = /^(GB)?(\d{9}|\d{12}|GD\d{3}|HA\d{3})$/;

const normalizePhone = (v: string) => v.replace(/\(0\)/g, '').replace(/[\s()-]/g, '');
const digitsOnly = (v: string) => v.replace(/\D/g, '');
const isNotVatRegistered = (v: string) => !v.trim() || /^n\/?a$/i.test(v.trim());

const formatPostcode = (v: string) => {
  const compact = v.replace(/\s+/g, '').toUpperCase();
  return compact.length > 3 ? `${compact.slice(0, -3)} ${compact.slice(-3)}` : compact;
};

const formatSortCode = (v: string) =>
  digitsOnly(v)
    .slice(0, 6)
    .replace(/(\d{2})(?=\d)/g, '$1-');

const sanitizeDecimal = (v: string) => {
  const cleaned = v.replace(/[^0-9.]/g, '');
  const [whole, ...rest] = cleaned.split('.');
  return rest.length ? `${whole}.${rest.join('').slice(0, 2)}` : whole;
};

const checkNumber = (v: string, label: string, min: number, max: number) => {
  if (!v) return `Enter the ${label}.`;
  if (!DECIMAL_RE.test(v)) return 'Enter a valid number (up to 2 decimals).';
  const n = Number(v);
  if (n < min || n > max) return `Must be between ${min} and ${max}.`;
  return undefined;
};

function validateField(key: FieldKey, d: FormState): string | undefined {
  const raw = d[key];
  const v = typeof raw === 'string' ? raw.trim() : '';

  switch (key) {
    case 'ownerFullName':
      if (!v) return 'Enter your full name.';
      if (v.length < 2) return 'Name is too short.';
      if (!NAME_RE.test(v)) return 'Use letters, spaces, hyphens or apostrophes only.';
      return;
    case 'email':
      if (!v) return 'Enter your email address.';
      if (!EMAIL_RE.test(v)) return 'Enter a valid email, e.g. name@business.co.uk.';
      return;
    case 'phoneNumber':
      if (!v) return 'Enter your phone number.';
      if (!UK_PHONE_RE.test(normalizePhone(v))) return 'Enter a valid UK number, e.g. 07123 456789.';
      return;
    case 'password':
      if (!d.password) return 'Create a password.';
      if (d.password.length < 8) return 'Use at least 8 characters.';
      if (!/[A-Za-z]/.test(d.password) || !/\d/.test(d.password))
        return 'Include at least one letter and one number.';
      return;
    case 'confirmPassword':
      if (!d.confirmPassword) return 'Re-enter your password.';
      if (d.confirmPassword !== d.password) return 'Passwords do not match.';
      return;

    case 'restaurantName':
      if (!v) return 'Enter your business name.';
      if (v.length < 2) return 'Business name is too short.';
      if (v.length > 80) return 'Keep it under 80 characters.';
      return;
    case 'restaurantType':
      if (!v) return 'Choose a business type.';
      return;
    case 'handlingChargesPercentage':
      return checkNumber(v, 'handling charge', 0, 100);

    case 'area':
      if (!v) return 'Enter your postcode.';
      if (!POSTCODE_RE.test(v)) return 'Enter a valid UK postcode, e.g. EC1A 1BB.';
      return;
    case 'city':
      if (!v) return 'Enter your city.';
      if (!CITY_RE.test(v)) return 'City should contain letters only.';
      return;
    case 'freeDeliveryRadius': {
      const err = checkNumber(v, 'free radius', 0, 50);
      if (err) return err;
      const max = d.maxDeliveryRadius.trim();
      if (DECIMAL_RE.test(max) && Number(v) > Number(max)) return 'Can’t exceed the max radius.';
      return;
    }
    case 'chargePerMile':
      return checkNumber(v, 'charge per mile', 0, 50);
    case 'maxDeliveryRadius': {
      const err = checkNumber(v, 'max radius', 0, 50);
      if (err) return err;
      if (Number(v) <= 0) return 'Must be greater than 0.';
      return;
    }

    case 'businessLicenseNumber':
    case 'foodHygieneCertificateNumber':
      if (!v) return 'This number is required.';
      if (v.length < 3) return 'Number is too short.';
      if (!REF_RE.test(v)) return 'Use letters, numbers, “-” or “/” only.';
      return;
    case 'vatNumber':
      if (isNotVatRegistered(v)) return;
      if (!VAT_RE.test(v.replace(/\s/g, '').toUpperCase()))
        return 'Enter a valid UK VAT number (e.g. GB123456789) or leave blank.';
      return;
    case 'beneficiaryName':
      if (!v) return 'Enter the account holder name.';
      if (v.length < 2) return 'Name is too short.';
      return;
    case 'sortCode':
      if (digitsOnly(v).length !== 6) return 'Sort code must be 6 digits.';
      return;
    case 'accountNumber':
      if (!/^\d{8}$/.test(v)) return 'Account number must be 8 digits.';
      return;
    case 'bankAddress':
      if (!v) return 'Enter the bank branch address.';
      if (v.length < 5) return 'Address is too short.';
      return;
    case 'termsAccepted':
      if (!d.termsAccepted) return 'Please accept the Terms of Service.';
      return;
    case 'privacyAccepted':
      if (!d.privacyAccepted) return 'Please accept the Privacy Policy.';
      return;
    default:
      return;
  }
}

const getPasswordStrength = (p: string) => {
  let score = 0;
  if (p.length >= 8) score++;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) score++;
  if (/\d/.test(p)) score++;
  if (/[^A-Za-z0-9]/.test(p) || p.length >= 12) score++;
  const levels = [
    { label: 'Too weak', color: Colors.danger },
    { label: 'Weak', color: Colors.danger },
    { label: 'Fair', color: Colors.warning },
    { label: 'Good', color: Colors.info },
    { label: 'Strong', color: Colors.success },
  ];
  return { score, ...levels[score] };
};

const errorFeedback = () => {
  if (Platform.OS === 'web') return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
};

/* ────────────────────────────────────────────────────────────────────────────
 * Presentational building blocks
 * ──────────────────────────────────────────────────────────────────────────── */

type FieldProps = TextInputProps & {
  label: string;
  required?: boolean;
  icon?: IconType;
  error?: string;
  hint?: string;
  prefix?: string;
  suffix?: string;
  rightElement?: React.ReactNode;
  inputRef?: (r: TextInput | null) => void;
};

function Field({
  label,
  required,
  icon: Icon,
  error,
  hint,
  prefix,
  suffix,
  rightElement,
  inputRef,
  onFocus,
  onBlur,
  ...rest
}: FieldProps) {
  const [focused, setFocused] = useState(false);
  const iconColor = error ? Colors.danger : focused ? Colors.primary : Colors.textSubtle;

  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        {label}
        {required ? <Text style={styles.required}> *</Text> : <Text style={styles.optional}>  Optional</Text>}
      </Text>
      <View
        style={[
          styles.inputWrap,
          focused && styles.inputWrapFocused,
          !!error && styles.inputWrapError,
        ]}
      >
        {Icon ? <Icon size={18} color={iconColor} /> : null}
        {prefix ? <Text style={styles.affix}>{prefix}</Text> : null}
        <TextInput
          ref={inputRef}
          style={[styles.input, webNoOutline]}
          placeholderTextColor={Colors.textSubtle}
          accessibilityLabel={label}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          {...rest}
        />
        {suffix ? <Text style={styles.affix}>{suffix}</Text> : null}
        {rightElement}
      </View>
      {error ? (
        <View style={styles.messageRow} accessibilityLiveRegion="polite">
          <CircleAlert size={13} color={Colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

/** Lays children side-by-side, or stacks them when `stack` is true. */
function Row({ children, stack }: { children: React.ReactNode; stack?: boolean }) {
  return (
    <View style={stack ? undefined : styles.row}>
      {React.Children.map(children, (child) =>
        child ? <View style={stack ? undefined : styles.rowItem}>{child}</View> : null
      )}
    </View>
  );
}

function SectionLabel({ icon: Icon, children }: { icon: IconType; children: React.ReactNode }) {
  return (
    <View style={styles.sectionLabel}>
      <Icon size={15} color={Colors.primary} />
      <Text style={styles.sectionLabelText}>{children}</Text>
    </View>
  );
}

function Checkbox({
  checked,
  onToggle,
  error,
  children,
}: {
  checked: boolean;
  onToggle: () => void;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <View>
      <TouchableOpacity
        style={styles.checkboxRow}
        onPress={onToggle}
        activeOpacity={0.7}
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
      >
        <View style={[styles.checkbox, checked && styles.checkboxChecked, !!error && !checked && styles.checkboxError]}>
          {checked && <Check size={14} color="#FFFFFF" strokeWidth={3} />}
        </View>
        <Text style={styles.checkboxText}>{children}</Text>
      </TouchableOpacity>
      {error ? (
        <View style={[styles.messageRow, { marginLeft: 34 }]}>
          <CircleAlert size={13} color={Colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
}

const webNoOutline = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null;

/* ────────────────────────────────────────────────────────────────────────────
 * Screen
 * ──────────────────────────────────────────────────────────────────────────── */

export default function RegisterScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { registerOwner } = useAuth();

  // Breakpoints
  const isTablet = width >= 768; // iPad / tablets (portrait)
  const isWide = width >= 1024; // iPad landscape / large tablets → side rail
  const twoColumn = width >= 600; // pair related fields side-by-side
  const isCompact = width < 380; // small phones → stack the 3 delivery fields

  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [touched, setTouched] = useState<Partial<Record<FieldKey, boolean>>>({});
  const [attempted, setAttempted] = useState<Record<number, boolean>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  const inputRefs = useRef<Partial<Record<FieldKey, TextInput | null>>>({});

  const errorFor = (key: FieldKey) => (touched[key] ? validateField(key, form) : undefined);
  const stepErrors = (s: number) => STEP_FIELDS[s].filter((k) => validateField(k, form));
  const currentStepErrorCount = attempted[step] ? stepErrors(step).length : 0;

  const setField = <K extends FieldKey>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (submitError) setSubmitError(null);
  };

  const touchFields = (keys: FieldKey[]) =>
    setTouched((prev) => keys.reduce((acc, k) => ({ ...acc, [k]: true }), { ...prev }));

  const formatInput = (key: TextKey, v: string): string => {
    switch (key) {
      case 'phoneNumber':
        return v.replace(/[^\d+\s()-]/g, '');
      case 'handlingChargesPercentage':
      case 'freeDeliveryRadius':
      case 'chargePerMile':
      case 'maxDeliveryRadius':
        return sanitizeDecimal(v);
      case 'sortCode':
        return formatSortCode(v);
      case 'accountNumber':
        return digitsOnly(v).slice(0, 8);
      case 'area':
      case 'vatNumber':
        return v.toUpperCase();
      default:
        return v;
    }
  };

  const handleBlur = (key: TextKey) => {
    touchFields([key]);
    if (key === 'area' && POSTCODE_RE.test(form.area.trim())) {
      setForm((prev) => ({ ...prev, area: formatPostcode(prev.area) }));
    }
  };

  const textOrder = STEP_FIELDS[step].filter((k) => !NON_TEXT_FIELDS.has(k)) as TextKey[];

  /** Shared props wiring a text field to form state, validation and keyboard navigation. */
  const bind = (key: TextKey) => {
    const idx = textOrder.indexOf(key);
    const isLast = idx === textOrder.length - 1;
    const nextKey = textOrder[idx + 1];
    return {
      value: form[key],
      onChangeText: (v: string) => setField(key, formatInput(key, v)),
      onBlur: () => handleBlur(key),
      error: errorFor(key),
      inputRef: (r: TextInput | null) => {
        inputRefs.current[key] = r;
      },
      returnKeyType: isLast ? ('done' as const) : ('next' as const),
      submitBehavior: isLast ? ('blurAndSubmit' as const) : ('submit' as const),
      onSubmitEditing: () => {
        if (nextKey) inputRefs.current[nextKey]?.focus();
      },
    };
  };

  const focusFirstError = (keys: FieldKey[]) => {
    const first = keys[0];
    const input = inputRefs.current[first];
    if (input) input.focus();
    // Only the consent checkboxes are non-text fields that can fail; they sit at the bottom.
    else if (NON_TEXT_FIELDS.has(first)) scrollRef.current?.scrollToEnd({ animated: true });
  };

  const goToStep = (s: number) => {
    setStep(s);
    setSubmitError(null);
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: 0, animated: false }));
  };

  const handleNext = () => {
    const bad = stepErrors(step);
    touchFields(STEP_FIELDS[step]);
    if (bad.length) {
      setAttempted((prev) => ({ ...prev, [step]: true }));
      errorFeedback();
      focusFirstError(bad);
      return;
    }
    goToStep(step + 1);
  };

  const handleBack = () => {
    if (step > 0) goToStep(step - 1);
    else router.back();
  };

  const handleSubmit = async () => {
    // Re-validate every step; jump back to the first one with problems.
    for (let s = 0; s < STEPS.length; s++) {
      const bad = stepErrors(s);
      if (bad.length) {
        touchFields(STEP_FIELDS[s]);
        setAttempted((prev) => ({ ...prev, [s]: true }));
        errorFeedback();
        if (s !== step) goToStep(s);
        else focusFirstError(bad);
        return;
      }
    }

    setLoading(true);
    setSubmitError(null);
    try {
      const t = (v: string) => v.trim();
      const uploadData = new FormData();

      uploadData.append('restaurantName', t(form.restaurantName));
      uploadData.append('ownerFullName', t(form.ownerFullName));
      uploadData.append('email', t(form.email).toLowerCase());
      uploadData.append('password', form.password);
      uploadData.append('restaurantType', form.restaurantType);
      uploadData.append('phoneNumber', normalizePhone(form.phoneNumber));
      uploadData.append('handlingChargesPercentage', Number(form.handlingChargesPercentage).toFixed(2));

      uploadData.append(
        'address',
        JSON.stringify({
          shopNo: t(form.shopNo),
          floor: t(form.floor),
          area: formatPostcode(form.area),
          city: t(form.city),
          landmark: t(form.landmark),
          coordinates: {
            type: 'Point',
            coordinates: [-0.1276, 51.5074], // Default to Central London coordinates
          },
        })
      );

      uploadData.append(
        'deliverySettings',
        JSON.stringify({
          freeDeliveryRadius: form.freeDeliveryRadius,
          chargePerMile: form.chargePerMile,
          maxDeliveryRadius: form.maxDeliveryRadius,
        })
      );

      uploadData.append(
        'gdprConsent',
        JSON.stringify({
          termsAccepted: form.termsAccepted,
          privacyAccepted: form.privacyAccepted,
          marketingConsent: false,
        })
      );

      uploadData.append('businessLicenseNumber', t(form.businessLicenseNumber));
      uploadData.append('foodHygieneCertificateNumber', t(form.foodHygieneCertificateNumber));
      uploadData.append(
        'vatNumber',
        isNotVatRegistered(form.vatNumber) ? 'N/A' : form.vatNumber.replace(/\s/g, '').toUpperCase()
      );
      uploadData.append('beneficiaryName', t(form.beneficiaryName));
      uploadData.append('sortCode', formatSortCode(form.sortCode));
      uploadData.append('accountNumber', form.accountNumber);
      uploadData.append('bankAddress', t(form.bankAddress));

      const res = await registerOwner(uploadData);
      if (res.success) {
        setSubmitted(true);
      } else {
        errorFeedback();
        setSubmitError(res.message || 'Registration failed. Please check your details and try again.');
      }
    } catch (e: any) {
      errorFeedback();
      setSubmitError(e?.message || 'An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const strength = useMemo(() => getPasswordStrength(form.password), [form.password]);

  /* ── Step content ─────────────────────────────────────────────────────── */

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <>
            <Row stack={!twoColumn}>
              <Field
                label="Full name"
                required
                icon={User}
                placeholder="John Smith"
                autoComplete="name"
                textContentType="name"
                autoCapitalize="words"
                {...bind('ownerFullName')}
              />
              <Field
                label="Phone number"
                required
                icon={Phone}
                placeholder="07123 456789"
                keyboardType="phone-pad"
                autoComplete="tel"
                textContentType="telephoneNumber"
                maxLength={18}
                {...bind('phoneNumber')}
              />
            </Row>
            <Field
              label="Email address"
              required
              icon={Mail}
              placeholder="owner@yourbusiness.co.uk"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
              hint="You’ll use this to sign in."
              {...bind('email')}
            />
            <Row stack={!twoColumn}>
              <View>
                <Field
                  label="Password"
                  required
                  icon={Lock}
                  placeholder="Min. 8 characters"
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="new-password"
                  textContentType="newPassword"
                  hint="At least 8 characters with a letter and a number."
                  rightElement={
                    <TouchableOpacity
                      onPress={() => setShowPassword((p) => !p)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      accessibilityRole="button"
                      accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? (
                        <EyeOff size={18} color={Colors.textMuted} />
                      ) : (
                        <Eye size={18} color={Colors.textMuted} />
                      )}
                    </TouchableOpacity>
                  }
                  {...bind('password')}
                />
                {form.password.length > 0 && (
                  <View style={styles.strengthWrap}>
                    <View style={styles.strengthBars}>
                      {[0, 1, 2, 3].map((i) => (
                        <View
                          key={i}
                          style={[
                            styles.strengthBar,
                            i < strength.score && { backgroundColor: strength.color },
                          ]}
                        />
                      ))}
                    </View>
                    <Text style={[styles.strengthLabel, { color: strength.color }]}>{strength.label}</Text>
                  </View>
                )}
              </View>
              <Field
                label="Confirm password"
                required
                icon={Lock}
                placeholder="Re-enter password"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="newPassword"
                {...bind('confirmPassword')}
              />
            </Row>
          </>
        );

      case 1:
        return (
          <>
            <Field
              label="Business name"
              required
              icon={Store}
              placeholder="e.g. Krifoo Grill"
              autoCapitalize="words"
              maxLength={80}
              hint="This is the name customers will see."
              {...bind('restaurantName')}
            />

            <View style={styles.field}>
              <Text style={styles.label}>
                Business type<Text style={styles.required}> *</Text>
              </Text>
              <View style={styles.typeGrid}>
                {BUSINESS_TYPES.map((type) => {
                  const active = form.restaurantType === type.value;
                  const TypeIcon = type.icon;
                  return (
                    <TouchableOpacity
                      key={type.value}
                      style={[
                        styles.typeCard,
                        { flexBasis: isTablet ? '22%' : '46%' },
                        active && styles.typeCardActive,
                      ]}
                      onPress={() => setField('restaurantType', type.value)}
                      activeOpacity={0.8}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: active }}
                    >
                      {active && (
                        <View style={styles.typeCheck}>
                          <Check size={10} color="#FFFFFF" strokeWidth={3} />
                        </View>
                      )}
                      <View style={[styles.typeIcon, active && styles.typeIconActive]}>
                        <TypeIcon size={20} color={active ? '#FFFFFF' : Colors.textMuted} />
                      </View>
                      <Text style={[styles.typeLabel, active && styles.typeLabelActive]} numberOfLines={1}>
                        {type.label}
                      </Text>
                      <Text style={styles.typeDesc} numberOfLines={1}>
                        {type.desc}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={twoColumn ? { width: '50%', paddingRight: 6 } : undefined}>
              <Field
                label="Handling charge"
                required
                suffix="%"
                placeholder="5.00"
                keyboardType="decimal-pad"
                maxLength={6}
                hint="Added to each order (0–100%)."
                {...bind('handlingChargesPercentage')}
              />
            </View>
          </>
        );

      case 2: {
        const free = Number(form.freeDeliveryRadius) || 0;
        const max = Number(form.maxDeliveryRadius) || 0;
        const rate = Number(form.chargePerMile) || 0;
        const deliveryValid =
          !validateField('freeDeliveryRadius', form) &&
          !validateField('maxDeliveryRadius', form) &&
          !validateField('chargePerMile', form);

        return (
          <>
            <SectionLabel icon={Building2}>Store address</SectionLabel>
            <Row>
              <Field label="Shop / Unit no." placeholder="Unit 1" {...bind('shopNo')} />
              <Field label="Floor" placeholder="Ground" {...bind('floor')} />
            </Row>
            <Field
              label="Street address / Landmark"
              icon={MapPin}
              placeholder="12 High Street, opposite the station"
              autoComplete="street-address"
              {...bind('landmark')}
            />
            <Row stack={isCompact}>
              <Field
                label="Postcode"
                required
                placeholder="EC1A 1BB"
                autoCapitalize="characters"
                autoCorrect={false}
                autoComplete="postal-code"
                textContentType="postalCode"
                maxLength={8}
                {...bind('area')}
              />
              <Field
                label="City"
                required
                placeholder="London"
                autoCapitalize="words"
                textContentType="addressCity"
                {...bind('city')}
              />
            </Row>

            <View style={styles.divider} />

            <SectionLabel icon={Truck}>Delivery settings</SectionLabel>
            <Row stack={isCompact}>
              <Field
                label="Free radius"
                required
                suffix="mi"
                keyboardType="decimal-pad"
                maxLength={5}
                {...bind('freeDeliveryRadius')}
              />
              <Field
                label="Charge / mile"
                required
                prefix="£"
                keyboardType="decimal-pad"
                maxLength={5}
                {...bind('chargePerMile')}
              />
              <Field
                label="Max radius"
                required
                suffix="mi"
                keyboardType="decimal-pad"
                maxLength={5}
                {...bind('maxDeliveryRadius')}
              />
            </Row>
            {deliveryValid && (
              <View style={styles.infoBox}>
                <Info size={16} color={Colors.info} />
                <Text style={styles.infoText}>
                  Free delivery within <Text style={styles.infoStrong}>{free} mi</Text>, then{' '}
                  <Text style={styles.infoStrong}>£{rate.toFixed(2)}/mi</Text> up to{' '}
                  <Text style={styles.infoStrong}>{max} mi</Text>.
                </Text>
              </View>
            )}
          </>
        );
      }

      case 3:
        return (
          <>
            <SectionLabel icon={FileCheck}>Compliance</SectionLabel>
            <Row stack={!twoColumn}>
              <Field
                label="Business licence no."
                required
                placeholder="LIC-123456"
                autoCapitalize="characters"
                autoCorrect={false}
                {...bind('businessLicenseNumber')}
              />
              <Field
                label="Food hygiene certificate no."
                required
                placeholder="HYG-789012"
                autoCapitalize="characters"
                autoCorrect={false}
                {...bind('foodHygieneCertificateNumber')}
              />
            </Row>
            <Field
              label="VAT number"
              placeholder="GB123456789"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={16}
              hint="Leave blank if you’re not VAT registered."
              {...bind('vatNumber')}
            />

            <View style={styles.divider} />

            <SectionLabel icon={CreditCard}>Payout bank account</SectionLabel>
            <Field
              label="Account holder name"
              required
              icon={User}
              placeholder="John Smith Enterprises Ltd"
              autoCapitalize="words"
              {...bind('beneficiaryName')}
            />
            <Row stack={isCompact}>
              <Field
                label="Sort code"
                required
                placeholder="20-00-00"
                keyboardType="number-pad"
                maxLength={8}
                {...bind('sortCode')}
              />
              <Field
                label="Account number"
                required
                placeholder="12345678"
                keyboardType="number-pad"
                maxLength={8}
                {...bind('accountNumber')}
              />
            </Row>
            <Field
              label="Bank branch address"
              required
              icon={Landmark}
              placeholder="1 High Street, London"
              {...bind('bankAddress')}
            />
            <View style={styles.infoBox}>
              <ShieldCheck size={16} color={Colors.info} />
              <Text style={styles.infoText}>Your bank details are used only to pay out your earnings.</Text>
            </View>

            <View style={styles.consentBox}>
              <Checkbox
                checked={form.termsAccepted}
                onToggle={() => {
                  setField('termsAccepted', !form.termsAccepted);
                  touchFields(['termsAccepted']);
                }}
                error={errorFor('termsAccepted')}
              >
                I agree to the{' '}
                <Text style={styles.link} onPress={() => router.push('/terms-conditions')}>
                  Terms of Service
                </Text>
              </Checkbox>
              <Checkbox
                checked={form.privacyAccepted}
                onToggle={() => {
                  setField('privacyAccepted', !form.privacyAccepted);
                  touchFields(['privacyAccepted']);
                }}
                error={errorFor('privacyAccepted')}
              >
                I have read the{' '}
                <Text style={styles.link} onPress={() => router.push('/privacy-policy')}>
                  Privacy Policy
                </Text>
              </Checkbox>
            </View>
          </>
        );

      default:
        return null;
    }
  };

  /* ── Steppers ─────────────────────────────────────────────────────────── */

  const stepState = (i: number) => (i < step ? 'done' : i === step ? 'active' : 'todo');

  const StepDot = ({ i }: { i: number }) => {
    const state = stepState(i);
    return (
      <View
        style={[
          styles.dot,
          state === 'active' && styles.dotActive,
          state === 'done' && styles.dotDone,
          attempted[i] && stepErrors(i).length > 0 && state !== 'active' && styles.dotError,
        ]}
      >
        {state === 'done' ? (
          <Check size={14} color="#FFFFFF" strokeWidth={3} />
        ) : (
          <Text style={[styles.dotText, state === 'active' && styles.dotTextActive]}>{i + 1}</Text>
        )}
      </View>
    );
  };

  const horizontalStepper = (
    <View style={styles.hStepper} accessibilityRole="progressbar" accessibilityLabel={`Step ${step + 1} of 4`}>
      {STEPS.map((s, i) => (
        <React.Fragment key={s.short}>
          {i > 0 && <View style={[styles.hLine, i <= step && styles.hLineActive]} />}
          <TouchableOpacity
            style={styles.hStep}
            disabled={i >= step}
            onPress={() => goToStep(i)}
            accessibilityLabel={`${s.title}${i < step ? ', completed' : ''}`}
          >
            <StepDot i={i} />
            <Text style={[styles.hLabel, stepState(i) !== 'todo' && styles.hLabelActive]} numberOfLines={1}>
              {s.short}
            </Text>
          </TouchableOpacity>
        </React.Fragment>
      ))}
    </View>
  );

  const sideRail = (
    <View style={styles.rail}>
      <View style={styles.brandBadge}>
        <Store size={18} color="#FFFFFF" />
      </View>
      <Text style={styles.railTitle}>Grow your business with Krifoo</Text>
      <Text style={styles.railSubtitle}>Complete these four steps to submit your partner application.</Text>

      <View style={styles.vStepper}>
        {STEPS.map((s, i) => (
          <TouchableOpacity
            key={s.short}
            style={styles.vStep}
            disabled={i >= step}
            onPress={() => goToStep(i)}
            activeOpacity={0.7}
          >
            <View style={styles.vDotCol}>
              <StepDot i={i} />
              {i < STEPS.length - 1 && <View style={[styles.vLine, i < step && styles.vLineActive]} />}
            </View>
            <View style={styles.vText}>
              <Text style={[styles.vTitle, stepState(i) === 'todo' && { color: Colors.textSubtle }]}>{s.title}</Text>
              <Text style={styles.vDesc} numberOfLines={2}>
                {s.desc}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.railNote}>
        <ShieldCheck size={16} color={Colors.success} />
        <Text style={styles.railNoteText}>
          Applications are reviewed by our team before your account goes live.
        </Text>
      </View>
    </View>
  );

  /* ── Success state ────────────────────────────────────────────────────── */

  if (submitted) {
    return (
      <View style={[styles.screen, styles.successScreen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={[styles.successCard, isTablet && styles.card]}>
          <View style={styles.successIcon}>
            <Check size={36} color="#FFFFFF" strokeWidth={3} />
          </View>
          <Text style={styles.successTitle}>Application submitted</Text>
          <Text style={styles.successText}>
            Thanks, {form.ownerFullName.trim().split(' ')[0]}! We’ve received the registration for{' '}
            <Text style={styles.infoStrong}>{form.restaurantName.trim()}</Text>. You’ll be able to sign in once a
            Krifoo admin has verified and approved your account.
          </Text>
          <TouchableOpacity style={[styles.primaryBtn, styles.successBtn]} onPress={() => router.replace('/login')}>
            <Text style={styles.primaryBtnText}>Back to Sign in</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  /* ── Layout ───────────────────────────────────────────────────────────── */

  const isLastStep = step === STEPS.length - 1;
  const meta = STEPS[step];
  const StepIcon = meta.icon;
  const contentMax = isTablet ? 760 : undefined;

  return (
    <View style={[styles.screen, isTablet && { backgroundColor: Colors.backgroundSecondary }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={handleBack}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel={step > 0 ? 'Previous step' : 'Go back'}
        >
          <ArrowLeft size={20} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Become a Partner</Text>
        <View style={styles.stepPill}>
          <Text style={styles.stepPillText}>
            {step + 1}/{STEPS.length}
          </Text>
        </View>
      </View>

      {/* Horizontal stepper (phones & portrait tablets) */}
      {!isWide && (
        <View style={styles.stepperBar}>
          <View style={[styles.fullWidth, contentMax ? { maxWidth: contentMax, alignSelf: 'center' } : null]}>
            {horizontalStepper}
          </View>
        </View>
      )}

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={[styles.flex, isWide && styles.bodyWide]}>
          {isWide && sideRail}

          <View style={styles.flex}>
            <ScrollView
              ref={scrollRef}
              style={styles.flex}
              contentContainerStyle={[styles.scrollContent, isTablet && styles.scrollContentTablet]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              automaticallyAdjustKeyboardInsets
            >
              <View style={[styles.fullWidth, isTablet && styles.card, contentMax ? { maxWidth: contentMax } : null]}>
                {/* Step heading */}
                <View style={styles.stepHeading}>
                  <View style={styles.stepHeadingIcon}>
                    <StepIcon size={20} color={Colors.primary} />
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.stepEyebrow}>
                      Step {step + 1} of {STEPS.length}
                    </Text>
                    <Text style={[styles.stepTitle, isTablet && { fontSize: 26 }]}>{meta.title}</Text>
                  </View>
                </View>
                <Text style={styles.stepDesc}>{meta.desc}</Text>

                {/* Error summary */}
                {currentStepErrorCount > 0 && (
                  <View style={styles.errorBanner} accessibilityLiveRegion="polite">
                    <CircleAlert size={18} color={Colors.danger} />
                    <Text style={styles.errorBannerText}>
                      Please fix {currentStepErrorCount} highlighted{' '}
                      {currentStepErrorCount === 1 ? 'field' : 'fields'} to continue.
                    </Text>
                  </View>
                )}
                {submitError && (
                  <View style={styles.errorBanner} accessibilityLiveRegion="assertive">
                    <CircleAlert size={18} color={Colors.danger} />
                    <View style={styles.flex}>
                      <Text style={[styles.errorBannerText, { fontWeight: '800' }]}>Registration failed</Text>
                      <Text style={styles.errorBannerText}>{submitError}</Text>
                    </View>
                  </View>
                )}

                {renderStep()}
              </View>

              {!isTablet && step === 0 && (
                <TouchableOpacity style={styles.signInLink} onPress={() => router.replace('/login')}>
                  <Text style={styles.signInText}>
                    Already a partner? <Text style={styles.link}>Sign in</Text>
                  </Text>
                </TouchableOpacity>
              )}
            </ScrollView>

            {/* Sticky action bar */}
            <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) + 4 }]}>
              <View style={[styles.footerInner, contentMax ? { maxWidth: contentMax } : null]}>
                {step > 0 && (
                  <TouchableOpacity style={styles.secondaryBtn} onPress={handleBack} disabled={loading}>
                    <ArrowLeft size={16} color={Colors.textMuted} />
                    <Text style={styles.secondaryBtnText}>Back</Text>
                  </TouchableOpacity>
                )}
                {isLastStep ? (
                  <TouchableOpacity
                    style={[styles.primaryBtn, styles.submitBtn, loading && styles.btnDisabled]}
                    disabled={loading}
                    onPress={handleSubmit}
                    accessibilityRole="button"
                  >
                    {loading ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <>
                        <Text style={styles.primaryBtnText}>Submit application</Text>
                        <ShieldCheck size={18} color="#FFFFFF" />
                      </>
                    )}
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={styles.primaryBtn} onPress={handleNext} accessibilityRole="button">
                    <Text style={styles.primaryBtnText}>Continue</Text>
                    <ArrowRight size={18} color="#FFFFFF" />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Styles
 * ──────────────────────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },
  fullWidth: { width: '100%' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 17, fontWeight: '800', color: Colors.text, letterSpacing: -0.3 },
  stepPill: {
    minWidth: 40,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
  },
  stepPillText: { fontSize: 12, fontWeight: '800', color: Colors.primary },

  // Horizontal stepper
  stepperBar: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  hStepper: { flexDirection: 'row', alignItems: 'flex-start' },
  hStep: { alignItems: 'center', width: 64 },
  hLine: {
    flex: 1,
    height: 2,
    marginTop: 13,
    marginHorizontal: -14,
    backgroundColor: Colors.cardBorder,
    borderRadius: 1,
  },
  hLineActive: { backgroundColor: Colors.primary },
  hLabel: { marginTop: 6, fontSize: 11, fontWeight: '700', color: Colors.textSubtle },
  hLabelActive: { color: Colors.text },

  dot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: Colors.cardBorder,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotActive: { borderColor: Colors.primary, backgroundColor: Colors.primary },
  dotDone: { borderColor: Colors.success, backgroundColor: Colors.success },
  dotError: { borderColor: Colors.danger },
  dotText: { fontSize: 12, fontWeight: '800', color: Colors.textSubtle },
  dotTextActive: { color: '#FFFFFF' },

  // Side rail (wide tablets)
  bodyWide: { flexDirection: 'row' },
  rail: {
    width: 300,
    backgroundColor: '#FFFFFF',
    borderRightWidth: 1,
    borderRightColor: Colors.cardBorder,
    paddingHorizontal: 28,
    paddingVertical: 32,
  },
  brandBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  railTitle: { fontSize: 20, fontWeight: '800', color: Colors.text, letterSpacing: -0.4 },
  railSubtitle: { fontSize: 13, color: Colors.textMuted, marginTop: 6, lineHeight: 19 },
  vStepper: { marginTop: 28 },
  vStep: { flexDirection: 'row' },
  vDotCol: { alignItems: 'center', marginRight: 14 },
  vLine: { width: 2, flex: 1, minHeight: 24, backgroundColor: Colors.cardBorder, marginVertical: 4 },
  vLineActive: { backgroundColor: Colors.success },
  vText: { flex: 1, paddingBottom: 22, paddingTop: 3 },
  vTitle: { fontSize: 14, fontWeight: '800', color: Colors.text },
  vDesc: { fontSize: 12, color: Colors.textMuted, marginTop: 3, lineHeight: 17 },
  railNote: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 'auto',
    padding: 14,
    borderRadius: 12,
    backgroundColor: Colors.statusApproved.bg,
  },
  railNoteText: { flex: 1, fontSize: 12, color: Colors.statusApproved.text, lineHeight: 17, fontWeight: '600' },

  // Scroll / card
  scrollContent: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 32 },
  scrollContentTablet: { paddingHorizontal: 32, paddingTop: 32, alignItems: 'center' },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 32,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },

  // Step heading
  stepHeading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepHeadingIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  stepTitle: { fontSize: 22, fontWeight: '800', color: Colors.text, letterSpacing: -0.5, marginTop: 1 },
  stepDesc: { fontSize: 14, color: Colors.textMuted, lineHeight: 20, marginTop: 10, marginBottom: 22 },

  // Banners
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: Colors.statusRejected.bg,
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 12,
    padding: 12,
    marginBottom: 18,
  },
  errorBannerText: { flexShrink: 1, fontSize: 13, color: Colors.statusRejected.text, lineHeight: 19 },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: Colors.statusActive.bg,
    borderRadius: 12,
    padding: 12,
    marginBottom: 18,
  },
  infoText: { flex: 1, fontSize: 13, color: Colors.statusActive.text, lineHeight: 19 },
  infoStrong: { fontWeight: '800' },

  // Sections
  sectionLabel: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  sectionLabelText: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.text,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  divider: { height: 1, backgroundColor: Colors.cardBorder, marginTop: 4, marginBottom: 22 },

  // Fields
  row: { flexDirection: 'row', gap: 12 },
  rowItem: { flex: 1, minWidth: 0 },
  field: { marginBottom: 18 },
  label: { fontSize: 13, fontWeight: '700', color: Colors.text, marginBottom: 8 },
  required: { color: Colors.primary },
  optional: { fontSize: 11, fontWeight: '600', color: Colors.textSubtle },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 52,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.cardSurface,
  },
  inputWrapFocused: { borderColor: Colors.primary, backgroundColor: '#FFFFFF' },
  inputWrapError: { borderColor: Colors.danger, backgroundColor: '#FFFBFB' },
  input: { flex: 1, minWidth: 0, height: '100%', fontSize: 15, color: Colors.text, paddingVertical: 0 },
  affix: { fontSize: 15, fontWeight: '700', color: Colors.textMuted },
  messageRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 6 },
  errorText: { flex: 1, fontSize: 12, fontWeight: '600', color: Colors.danger, lineHeight: 16 },
  hint: { fontSize: 12, color: Colors.textSubtle, marginTop: 6, lineHeight: 16 },

  // Password strength
  strengthWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: -10, marginBottom: 18 },
  strengthBars: { flex: 1, flexDirection: 'row', gap: 4 },
  strengthBar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: Colors.cardBorder },
  strengthLabel: { fontSize: 11, fontWeight: '800', minWidth: 54, textAlign: 'right' },

  // Business type cards
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  typeCard: {
    flexGrow: 1,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.cardSurface,
  },
  typeCardActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  typeCheck: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  typeIconActive: { backgroundColor: Colors.primary },
  typeLabel: { fontSize: 14, fontWeight: '800', color: Colors.text },
  typeLabelActive: { color: Colors.primaryDark },
  typeDesc: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },

  // Consent
  consentBox: {
    gap: 14,
    padding: 16,
    borderRadius: 14,
    backgroundColor: Colors.cardSurface,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', minHeight: 32 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.textSubtle,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  checkboxChecked: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  checkboxError: { borderColor: Colors.danger },
  checkboxText: { flex: 1, fontSize: 14, color: Colors.text, lineHeight: 20 },
  link: { color: Colors.primary, fontWeight: '700', textDecorationLine: 'underline' },

  signInLink: { alignItems: 'center', paddingVertical: 8 },
  signInText: { fontSize: 14, color: Colors.textMuted },

  // Footer
  footer: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: Colors.cardBorder,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  footerInner: { flexDirection: 'row', gap: 12, width: '100%', alignSelf: 'center' },
  primaryBtn: {
    flex: 2,
    height: 52,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryBtnText: { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },
  submitBtn: { backgroundColor: Colors.success },
  btnDisabled: { opacity: 0.7 },
  secondaryBtn: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.cardBorder,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  secondaryBtnText: { fontSize: 15, fontWeight: '700', color: Colors.textMuted },

  // Success
  successScreen: { alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.backgroundSecondary },
  successCard: { width: '100%', maxWidth: 520, alignItems: 'center', padding: 28 },
  successIcon: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: Colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  successTitle: { fontSize: 24, fontWeight: '800', color: Colors.text, letterSpacing: -0.5 },
  successText: {
    fontSize: 15,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    marginTop: 10,
    marginBottom: 28,
  },
  successBtn: { flex: 0, alignSelf: 'stretch' },
});

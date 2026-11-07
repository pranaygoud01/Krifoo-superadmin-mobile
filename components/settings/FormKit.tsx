/**
 * Shared form building blocks for the Settings detail screens.
 * Same look as the Settings hub (white cards, 3-grey typography, brand-orange accents).
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TextInputProps,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
  Platform,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { useNavigation } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CircleAlert, RotateCcw, Mail, Plus, Minus, X } from 'lucide-react-native';
import { Colors } from '../../constants/colors';

export type IconType = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

/* ── Layout ──────────────────────────────────────────────────────────────── */

export function useFormLayout() {
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  return { isTablet, isWide: width >= 1024, isCompact: width < 380, gutter: isTablet ? 24 : 16 };
}

/** Max-width content column used by every settings screen. */
export function FormFrame({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return <View style={[styles.frame, wide && { maxWidth: 1100 }]}>{children}</View>;
}

/* ── Section card ────────────────────────────────────────────────────────── */

export function FormSection({
  title,
  description,
  icon: Icon,
  right,
  children,
  tone,
}: {
  title: string;
  description?: string;
  icon?: IconType;
  right?: React.ReactNode;
  children?: React.ReactNode;
  tone?: 'danger';
}) {
  return (
    <View style={[styles.section, tone === 'danger' && styles.sectionDanger]}>
      <View style={styles.sectionHead}>
        {Icon ? (
          <View style={styles.sectionIcon}>
            <Icon size={18} color={Colors.primary} />
          </View>
        ) : null}
        <View style={styles.flex}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {description ? <Text style={styles.sectionDesc}>{description}</Text> : null}
        </View>
        {right}
      </View>
      {children ? <View style={styles.sectionBody}>{children}</View> : null}
    </View>
  );
}

/* ── Inputs ──────────────────────────────────────────────────────────────── */

export type FieldProps = TextInputProps & {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  prefix?: string;
  suffix?: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  containerStyle?: any;
};

export function Field({
  label,
  required,
  error,
  hint,
  prefix,
  suffix,
  leading,
  trailing,
  containerStyle,
  multiline,
  onFocus,
  onBlur,
  ...rest
}: FieldProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.field, containerStyle]}>
      <Text style={styles.label}>
        {label}
        {required ? <Text style={styles.required}> *</Text> : null}
      </Text>
      <View
        style={[
          styles.inputWrap,
          multiline && styles.inputWrapMultiline,
          focused && styles.inputFocused,
          !!error && styles.inputError,
          rest.editable === false && styles.inputDisabled,
        ]}
      >
        {leading}
        {prefix ? <Text style={styles.affix}>{prefix}</Text> : null}
        <TextInput
          style={[styles.input, multiline && styles.inputMultiline, Platform.OS === 'web' && ({ outlineStyle: 'none' } as any)]}
          placeholderTextColor={Colors.textSubtle}
          accessibilityLabel={label}
          multiline={multiline}
          textAlignVertical={multiline ? 'top' : 'center'}
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
        {trailing}
      </View>
      {error ? (
        <View style={styles.msgRow} accessibilityLiveRegion="polite">
          <CircleAlert size={12} color={Colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

/** Lays children side by side (stacked when `stack`). */
export function FieldRow({ children, stack }: { children: React.ReactNode; stack?: boolean }) {
  return (
    <View style={stack ? undefined : styles.row}>
      {React.Children.map(children, (c) => (c ? <View style={stack ? undefined : styles.rowItem}>{c}</View> : null))}
    </View>
  );
}

export function ToggleRow({
  title,
  description,
  value,
  onChange,
  disabled,
  busy,
  last,
}: {
  title: string;
  description?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  busy?: boolean;
  last?: boolean;
}) {
  return (
    <View style={[styles.toggleRow, !last && styles.toggleDivider, disabled && { opacity: 0.55 }]}>
      <View style={styles.flex}>
        <Text style={styles.toggleTitle}>{title}</Text>
        {description ? <Text style={styles.toggleDesc}>{description}</Text> : null}
      </View>
      {busy ? (
        <ActivityIndicator color={Colors.primary} style={{ width: 51 }} />
      ) : (
        <Switch
          value={value}
          onValueChange={onChange}
          disabled={disabled}
          trackColor={{ false: Colors.cardBorder, true: Colors.success }}
          thumbColor="#FFFFFF"
          ios_backgroundColor={Colors.cardBorder}
          accessibilityLabel={title}
        />
      )}
    </View>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.segment} accessibilityRole="radiogroup">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <TouchableOpacity
            key={o.value}
            style={[styles.segmentItem, active && styles.segmentItemActive]}
            onPress={() => onChange(o.value)}
            activeOpacity={0.8}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]} numberOfLines={1}>
              {o.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/* ── Stepper field (− value + with quick presets) ────────────────────────── */

export function StepperField({
  label,
  hint,
  value,
  onChange,
  step,
  min,
  max,
  decimals = 0,
  prefix,
  suffix,
  presets,
  formatPreset,
  error,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  step: number;
  min: number;
  max: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  presets?: number[];
  formatPreset?: (n: number) => string;
  error?: string;
}) {
  const current = Number(value);
  const bump = (dir: 1 | -1) => {
    const base = isNaN(current) ? min : current;
    const next = Math.min(max, Math.max(min, Math.round((base + dir * step) * 100) / 100));
    onChange(decimals ? next.toFixed(decimals) : String(Math.round(next)));
  };
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.stepperRow}>
        <TouchableOpacity
          style={[styles.stepBtn, current <= min && styles.stepBtnDisabled]}
          onPress={() => bump(-1)}
          disabled={current <= min}
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label}`}
        >
          <Minus size={18} color={Colors.text} strokeWidth={2.5} />
        </TouchableOpacity>
        <View style={[styles.stepValue, !!error && styles.inputError]}>
          {prefix ? <Text style={styles.stepAffix}>{prefix}</Text> : null}
          <TextInput
            style={[styles.stepInput, Platform.OS === 'web' && ({ outlineStyle: 'none' } as any)]}
            value={value}
            onChangeText={(v) => onChange(decimals ? sanitizeDecimal(v, decimals) : v.replace(/\D/g, ''))}
            keyboardType={decimals ? 'decimal-pad' : 'number-pad'}
            selectTextOnFocus
            maxLength={7}
            accessibilityLabel={label}
          />
          {suffix ? <Text style={styles.stepAffix}>{suffix}</Text> : null}
        </View>
        <TouchableOpacity
          style={[styles.stepBtn, current >= max && styles.stepBtnDisabled]}
          onPress={() => bump(1)}
          disabled={current >= max}
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label}`}
        >
          <Plus size={18} color={Colors.text} strokeWidth={2.5} />
        </TouchableOpacity>
      </View>
      {presets?.length ? (
        <View style={styles.presetRow}>
          {presets.map((p) => {
            const active = Number(value) === p;
            return (
              <TouchableOpacity
                key={p}
                style={[styles.preset, active && styles.presetActive]}
                onPress={() => onChange(decimals ? p.toFixed(decimals) : String(p))}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.presetText, active && styles.presetTextActive]}>
                  {formatPreset ? formatPreset(p) : String(p)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}
      {error ? (
        <View style={styles.msgRow} accessibilityLiveRegion="polite">
          <CircleAlert size={12} color={Colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

/* ── Email list editor (add / remove validated addresses) ────────────────── */

export function EmailListEditor({
  emails,
  onChange,
  label = 'Add an email address',
  placeholder = 'orders@yourbusiness.co.uk',
  emptyText = 'No addresses yet.',
}: {
  emails: string[];
  onChange: (next: string[]) => void;
  label?: string;
  placeholder?: string;
  emptyText?: string;
}) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | undefined>();

  const add = () => {
    const value = draft.trim().toLowerCase();
    if (!value) return setError('Enter an email address.');
    if (!EMAIL_RE.test(value)) return setError('Enter a valid email, e.g. orders@krifoo.co.uk.');
    if (emails.includes(value)) return setError('This address is already on the list.');
    onChange([...emails, value]);
    setDraft('');
    setError(undefined);
  };

  return (
    <View>
      <View style={styles.emailAddRow}>
        <Field
          label={label}
          placeholder={placeholder}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          value={draft}
          onChangeText={(v) => {
            setDraft(v);
            if (error) setError(undefined);
          }}
          onSubmitEditing={add}
          returnKeyType="done"
          error={error}
          containerStyle={styles.emailAddField}
        />
        <PrimaryButton label="Add" icon={Plus} onPress={add} style={styles.emailAddBtn} />
      </View>

      {emails.length === 0 ? (
        <Text style={styles.emailEmpty}>{emptyText}</Text>
      ) : (
        <View style={styles.emailList}>
          {emails.map((email) => (
            <View key={email} style={styles.emailRow}>
              <View style={styles.emailIcon}>
                <Mail size={15} color={Colors.primary} />
              </View>
              <Text style={styles.emailText} numberOfLines={1} selectable>
                {email}
              </Text>
              <TouchableOpacity
                style={styles.emailRemove}
                onPress={() => onChange(emails.filter((e) => e !== email))}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${email}`}
              >
                <X size={16} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

/* ── Notices ─────────────────────────────────────────────────────────────── */

export function Notice({
  tone = 'info',
  icon: Icon,
  title,
  children,
}: {
  tone?: 'info' | 'warning' | 'success' | 'danger';
  icon?: IconType;
  title?: string;
  children?: React.ReactNode;
}) {
  const t = NOTICE_TONES[tone];
  return (
    <View style={[styles.notice, { backgroundColor: t.bg, borderColor: t.border }]}>
      {Icon ? <Icon size={16} color={t.text} /> : null}
      <View style={styles.flex}>
        {title ? <Text style={[styles.noticeTitle, { color: t.text }]}>{title}</Text> : null}
        {typeof children === 'string' ? <Text style={[styles.noticeText, { color: t.text }]}>{children}</Text> : children}
      </View>
    </View>
  );
}

const NOTICE_TONES = {
  info: { bg: Colors.statusActive.bg, border: '#DBEAFE', text: Colors.statusActive.text },
  warning: { bg: Colors.statusPending.bg, border: '#FDE7B0', text: Colors.statusPending.text },
  success: { bg: Colors.statusApproved.bg, border: '#BBF7D0', text: Colors.statusApproved.text },
  danger: { bg: Colors.statusRejected.bg, border: '#FECACA', text: Colors.statusRejected.text },
};

/* ── Screen states ───────────────────────────────────────────────────────── */

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={Colors.primary} />
      <Text style={styles.centerText}>{label}</Text>
    </View>
  );
}

export function ErrorView({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={styles.center}>
      <View style={styles.centerIcon}>
        <CircleAlert size={28} color={Colors.danger} />
      </View>
      <Text style={styles.centerTitle}>Couldn’t load settings</Text>
      <Text style={styles.centerText}>{message}</Text>
      <TouchableOpacity style={styles.retryBtn} onPress={onRetry} accessibilityRole="button">
        <RotateCcw size={15} color="#FFFFFF" />
        <Text style={styles.retryText}>Try again</Text>
      </TouchableOpacity>
    </View>
  );
}

/* ── Buttons ─────────────────────────────────────────────────────────────── */

export function PrimaryButton({
  label,
  onPress,
  loading,
  disabled,
  icon: Icon,
  tone = 'primary',
  style,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  icon?: IconType;
  tone?: 'primary' | 'secondary' | 'danger';
  style?: any;
}) {
  const isSecondary = tone === 'secondary';
  const color = isSecondary ? Colors.text : tone === 'danger' ? Colors.danger : '#FFFFFF';
  return (
    <TouchableOpacity
      style={[
        styles.btn,
        tone === 'primary' && styles.btnPrimary,
        isSecondary && styles.btnSecondary,
        tone === 'danger' && styles.btnDanger,
        (disabled || loading) && styles.btnDisabled,
        style,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
      accessibilityRole="button"
    >
      {loading ? (
        <ActivityIndicator size="small" color={color} />
      ) : (
        <>
          {Icon ? <Icon size={16} color={color} /> : null}
          <Text style={[styles.btnText, { color }]}>{label}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

/** Small pill button used in section headers (e.g. "+ Add"). */
export function HeaderPillButton({ label, icon: Icon, onPress }: { label: string; icon?: IconType; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.pillBtn} onPress={onPress} activeOpacity={0.8} accessibilityRole="button">
      {Icon ? <Icon size={14} color={Colors.primary} /> : null}
      <Text style={styles.pillBtnText}>{label}</Text>
    </TouchableOpacity>
  );
}

/* ── Sticky save bar & unsaved-changes guard ─────────────────────────────── */

export function SaveBar({
  visible,
  saving,
  onSave,
  onDiscard,
  errorCount = 0,
  saveLabel = 'Save changes',
}: {
  visible: boolean;
  saving?: boolean;
  onSave: () => void;
  onDiscard: () => void;
  errorCount?: number;
  saveLabel?: string;
}) {
  const insets = useSafeAreaInsets();
  const { isTablet } = useFormLayout();
  if (!visible) return null;
  return (
    <View style={[styles.saveBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View style={[styles.frame, styles.saveBarInner]}>
        <View style={styles.flex}>
          <Text style={styles.saveBarTitle}>
            {errorCount ? `${errorCount} field${errorCount === 1 ? '' : 's'} to fix` : 'Unsaved changes'}
          </Text>
          {isTablet ? <Text style={styles.saveBarSub}>Save to apply your changes.</Text> : null}
        </View>
        <PrimaryButton label="Discard" tone="secondary" onPress={onDiscard} disabled={saving} />
        <PrimaryButton label={saveLabel} onPress={onSave} loading={saving} />
      </View>
    </View>
  );
}

/** Space to leave at the bottom of a scroll view so content isn't hidden behind the SaveBar. */
export const SAVE_BAR_SPACE = 110;

/** Warns before leaving the screen while `dirty` is true. */
export function useUnsavedChangesGuard(dirty: boolean) {
  const navigation = useNavigation();
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e: any) => {
      if (!dirtyRef.current) return;
      e.preventDefault();
      const leave = () => navigation.dispatch(e.data.action);
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && window.confirm('Discard unsaved changes?')) leave();
        return;
      }
      Alert.alert('Discard changes?', 'You have unsaved changes on this screen.', [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: leave },
      ]);
    });
    return unsubscribe;
  }, [navigation]);
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */

export const sanitizeDecimal = (v: string, decimals = 2) => {
  const cleaned = v.replace(/[^0-9.]/g, '');
  const [whole, ...rest] = cleaned.split('.');
  return rest.length ? `${whole}.${rest.join('').slice(0, decimals)}` : whole;
};

export const DECIMAL_RE = /^\d+(\.\d{1,2})?$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Validates a numeric string; returns an error message or undefined. */
export const numberError = (
  v: string,
  min: number,
  max: number,
  opts?: { integer?: boolean; optional?: boolean; label?: string }
) => {
  const t = v.trim();
  if (!t) return opts?.optional ? undefined : 'Required.';
  if (opts?.integer ? !/^\d+$/.test(t) : !DECIMAL_RE.test(t)) return opts?.integer ? 'Whole number only.' : 'Enter a valid number.';
  const n = Number(t);
  if (n < min || n > max) return `Must be between ${min} and ${max}.`;
  return undefined;
};

/** Shallow JSON equality for form-dirty checks. */
export const isEqualJSON = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/* ── Styles ──────────────────────────────────────────────────────────────── */

export const formStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.backgroundSecondary },
  scroll: { paddingTop: 16 },
});

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  frame: { width: '100%', maxWidth: 820, alignSelf: 'center' },

  section: {
    backgroundColor: Colors.background,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 18,
    marginBottom: 16,
  },
  sectionDanger: { borderColor: '#FECACA' },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sectionIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: Colors.text, letterSpacing: -0.2 },
  sectionDesc: { fontSize: 13, color: Colors.textMuted, marginTop: 2, lineHeight: 18 },
  sectionBody: { marginTop: 16 },

  row: { flexDirection: 'row', gap: 12 },
  rowItem: { flex: 1, minWidth: 0 },
  field: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '700', color: Colors.text, marginBottom: 7 },
  required: { color: Colors.primary },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.cardSurface,
  },
  inputWrapMultiline: { alignItems: 'flex-start', paddingVertical: 10 },
  inputFocused: { borderColor: Colors.primary, backgroundColor: Colors.background },
  inputError: { borderColor: Colors.danger, backgroundColor: '#FFFBFB' },
  inputDisabled: { opacity: 0.6 },
  input: { flex: 1, minWidth: 0, minHeight: 44, fontSize: 15, color: Colors.text, paddingVertical: 0 },
  inputMultiline: { minHeight: 84, paddingTop: 2 },
  affix: { fontSize: 15, fontWeight: '700', color: Colors.textMuted },
  msgRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 5, marginTop: 5 },
  errorText: { flex: 1, fontSize: 12, fontWeight: '600', color: Colors.danger, lineHeight: 16 },
  hint: { fontSize: 12, color: Colors.textSubtle, marginTop: 5, lineHeight: 16 },

  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 12 },
  toggleDivider: { borderBottomWidth: 1, borderBottomColor: Colors.cardBorder },
  toggleTitle: { fontSize: 15, fontWeight: '700', color: Colors.text },
  toggleDesc: { fontSize: 13, color: Colors.textMuted, marginTop: 2, lineHeight: 18 },

  segment: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 12,
    backgroundColor: Colors.cardSurface,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    marginBottom: 14,
  },
  segmentItem: { flex: 1, height: 38, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  segmentItemActive: {
    backgroundColor: Colors.background,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  segmentText: { fontSize: 13, fontWeight: '700', color: Colors.textMuted },
  segmentTextActive: { color: Colors.text },

  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepBtn: {
    width: 48,
    height: 48,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnDisabled: { opacity: 0.4 },
  stepValue: {
    flex: 1,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.cardSurface,
    paddingHorizontal: 10,
  },
  stepInput: { minWidth: 40, fontSize: 20, fontWeight: '800', color: Colors.text, textAlign: 'center', paddingVertical: 0 },
  stepAffix: { fontSize: 15, fontWeight: '700', color: Colors.textMuted },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  preset: {
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.background,
    justifyContent: 'center',
  },
  presetActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  presetText: { fontSize: 13, fontWeight: '700', color: Colors.textMuted },
  presetTextActive: { color: Colors.primaryDark },

  emailAddRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  emailAddField: { flex: 1, marginBottom: 12 },
  emailAddBtn: { marginTop: 27 },
  emailEmpty: { fontSize: 13, color: Colors.textSubtle, paddingVertical: 4 },
  emailList: { gap: 8 },
  emailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 10,
    paddingRight: 4,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.cardSurface,
  },
  emailIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emailText: { flex: 1, fontSize: 14, fontWeight: '600', color: Colors.text },
  emailRemove: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },

  notice: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 14 },
  noticeTitle: { fontSize: 13, fontWeight: '800', marginBottom: 2 },
  noticeText: { fontSize: 13, lineHeight: 18 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  centerIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.statusRejected.bg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  centerTitle: { fontSize: 18, fontWeight: '800', color: Colors.text },
  centerText: { fontSize: 14, color: Colors.textMuted, marginTop: 8, textAlign: 'center', maxWidth: 360 },
  retryBtn: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 44,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: Colors.primary,
  },
  retryText: { fontSize: 14, fontWeight: '800', color: '#FFFFFF' },

  btn: {
    height: 44,
    minWidth: 96,
    paddingHorizontal: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  btnPrimary: { backgroundColor: Colors.primary },
  btnSecondary: { backgroundColor: Colors.background, borderWidth: 1.5, borderColor: Colors.cardBorder },
  btnDanger: { backgroundColor: Colors.background, borderWidth: 1.5, borderColor: '#FECACA' },
  btnDisabled: { opacity: 0.6 },
  btnText: { fontSize: 14, fontWeight: '800' },

  pillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: Colors.primaryLight,
  },
  pillBtnText: { fontSize: 13, fontWeight: '800', color: Colors.primary },

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

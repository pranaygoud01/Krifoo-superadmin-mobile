/**
 * New restaurant update (Super Admin) — compose a service push notification to restaurant devices.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Check, Info, MessageSquare, Send, Smartphone, Store, TriangleAlert, Users, Wrench } from 'lucide-react-native';
import { Colors } from '../constants/colors';
import { useToast } from '../context/ToastContext';
import { ScreenHeader } from '../components/ScreenHeader';
import { ConfirmModal } from '../components/ConfirmModal';
import { Field, FormFrame, FormSection, PrimaryButton, ToggleRow, formStyles, useFormLayout, useUnsavedChangesGuard } from '../components/settings/FormKit';
import { SearchBar, listStyles } from '../components/ui/ListKit';
import { restaurantService } from '../services/restaurant.service';
import {
  BROADCAST_BODY_MAX,
  BROADCAST_TITLE_MAX,
  broadcastService,
  type AudienceSummary,
  type BroadcastAudience,
  type BroadcastCategory,
} from '../services/broadcast.service';
import { KEYBOARD_BEHAVIOR } from '../utils/keyboard';

interface RestaurantOption {
  _id: string;
  restaurantName: string;
  logoUrl?: string;
  isActive?: boolean;
}

const CATEGORIES: { value: BroadcastCategory; label: string; sub: string; icon: typeof Info; color: string; bg: string; emoji: string }[] = [
  { value: 'info', label: 'Info', sub: 'News, new features', icon: Info, color: '#2563EB', bg: '#EFF6FF', emoji: 'ℹ️' },
  { value: 'maintenance', label: 'Maintenance', sub: 'Planned downtime', icon: Wrench, color: '#B45309', bg: '#FFFBEB', emoji: '🛠️' },
  { value: 'important', label: 'Important', sub: 'Needs attention now', icon: TriangleAlert, color: '#DC2626', bg: '#FEF2F2', emoji: '⚠️' },
];

// Older restaurant app versions treat this text as an incoming order.
const BLOCKED_TEXT = /new\s*order/i;
const LIST_LIMIT = 40;

const initialsOf = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';

export default function NewBroadcastScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const { gutter } = useFormLayout();

  // Recipients
  const [mode, setMode] = useState<'all' | 'selected'>('all');
  const [selected, setSelected] = useState<string[]>([]);
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [restaurants, setRestaurants] = useState<RestaurantOption[]>([]);
  const [restaurantsLoading, setRestaurantsLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [reach, setReach] = useState<AudienceSummary | null>(null);
  const [reachLoading, setReachLoading] = useState(false);

  // Message
  const [category, setCategory] = useState<BroadcastCategory>('info');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [showErrors, setShowErrors] = useState(false);

  const [testing, setTesting] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useUnsavedChangesGuard(!sent && (!!title.trim() || !!body.trim()));
  useEffect(() => {
    if (sent) router.back();
  }, [sent, router]);

  useEffect(() => {
    restaurantService
      .getRestaurants({ limit: 1000 })
      .then((res) => {
        if (res.success && res.data) {
          setRestaurants(
            res.data
              .map((r: any) => ({ _id: r._id, restaurantName: r.restaurantName || 'Restaurant', logoUrl: r.logoUrl, isActive: r.isActive }))
              .sort((a: RestaurantOption, b: RestaurantOption) => a.restaurantName.localeCompare(b.restaurantName))
          );
        }
      })
      .catch(() => {})
      .finally(() => setRestaurantsLoading(false));
  }, []);

  const audience: BroadcastAudience = useMemo(() => ({ mode, restaurantIds: selected, onlyOpen }), [mode, selected, onlyOpen]);

  // Live reach (debounced)
  useEffect(() => {
    if (mode === 'selected' && selected.length === 0) {
      setReach({ restaurants: 0, restaurantsWithApp: 0, devices: 0 });
      return;
    }
    let cancelled = false;
    setReachLoading(true);
    const t = setTimeout(() => {
      broadcastService
        .audience(audience)
        .then((res) => !cancelled && res.success && setReach(res.data || null))
        .catch(() => {})
        .finally(() => !cancelled && setReachLoading(false));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [audience, mode, selected.length]);

  const q = query.trim().toLowerCase();
  const visibleRestaurants = restaurants.filter((r) => r.restaurantName.toLowerCase().includes(q));
  const toggle = (id: string) => setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const cat = CATEGORIES.find((c) => c.value === category)!;
  const errors = {
    title: !title.trim()
      ? 'Add a short title.'
      : BLOCKED_TEXT.test(title)
      ? 'Avoid the words “new order” — older restaurant apps treat it as an incoming order.'
      : undefined,
    body: !body.trim()
      ? 'Write the message restaurants will read.'
      : BLOCKED_TEXT.test(body)
      ? 'Avoid the words “new order” — older restaurant apps treat it as an incoming order.'
      : undefined,
    recipients: mode === 'selected' && selected.length === 0 ? 'Choose at least one restaurant.' : undefined,
  };
  const valid = !errors.title && !errors.body && !errors.recipients;
  const message = { title: title.trim(), body: body.trim(), category };

  const sendTest = async () => {
    if (errors.title || errors.body) {
      setShowErrors(true);
      return;
    }
    setTesting(true);
    try {
      const res = await broadcastService.test(message);
      if (!res.success) throw new Error(res.message || 'Test not sent.');
      showToast({ title: 'Test sent', message: res.message || 'Check your phone.', type: 'success' });
    } catch (e: any) {
      showToast({ title: 'Test not sent', message: e?.message || 'Please try again.', type: 'error' });
    } finally {
      setTesting(false);
    }
  };

  const requestSend = () => {
    if (!valid) {
      setShowErrors(true);
      showToast({ title: 'Check the highlighted fields', message: 'Fix them before sending.', type: 'error' });
      return;
    }
    setConfirmVisible(true);
  };

  const send = async () => {
    setConfirmVisible(false);
    setSending(true);
    try {
      const res = await broadcastService.send(message, audience);
      if (!res.success) throw new Error(res.message || 'Update not sent.');
      showToast({ title: 'Update sending', message: res.message || '', type: 'success' });
      setSent(true);
    } catch (e: any) {
      showToast({ title: 'Update not sent', message: e?.message || 'Please try again.', type: 'error' });
    } finally {
      setSending(false);
    }
  };

  const reachText = reachLoading
    ? 'Counting devices…'
    : reach
    ? reach.devices === 0
      ? `None of these ${reach.restaurants} restaurant${reach.restaurants === 1 ? '' : 's'} have the app with notifications on. It will still appear in their Krifoo updates list.`
      : `${reach.devices} device${reach.devices === 1 ? '' : 's'} at ${reach.restaurantsWithApp} of ${reach.restaurants} restaurant${reach.restaurants === 1 ? '' : 's'}`
    : '—';

  return (
    <KeyboardAvoidingView style={formStyles.screen} behavior={KEYBOARD_BEHAVIOR}>
      <ScreenHeader title="New update" subtitle="Push notification to restaurant devices" />
      <ScrollView contentContainerStyle={[formStyles.scroll, { paddingHorizontal: gutter, paddingBottom: 130 }]} keyboardShouldPersistTaps="handled">
        <FormFrame>
          {/* Recipients */}
          <FormSection icon={Users} title="Recipients" description="Restaurants using the Krifoo admin app.">
            <View style={styles.modeRow}>
              {([
                { value: 'all', label: 'All restaurants', sub: 'Everyone on Krifoo' },
                { value: 'selected', label: 'Choose restaurants', sub: 'One or more' },
              ] as const).map((m) => {
                const active = mode === m.value;
                return (
                  <TouchableOpacity
                    key={m.value}
                    style={[styles.modeCard, active && styles.modeCardActive]}
                    onPress={() => setMode(m.value)}
                    activeOpacity={0.85}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                  >
                    <View style={[styles.radio, active && styles.radioOn]}>{active ? <View style={styles.radioDot} /> : null}</View>
                    <View style={listStyles.flex}>
                      <Text style={[styles.modeTitle, active && styles.modeTitleActive]}>{m.label}</Text>
                      <Text style={styles.modeSub}>{m.sub}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {mode === 'selected' && (
              <View style={[styles.pickerBox, showErrors && errors.recipients && styles.pickerBoxError]}>
                <View style={styles.pickerHead}>
                  <Text style={styles.pickerTitle}>{selected.length} selected</Text>
                  {selected.length > 0 ? (
                    <TouchableOpacity onPress={() => setSelected([])} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Text style={styles.linkMuted}>Clear</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
                <SearchBar value={query} onChangeText={setQuery} placeholder="Search restaurants" />
                {restaurantsLoading ? (
                  <ActivityIndicator color={Colors.primary} style={{ marginVertical: 16 }} />
                ) : (
                  <>
                    {visibleRestaurants.slice(0, LIST_LIMIT).map((r, i) => {
                      const on = selected.includes(r._id);
                      return (
                        <TouchableOpacity
                          key={r._id}
                          style={[styles.restRow, i > 0 && styles.restRowBorder]}
                          onPress={() => toggle(r._id)}
                          activeOpacity={0.7}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: on }}
                        >
                          {r.logoUrl ? (
                            <Image source={{ uri: r.logoUrl }} style={styles.avatar} contentFit="cover" />
                          ) : (
                            <View style={styles.avatar}><Text style={styles.avatarText}>{initialsOf(r.restaurantName)}</Text></View>
                          )}
                          <View style={listStyles.flex}>
                            <Text style={styles.restName} numberOfLines={1}>{r.restaurantName}</Text>
                            <Text style={[styles.restStatus, r.isActive ? styles.open : null]}>{r.isActive ? 'Open for orders' : 'Closed'}</Text>
                          </View>
                          <View style={[styles.checkbox, on && styles.checkboxOn]}>{on ? <Check size={14} color="#FFFFFF" strokeWidth={3} /> : null}</View>
                        </TouchableOpacity>
                      );
                    })}
                    {visibleRestaurants.length > LIST_LIMIT ? (
                      <Text style={styles.moreText}>Showing {LIST_LIMIT} of {visibleRestaurants.length}. Search to find others.</Text>
                    ) : null}
                    {visibleRestaurants.length === 0 ? <Text style={styles.moreText}>No restaurants match.</Text> : null}
                  </>
                )}
              </View>
            )}
            {showErrors && errors.recipients ? <Text style={styles.errorText}>{errors.recipients}</Text> : null}

            <ToggleRow
              title="Only restaurants open for orders"
              description="Skip restaurants that are currently closed."
              value={onlyOpen}
              onChange={setOnlyOpen}
              last
            />

            <View style={[styles.reach, reach?.devices === 0 && !reachLoading && styles.reachWarn]}>
              <Smartphone size={18} color={reach?.devices === 0 && !reachLoading ? '#B45309' : Colors.primary} />
              <Text style={styles.reachText}>{reachText}</Text>
            </View>
          </FormSection>

          {/* Message */}
          <FormSection icon={MessageSquare} title="Message" description="Keep it short — it’s read on a lock screen.">
            <Text style={styles.label}>Type</Text>
            <View style={styles.catRow}>
              {CATEGORIES.map((c) => {
                const active = category === c.value;
                const Icon = c.icon;
                return (
                  <TouchableOpacity
                    key={c.value}
                    style={[styles.catCard, active && { borderColor: c.color, borderWidth: 2, padding: 9, backgroundColor: c.bg }]}
                    onPress={() => setCategory(c.value)}
                    activeOpacity={0.85}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                  >
                    <Icon size={18} color={c.color} />
                    <Text style={[styles.catTitle, active && { color: c.color }]}>{c.label}</Text>
                    <Text style={styles.catSub}>{c.sub}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Field
              label="Title"
              required
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Maintenance tonight 2–3am"
              maxLength={BROADCAST_TITLE_MAX}
              hint={`${title.length}/${BROADCAST_TITLE_MAX}`}
              error={showErrors ? errors.title : undefined}
            />
            <Field
              label="Message"
              required
              value={body}
              onChangeText={setBody}
              placeholder="e.g. Ordering will be paused from 2am to 3am while we upgrade our systems. No action needed."
              multiline
              maxLength={BROADCAST_BODY_MAX}
              hint={`${body.length}/${BROADCAST_BODY_MAX}`}
              error={showErrors ? errors.body : undefined}
            />
          </FormSection>

          {/* Preview */}
          <Text style={styles.previewLabel}>Preview</Text>
          <View style={styles.phone}>
            <View style={styles.notif}>
              <View style={styles.notifHead}>
                <View style={styles.appIcon}><Store size={12} color="#FFFFFF" /></View>
                <Text style={styles.appName}>Krifoo Admin</Text>
                <Text style={styles.now}>now</Text>
              </View>
              <Text style={[styles.notifTitle, !title && styles.placeholder]} numberOfLines={1}>
                {cat.emoji} {title || 'Your title'}
              </Text>
              <Text style={[styles.notifBody, !body && styles.placeholder]} numberOfLines={3}>{body || 'Your message to restaurants.'}</Text>
            </View>
          </View>
          <Text style={styles.previewNote}>Plays a normal notification sound — never the new-order alert. Also saved in each restaurant’s “Krifoo updates”.</Text>
        </FormFrame>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={styles.footerInner}>
          <PrimaryButton label="Send test to me" icon={Smartphone} tone="secondary" loading={testing} onPress={sendTest} style={styles.testBtn} />
          <PrimaryButton
            label={reach && reach.restaurants > 0 ? `Send to ${reach.restaurants} restaurant${reach.restaurants === 1 ? '' : 's'}` : 'Send update'}
            icon={Send}
            loading={sending}
            disabled={reach?.restaurants === 0}
            onPress={requestSend}
            style={styles.flex}
          />
        </View>
      </View>

      <ConfirmModal
        visible={confirmVisible}
        title="Send this update?"
        message={`“${title.trim()}” will be pushed to ${reach?.devices ?? 0} device${reach?.devices === 1 ? '' : 's'} at ${reach?.restaurants ?? 0} restaurant${reach?.restaurants === 1 ? '' : 's'}. This can’t be undone.`}
        confirmText="Send now"
        onConfirm={send}
        onClose={() => setConfirmVisible(false)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  label: { fontSize: 13, fontWeight: '700', color: Colors.text, marginBottom: 7 },

  modeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  modeCard: { flex: 1, minWidth: 150, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.cardBorder, backgroundColor: Colors.background },
  modeCardActive: { borderColor: Colors.primary, borderWidth: 2, padding: 11, backgroundColor: '#FFF7ED' },
  modeTitle: { fontSize: 14.5, fontWeight: '700', color: Colors.text },
  modeTitleActive: { color: Colors.primary },
  modeSub: { fontSize: 12, color: Colors.textMuted, marginTop: 1 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: Colors.primary },
  radioDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: Colors.primary },

  pickerBox: { borderWidth: 1, borderColor: Colors.cardBorder, borderRadius: 12, padding: 12, gap: 6, marginBottom: 8, backgroundColor: Colors.backgroundSecondary },
  pickerBoxError: { borderColor: '#DC2626' },
  pickerHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pickerTitle: { fontSize: 14, fontWeight: '800', color: Colors.text },
  linkMuted: { fontSize: 13, fontWeight: '700', color: Colors.textMuted },
  restRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 6 },
  restRowBorder: { borderTopWidth: 1, borderTopColor: '#EEF0F2' },
  avatar: { width: 36, height: 36, borderRadius: 9, backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarText: { fontSize: 13, fontWeight: '800', color: Colors.primary },
  restName: { fontSize: 14.5, fontWeight: '700', color: Colors.text },
  restStatus: { fontSize: 12, color: Colors.textMuted, marginTop: 1 },
  open: { color: '#047857' },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  checkboxOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  moreText: { fontSize: 12.5, color: Colors.textMuted, textAlign: 'center', paddingVertical: 8 },
  errorText: { fontSize: 12, fontWeight: '600', color: '#DC2626', marginBottom: 8 },

  reach: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#FED7AA' },
  reachWarn: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
  reachText: { flex: 1, fontSize: 13.5, fontWeight: '600', color: Colors.text },

  catRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  catCard: { flex: 1, minWidth: 0, gap: 4, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: Colors.cardBorder, backgroundColor: Colors.background },
  catTitle: { fontSize: 13.5, fontWeight: '700', color: Colors.text },
  catSub: { fontSize: 11.5, color: Colors.textMuted },

  previewLabel: { fontSize: 12, fontWeight: '800', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginTop: 4 },
  phone: { borderRadius: 22, padding: 14, backgroundColor: '#1E293B' },
  notif: { borderRadius: 16, padding: 12, backgroundColor: 'rgba(255,255,255,0.94)' },
  notifHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  appIcon: { width: 20, height: 20, borderRadius: 5, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  appName: { flex: 1, fontSize: 12, fontWeight: '600', color: '#475569' },
  now: { fontSize: 12, color: '#64748B' },
  notifTitle: { fontSize: 14.5, fontWeight: '800', color: '#0F172A' },
  notifBody: { fontSize: 13.5, color: '#334155', marginTop: 2, lineHeight: 19 },
  placeholder: { color: '#94A3B8' },
  previewNote: { fontSize: 12.5, color: Colors.textMuted, marginTop: 8, marginBottom: 16 },

  footer: { backgroundColor: Colors.background, borderTopWidth: 1, borderTopColor: Colors.cardBorder, paddingTop: 12, paddingHorizontal: 16 },
  footerInner: { flexDirection: 'row', gap: 10, width: '100%', maxWidth: 820, alignSelf: 'center' },
  testBtn: { minWidth: 150 },
});

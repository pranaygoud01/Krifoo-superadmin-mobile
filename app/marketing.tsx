/**
 * Marketing — announcements and promo-code offers shown to customers in the Krifoo app.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, Switch, Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Plus, Megaphone, Tag, Trash2, CalendarClock, Heart, Send } from 'lucide-react-native';
import { Colors } from '../constants/colors';
import { useToast } from '../context/ToastContext';
import { ScreenHeader } from '../components/ScreenHeader';
import { BottomSheet } from '../components/ui/BottomSheet';
import { Field, FieldRow, Segmented, Notice, PrimaryButton, sanitizeDecimal } from '../components/settings/FormKit';
import { FilterChips, Card, Badge, BadgeTone, IconAction, EmptyState, LoadError, Fab, FAB_SPACE, formatGBP, listStyles } from '../components/ui/ListKit';
import { restaurantOwnerService } from '../services/restaurant-owner.service';

interface Campaign {
  _id: string;
  title: string;
  content: string;
  announcementType: 'text' | 'image' | 'offer';
  imageUrl?: string;
  isActive: boolean;
  createdAt?: string;
  offerDetails?: {
    promoCode: string;
    discountType: 'percentage' | 'flat';
    discountValue: number;
    minOrderValue: number;
    validUntil: string;
  };
  reactions?: Record<string, number | undefined>;
}

type Filter = 'all' | 'live' | 'paused' | 'expired';
type State = 'live' | 'paused' | 'expired';

const isExpired = (c: Campaign) => {
  const until = c.offerDetails?.validUntil;
  return c.announcementType === 'offer' && !!until && new Date(until).getTime() < Date.now();
};
const stateOf = (c: Campaign): State => (isExpired(c) ? 'expired' : c.isActive ? 'live' : 'paused');
const STATE_BADGE: Record<State, { label: string; tone: BadgeTone }> = {
  live: { label: 'Live', tone: 'success' },
  paused: { label: 'Paused', tone: 'neutral' },
  expired: { label: 'Expired', tone: 'danger' },
};

const reactionTotal = (c: Campaign) => Object.values(c.reactions || {}).reduce<number>((sum, v) => sum + (Number(v) || 0), 0);

const discountText = (type: 'percentage' | 'flat', value: unknown) =>
  type === 'percentage' ? `${Number(value) || 0}% off` : `${formatGBP(value)} off`;

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/** End of the given local day, as an ISO timestamp (offers stay valid all day). */
const endOfDayIso = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59).toISOString();
const daysFromNow = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
};

const DURATIONS = [
  { value: '7', label: '1 week' },
  { value: '14', label: '2 weeks' },
  { value: '30', label: '1 month' },
  { value: '90', label: '3 months' },
];

const emptyForm = {
  type: 'text' as 'text' | 'offer',
  title: '',
  content: '',
  promoCode: '',
  discountType: 'percentage' as 'percentage' | 'flat',
  discountValue: '',
  minOrderValue: '',
  duration: '30',
};

export default function MarketingScreen() {
  const { showToast } = useToast();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [busyId, setBusyId] = useState<string | null>(null);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await restaurantOwnerService.getAnnouncements();
      if (res.success) {
        setCampaigns(res.data || []);
        setLoadError(null);
      } else {
        setLoadError(res.message || 'Please check your connection and try again.');
      }
    } catch (e: any) {
      setLoadError(e?.message || 'Please check your connection and try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Stats are computed from the campaigns themselves, so they always match the list
  const stats = useMemo(
    () => ({
      live: campaigns.filter((c) => stateOf(c) === 'live').length,
      liveOffers: campaigns.filter((c) => c.announcementType === 'offer' && stateOf(c) === 'live').length,
      reactions: campaigns.reduce((s, c) => s + reactionTotal(c), 0),
    }),
    [campaigns]
  );
  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: campaigns.length, live: 0, paused: 0, expired: 0 };
    campaigns.forEach((x) => c[stateOf(x)]++);
    return c;
  }, [campaigns]);

  const visible = useMemo(
    () =>
      campaigns
        .filter((c) => filter === 'all' || stateOf(c) === filter)
        .sort((a, b) => {
          const order = { live: 0, paused: 1, expired: 2 };
          return order[stateOf(a)] - order[stateOf(b)] || String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
        }),
    [campaigns, filter]
  );

  /* ── Create ────────────────────────────────────────────────────────── */

  const set = (key: keyof typeof emptyForm, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const openCreate = () => {
    setForm(emptyForm);
    setErrors({});
    setSheetOpen(true);
  };

  const create = async () => {
    const e: Record<string, string> = {};
    if (!form.title.trim()) e.title = 'Give it a short headline.';
    if (!form.content.trim()) e.content = 'Tell customers what it’s about.';
    let details: Campaign['offerDetails'] | undefined;
    if (form.type === 'offer') {
      const code = form.promoCode.trim().toUpperCase();
      if (!/^[A-Z0-9]{3,15}$/.test(code)) e.promoCode = '3–15 letters or numbers, no spaces.';
      else if (campaigns.some((c) => c.offerDetails?.promoCode?.toUpperCase() === code && stateOf(c) !== 'expired'))
        e.promoCode = 'This code is already in use.';
      const value = Number(form.discountValue);
      if (form.discountType === 'percentage' && !(value >= 1 && value <= 100)) e.discountValue = 'Between 1% and 100%.';
      if (form.discountType === 'flat' && !(value > 0)) e.discountValue = 'Enter an amount above £0.';
      const min = Number(form.minOrderValue || 0);
      if (isNaN(min) || min < 0) e.minOrderValue = 'Enter £0 or more.';
      else if (form.discountType === 'flat' && min > 0 && value >= min) e.minOrderValue = 'Must be more than the discount.';
      if (!e.promoCode && !e.discountValue && !e.minOrderValue) {
        details = {
          promoCode: code,
          discountType: form.discountType,
          discountValue: Math.round(value * 100) / 100,
          minOrderValue: Math.round(min * 100) / 100,
          validUntil: endOfDayIso(daysFromNow(Number(form.duration))),
        };
      }
    }
    setErrors(e);
    if (Object.keys(e).length) return;

    setSaving(true);
    try {
      const data = new FormData();
      data.append('title', form.title.trim());
      data.append('content', form.content.trim());
      data.append('announcementType', form.type);
      if (details) data.append('offerDetails', JSON.stringify(details));
      const res = await restaurantOwnerService.createAnnouncement(data);
      if (!res.success) throw new Error(res.message || 'Couldn’t publish.');
      showToast({ title: form.type === 'offer' ? 'Offer is live' : 'Announcement is live', message: 'Customers can see it in the Krifoo app.', type: 'success' });
      setSheetOpen(false);
      load();
    } catch (err: any) {
      showToast({ title: 'Couldn’t publish', message: err?.message || 'Please try again.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  /* ── Row actions ───────────────────────────────────────────────────── */

  const toggle = async (c: Campaign) => {
    setBusyId(c._id);
    setCampaigns((prev) => prev.map((x) => (x._id === c._id ? { ...x, isActive: !x.isActive } : x)));
    try {
      const res = await restaurantOwnerService.toggleAnnouncement(c._id);
      if (!res.success) throw new Error(res.message);
    } catch (e: any) {
      setCampaigns((prev) => prev.map((x) => (x._id === c._id ? { ...x, isActive: c.isActive } : x)));
      showToast({ title: 'Couldn’t update', message: e?.message || 'Please try again.', type: 'error' });
    } finally {
      setBusyId(null);
    }
  };

  const remove = (c: Campaign) => {
    Alert.alert(`Delete “${c.title}”?`, c.announcementType === 'offer' ? `The code ${c.offerDetails?.promoCode} will stop working.` : 'Customers will no longer see it.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setBusyId(c._id);
          try {
            const res = await restaurantOwnerService.deleteAnnouncement(c._id);
            if (!res.success) throw new Error(res.message);
            setCampaigns((prev) => prev.filter((x) => x._id !== c._id));
            showToast({ title: 'Deleted', message: `“${c.title}” was removed.`, type: 'info' });
          } catch (e: any) {
            showToast({ title: 'Couldn’t delete', message: e?.message || 'Please try again.', type: 'error' });
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  };

  /* ── Render ────────────────────────────────────────────────────────── */

  const renderCampaign = ({ item: c }: { item: Campaign }) => {
    const state = stateOf(c);
    const o = c.offerDetails;
    const reactions = reactionTotal(c);
    return (
      <Card muted={state !== 'live'}>
        <View style={listStyles.row}>
          <View style={[styles.typeIcon, c.announcementType === 'offer' && styles.typeIconOffer]}>
            {c.announcementType === 'offer' ? <Tag size={18} color="#7C3AED" /> : <Megaphone size={18} color={Colors.primary} />}
          </View>
          <View style={listStyles.flex}>
            <Text style={listStyles.title} numberOfLines={2}>
              {c.title}
            </Text>
            <Text style={listStyles.sub}>{c.announcementType === 'offer' ? 'Offer' : 'Announcement'}</Text>
          </View>
          <Switch
            value={c.isActive}
            onValueChange={() => toggle(c)}
            disabled={busyId === c._id || state === 'expired'}
            trackColor={{ false: Colors.cardBorder, true: Colors.success }}
            thumbColor="#FFFFFF"
            accessibilityLabel={`Show “${c.title}” to customers`}
          />
        </View>

        <Text style={styles.content}>{c.content}</Text>

        {c.announcementType === 'offer' && o ? (
          <View style={styles.coupon}>
            <View style={styles.couponCode}>
              <Text style={styles.couponCodeText}>{o.promoCode}</Text>
            </View>
            <View style={listStyles.flex}>
              <Text style={styles.couponValue}>{discountText(o.discountType, o.discountValue)}</Text>
              <Text style={styles.couponMeta}>{Number(o.minOrderValue) > 0 ? `On orders over ${formatGBP(o.minOrderValue)}` : 'No minimum order'}</Text>
            </View>
          </View>
        ) : null}

        <View style={styles.footer}>
          <Badge label={STATE_BADGE[state].label} tone={STATE_BADGE[state].tone} />
          {o?.validUntil ? (
            <View style={styles.meta}>
              <CalendarClock size={14} color={Colors.textSubtle} />
              <Text style={listStyles.meta}>{state === 'expired' ? 'Ended' : 'Ends'} {fmtDate(o.validUntil)}</Text>
            </View>
          ) : null}
          {reactions > 0 ? (
            <View style={styles.meta}>
              <Heart size={14} color={Colors.textSubtle} />
              <Text style={listStyles.meta}>{reactions}</Text>
            </View>
          ) : null}
          <View style={listStyles.flex} />
          <IconAction icon={Trash2} label={`Delete “${c.title}”`} tone="danger" onPress={() => remove(c)} busy={busyId === c._id} />
        </View>
      </Card>
    );
  };

  const previewValue = Number(form.discountValue);

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Marketing" subtitle="Announcements and offers in the Krifoo app" />

      {loading ? (
        <EmptyState icon={Megaphone} title="Loading…" />
      ) : loadError && campaigns.length === 0 ? (
        <LoadError message={loadError} onRetry={() => { setLoading(true); load(); }} />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(c) => c._id}
          renderItem={renderCampaign}
          contentContainerStyle={[styles.list, listStyles.frame]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} colors={[Colors.primary]} />}
          ListHeaderComponent={
            campaigns.length > 0 ? (
              <>
                <View style={styles.stats}>
                  <Stat value={stats.live} label="Live now" />
                  <Stat value={stats.liveOffers} label="Live offers" />
                  <Stat value={stats.reactions} label="Reactions" />
                </View>
                <FilterChips<Filter>
                  options={[
                    { value: 'all', label: 'All', count: counts.all },
                    { value: 'live', label: 'Live', count: counts.live },
                    { value: 'paused', label: 'Paused', count: counts.paused },
                    { value: 'expired', label: 'Expired', count: counts.expired },
                  ]}
                  value={filter}
                  onChange={setFilter}
                />
              </>
            ) : null
          }
          ListEmptyComponent={
            campaigns.length === 0 ? (
              <EmptyState
                icon={Megaphone}
                title="Reach your customers"
                message="Share news like new dishes or opening hours, or create a promo code to bring customers back."
                actionLabel="Create your first post"
                onAction={openCreate}
              />
            ) : (
              <EmptyState icon={Megaphone} title={`No ${filter} posts`} message="Choose another filter to see more." />
            )
          }
        />
      )}

      {campaigns.length > 0 && <Fab label="New post" icon={Plus} onPress={openCreate} />}

      <BottomSheet
        visible={sheetOpen}
        title={form.type === 'offer' ? 'New offer' : 'New announcement'}
        subtitle="Shown to customers in the Krifoo app"
        onClose={() => setSheetOpen(false)}
        footer={
          <>
            <PrimaryButton label="Cancel" tone="secondary" onPress={() => setSheetOpen(false)} style={styles.flex} />
            <PrimaryButton label="Publish" icon={Send} onPress={create} loading={saving} style={styles.flex} />
          </>
        }
      >
        <Segmented
          options={[
            { value: 'text', label: 'Announcement' },
            { value: 'offer', label: 'Offer with promo code' },
          ]}
          value={form.type}
          onChange={(v) => set('type', v)}
        />
        <Field
          label="Headline"
          required
          value={form.title}
          onChangeText={(v) => set('title', v)}
          placeholder={form.type === 'offer' ? 'e.g. 20% off this weekend' : 'e.g. New summer menu is here'}
          maxLength={60}
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

        {form.type === 'offer' && (
          <>
            <Field
              label="Promo code"
              required
              value={form.promoCode}
              onChangeText={(v) => set('promoCode', v.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              placeholder="e.g. WEEKEND20"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={15}
              error={errors.promoCode}
            />
            <Text style={styles.label}>Discount</Text>
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
            <Text style={styles.label}>Runs for</Text>
            <Segmented options={DURATIONS} value={form.duration} onChange={(v) => set('duration', v)} />
            <Notice tone="success" icon={Tag}>
              {`Customers enter ${form.promoCode || 'YOURCODE'} at checkout for ${previewValue > 0 ? discountText(form.discountType, previewValue) : 'a discount'}${
                Number(form.minOrderValue) > 0 ? ` on orders over ${formatGBP(form.minOrderValue)}` : ''
              }. Ends ${fmtDate(endOfDayIso(daysFromNow(Number(form.duration))))}.`}
            </Notice>
          </>
        )}
      </BottomSheet>
    </View>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.backgroundSecondary },
  flex: { flex: 1 },
  list: { padding: 16, paddingBottom: FAB_SPACE },
  stats: { flexDirection: 'row', gap: 10, marginBottom: 2 },
  stat: { flex: 1, backgroundColor: Colors.background, borderRadius: 14, borderWidth: 1, borderColor: Colors.cardBorder, paddingVertical: 12, alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '900', color: Colors.text },
  statLabel: { fontSize: 12, fontWeight: '600', color: Colors.textMuted, marginTop: 2 },
  typeIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  typeIconOffer: { backgroundColor: '#F3E8FF' },
  content: { fontSize: 14, color: Colors.text, lineHeight: 20, marginTop: 12 },
  coupon: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12, padding: 12, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: '#C4B5FD', backgroundColor: '#FAF5FF' },
  couponCode: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#7C3AED' },
  couponCodeText: { fontSize: 14, fontWeight: '900', color: '#FFFFFF', letterSpacing: 1 },
  couponValue: { fontSize: 15, fontWeight: '800', color: '#5B21B6' },
  couponMeta: { fontSize: 12, color: '#6D28D9', marginTop: 1 },
  footer: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.cardBorder },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  label: { fontSize: 13, fontWeight: '700', color: Colors.text, marginBottom: 7 },
});

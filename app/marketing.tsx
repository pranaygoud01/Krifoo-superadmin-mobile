/**
 * Marketing — announcements and promo-code offers shown to customers in the Krifoo app.
 * New posts are written on the full-screen page `app/create-post.tsx`.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, Switch, Alert } from 'react-native';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { Plus, Megaphone, Tag, Trash2, CalendarClock, Heart } from 'lucide-react-native';
import { Colors } from '../constants/colors';
import { useToast } from '../context/ToastContext';
import { ScreenHeader } from '../components/ScreenHeader';
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
    /** Server stores PERCENTAGE / FLAT / FREE_DELIVERY; older records may be lower case. */
    discountType: string;
    discountValue: number;
    minOrderValue: number;
    validFrom?: string | null;
    validUntil: string;
    applicableTo?: ApplyTo;
    applicableCategories?: Array<{ _id: string; categoryName?: string } | string>;
    applicableItems?: Array<{ _id: string; itemName?: string } | string>;
  };
  reactions?: Record<string, number | undefined>;
}

type Filter = 'all' | 'live' | 'scheduled' | 'paused' | 'expired';
type State = 'live' | 'scheduled' | 'paused' | 'expired';
type ApplyTo = 'ALL' | 'CATEGORY' | 'ITEMS';

const isExpired = (c: Campaign) => {
  const until = c.offerDetails?.validUntil;
  return c.announcementType === 'offer' && !!until && new Date(until).getTime() < Date.now();
};
const isScheduled = (c: Campaign) => {
  const from = c.offerDetails?.validFrom;
  return c.announcementType === 'offer' && !!from && new Date(from).getTime() > Date.now();
};
const stateOf = (c: Campaign): State =>
  isExpired(c) ? 'expired' : !c.isActive ? 'paused' : isScheduled(c) ? 'scheduled' : 'live';
const STATE_BADGE: Record<State, { label: string; tone: BadgeTone }> = {
  live: { label: 'Live', tone: 'success' },
  scheduled: { label: 'Scheduled', tone: 'info' },
  paused: { label: 'Paused', tone: 'neutral' },
  expired: { label: 'Expired', tone: 'danger' },
};

const reactionTotal = (c: Campaign) => Object.values(c.reactions || {}).reduce<number>((sum, v) => sum + (Number(v) || 0), 0);

const discountText = (type: string, value: unknown) => {
  const t = String(type || '').toLowerCase();
  if (t === 'free_delivery') return 'Free delivery';
  return t === 'percentage' ? `${Number(value) || 0}% off` : `${formatGBP(value)} off`;
};

/** "All dishes" / "Brunch, Biryani" / "Sandwich + 2 more" for an offer card. */
const appliesToText = (o: NonNullable<Campaign['offerDetails']>) => {
  const kind = String(o.applicableTo || 'ALL').toUpperCase();
  const names = (list: any[] | undefined, key: string) =>
    (list || []).map((x) => (typeof x === 'object' ? x?.[key] : null)).filter(Boolean) as string[];
  const summarise = (arr: string[], fallback: string) =>
    arr.length === 0 ? fallback : arr.length <= 2 ? arr.join(', ') : `${arr.slice(0, 2).join(', ')} + ${arr.length - 2} more`;
  if (kind === 'CATEGORY') return `Categories: ${summarise(names(o.applicableCategories, 'categoryName'), `${o.applicableCategories?.length || 0} selected`)}`;
  if (kind === 'ITEMS') return `Dishes: ${summarise(names(o.applicableItems, 'itemName'), `${o.applicableItems?.length || 0} selected`)}`;
  return 'All dishes';
};

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export default function MarketingScreen() {
  // Marketing is the restaurant owner's offers screen; super admins use Restaurant updates.
  const { user } = useAuth();
  if (user?.userType === 'super_admin') return <Redirect href="/broadcast" />;
  return <OwnerMarketingScreen />;
}

function OwnerMarketingScreen() {
  const { showToast } = useToast();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [busyId, setBusyId] = useState<string | null>(null);

  const router = useRouter();

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
    const c: Record<Filter, number> = { all: campaigns.length, live: 0, scheduled: 0, paused: 0, expired: 0 };
    campaigns.forEach((x) => c[stateOf(x)]++);
    return c;
  }, [campaigns]);

  const visible = useMemo(
    () =>
      campaigns
        .filter((c) => filter === 'all' || stateOf(c) === filter)
        .sort((a, b) => {
          const order = { live: 0, scheduled: 1, paused: 2, expired: 3 };
          return order[stateOf(a)] - order[stateOf(b)] || String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
        }),
    [campaigns, filter]
  );

  const openCreate = () => router.push('/create-post');

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
              <Text style={styles.couponMeta} numberOfLines={1}>{appliesToText(o)}</Text>
            </View>
          </View>
        ) : null}

        <View style={styles.footer}>
          <Badge label={STATE_BADGE[state].label} tone={STATE_BADGE[state].tone} />
          {o?.validUntil ? (
            <View style={styles.meta}>
              <CalendarClock size={14} color={Colors.textSubtle} />
              <Text style={listStyles.meta}>
                {state === 'scheduled' && o.validFrom ? `Starts ${fmtDate(o.validFrom)} · ` : ''}
                {state === 'expired' ? 'Ended' : 'Ends'} {fmtDate(o.validUntil)}
              </Text>
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
                    ...(counts.scheduled > 0 ? [{ value: 'scheduled' as Filter, label: 'Scheduled', count: counts.scheduled }] : []),
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
});

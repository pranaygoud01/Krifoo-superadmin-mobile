/**
 * Email campaigns (Super Admin) — campaign history and the marketing contact list.
 * New campaigns are written in `app/new-campaign.tsx`.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, Switch, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Mail, Plus, RefreshCw, Trash2, Users } from 'lucide-react-native';
import { Colors } from '../constants/colors';
import { useToast } from '../context/ToastContext';
import { ScreenHeader } from '../components/ScreenHeader';
import { ConfirmModal } from '../components/ConfirmModal';
import { SearchBar, FilterChips, Card, Badge, IconAction, EmptyState, LoadError, Fab, FAB_SPACE, listStyles } from '../components/ui/ListKit';
import {
  marketingService,
  type MarketingCampaign,
  type MarketingContact,
  type MarketingStats,
  type SubscribedFilter,
} from '../services/marketing.service';

type Tab = 'campaigns' | 'contacts';

const formatDateTime = (iso?: string) =>
  iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

const SOURCE_LABEL: Record<string, string> = { order: 'Customer', newsletter: 'Newsletter', manual: 'Added by admin', user_account: 'Account' };

export default function EmailCampaignsScreen() {
  const router = useRouter();
  const { showToast } = useToast();
  const [tab, setTab] = useState<Tab>('campaigns');
  const [stats, setStats] = useState<MarketingStats | null>(null);

  // Campaigns
  const [campaigns, setCampaigns] = useState<MarketingCampaign[]>([]);
  const [campaignsLoading, setCampaignsLoading] = useState(true);
  const [campaignsError, setCampaignsError] = useState<string | null>(null);

  // Contacts
  const [contacts, setContacts] = useState<MarketingContact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(true);
  const [contactsError, setContactsError] = useState<string | null>(null);
  const [subscribed, setSubscribed] = useState<SubscribedFilter>('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalContacts, setTotalContacts] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<MarketingContact | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const loadCampaigns = useCallback(async () => {
    try {
      const res = await marketingService.getCampaigns();
      if (!res.success) throw new Error(res.message || 'Could not load campaigns.');
      setCampaigns(res.data || []);
      setCampaignsError(null);
    } catch (err: any) {
      setCampaignsError(err?.message || 'Could not load campaigns.');
    } finally {
      setCampaignsLoading(false);
    }
  }, []);

  const contactsRequest = useRef(0);
  const loadContacts = useCallback(
    async (nextPage = 1) => {
      const id = ++contactsRequest.current;
      if (nextPage > 1) setLoadingMore(true);
      try {
        const res = await marketingService.getContacts({ page: nextPage, search, isSubscribed: subscribed });
        if (id !== contactsRequest.current) return;
        if (!res.success) throw new Error(res.message || 'Could not load contacts.');
        setContacts((prev) => (nextPage === 1 ? res.data || [] : [...prev, ...(res.data || [])]));
        setPage(res.pagination?.page || nextPage);
        setTotalPages(res.pagination?.totalPages || 1);
        setTotalContacts(res.pagination?.total || 0);
        if (res.stats) setStats(res.stats);
        setContactsError(null);
      } catch (err: any) {
        if (id === contactsRequest.current) setContactsError(err?.message || 'Could not load contacts.');
      } finally {
        if (id === contactsRequest.current) {
          setContactsLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [search, subscribed]
  );

  // Loads on focus (e.g. returning from the composer) and again whenever search / filter change
  // (loadContacts is recreated with them).
  useFocusEffect(
    useCallback(() => {
      loadCampaigns();
      loadContacts(1);
    }, [loadCampaigns, loadContacts])
  );

  // While a campaign is sending, refresh every 5s so the counts update.
  const isSending = campaigns.some((c) => c.status === 'sending');
  useEffect(() => {
    if (!isSending) return;
    const t = setInterval(() => {
      loadCampaigns();
      loadContacts(1);
    }, 5000);
    return () => clearInterval(t);
  }, [isSending, loadCampaigns, loadContacts]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadCampaigns(), loadContacts(1)]);
    setRefreshing(false);
  };

  const sync = async () => {
    setSyncing(true);
    try {
      const res = await marketingService.syncContacts();
      if (!res.success) throw new Error(res.message || 'Sync failed.');
      showToast({ title: 'Contacts synced', message: res.message || '', type: 'success' });
      await loadContacts(1);
    } catch (err: any) {
      showToast({ title: 'Sync failed', message: err?.message || 'Please try again.', type: 'error' });
    } finally {
      setSyncing(false);
    }
  };

  const toggleSubscription = async (c: MarketingContact) => {
    setBusyId(c._id);
    try {
      const res = await marketingService.toggleSubscription(c._id);
      if (!res.success) throw new Error(res.message || 'Could not update.');
      setContacts((prev) => prev.map((x) => (x._id === c._id ? { ...x, isSubscribed: !c.isSubscribed } : x)));
      setStats((prev) => (prev ? { ...prev, totalSubscribed: prev.totalSubscribed + (c.isSubscribed ? -1 : 1) } : prev));
    } catch (err: any) {
      showToast({ title: 'Not updated', message: err?.message || 'Please try again.', type: 'error' });
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = async () => {
    const c = toDelete;
    if (!c) return;
    setToDelete(null);
    setBusyId(c._id);
    try {
      const res = await marketingService.deleteContact(c._id);
      if (!res.success) throw new Error(res.message || 'Could not delete.');
      setContacts((prev) => prev.filter((x) => x._id !== c._id));
      setTotalContacts((n) => Math.max(0, n - 1));
      showToast({ title: 'Contact deleted', message: c.email, type: 'success' });
    } catch (err: any) {
      showToast({ title: 'Not deleted', message: err?.message || 'Please try again.', type: 'error' });
    } finally {
      setBusyId(null);
    }
  };

  /* ── Pieces ──────────────────────────────────────────────────────────── */

  const usedToday = stats?.sentLast24h ?? 0;
  const dailyLimit = stats?.dailyLimit ?? 0;
  const usagePct = dailyLimit > 0 ? Math.min(100, Math.round((usedToday / dailyLimit) * 100)) : 0;

  const overview = (
    <View>
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{stats?.totalSubscribed ?? '—'}</Text>
          <Text style={styles.statLabel}>Subscribed</Text>
        </View>
        <View style={[styles.statBox, styles.statWide]}>
          <Text style={styles.statLabel}>
            Sent in the last 24h: <Text style={styles.statStrong}>{usedToday}</Text> / {dailyLimit || '—'}
          </Text>
          <View style={styles.usageTrack}>
            <View style={[styles.usageFill, { width: `${usagePct}%` }, usagePct >= 90 && styles.usageFillHigh]} />
          </View>
        </View>
      </View>
      <FilterChips<Tab>
        options={[
          { value: 'campaigns', label: 'Campaigns', count: campaigns.length },
          { value: 'contacts', label: 'Contacts', count: stats?.totalContactsInDB },
        ]}
        value={tab}
        onChange={setTab}
      />
    </View>
  );

  const campaignTone = (s: MarketingCampaign['status']) => (s === 'sent' ? 'success' : s === 'failed' ? 'danger' : 'info');

  const renderCampaign = ({ item: c }: { item: MarketingCampaign }) => (
    <Card style={styles.card}>
      <View style={listStyles.row}>
        <View style={listStyles.flex}>
          <Text style={listStyles.title} numberOfLines={1}>{c.title}</Text>
          <Text style={listStyles.sub} numberOfLines={1}>“{c.subject}”</Text>
        </View>
        <Badge label={c.status === 'sending' ? 'Sending…' : c.status === 'sent' ? 'Sent' : 'Failed'} tone={campaignTone(c.status)} />
      </View>
      <Text style={[listStyles.meta, styles.cardMeta]}>
        {c.targetAudience === 'restaurant_specific' ? c.restaurantName : 'All customers'} · {formatDateTime(c.createdAt)}
        {c.sentBy?.fullName ? ` · ${c.sentBy.fullName}` : ''}
      </Text>
      <Text style={styles.cardCounts}>
        {c.status === 'sending'
          ? `Sending to ${c.recipientCount} recipients…`
          : `${c.successCount} delivered${c.failedCount ? ` · ${c.failedCount} failed` : ''} of ${c.recipientCount}`}
        {c.promoCode ? `  ·  Code ${c.promoCode}` : ''}
      </Text>
    </Card>
  );

  const renderContact = ({ item: c }: { item: MarketingContact }) => (
    <Card style={styles.card}>
      <View style={listStyles.row}>
        <View style={listStyles.flex}>
          <Text style={styles.contactName} numberOfLines={1}>{c.customerName || c.email}</Text>
          {c.customerName ? <Text style={listStyles.sub} numberOfLines={1}>{c.email}</Text> : null}
          <Text style={[listStyles.meta, styles.contactMeta]} numberOfLines={1}>
            {SOURCE_LABEL[c.source] || c.source}
            {c.totalOrders ? ` · ${c.totalOrders} ${c.totalOrders === 1 ? 'order' : 'orders'}` : ''}
            {c.restaurantName && c.source === 'order' ? ` · ${c.restaurantName}` : ''}
          </Text>
        </View>
        <View style={styles.contactActions}>
          {busyId === c._id ? (
            <ActivityIndicator color={Colors.primary} />
          ) : (
            <Switch
              value={c.isSubscribed}
              onValueChange={() => toggleSubscription(c)}
              trackColor={{ true: '#86EFAC', false: '#E2E8F0' }}
              thumbColor={c.isSubscribed ? '#16A34A' : '#FFFFFF'}
              accessibilityLabel={`${c.email} ${c.isSubscribed ? 'subscribed' : 'unsubscribed'}`}
            />
          )}
          <IconAction icon={Trash2} label={`Delete ${c.email}`} tone="danger" onPress={() => setToDelete(c)} />
        </View>
      </View>
    </Card>
  );

  const contactsHeader = (
    <View>
      {overview}
      <SearchBar value={searchInput} onChangeText={setSearchInput} placeholder="Search name, email or phone" />
      <FilterChips<SubscribedFilter>
        options={[
          { value: 'all', label: 'All' },
          { value: 'true', label: 'Subscribed' },
          { value: 'false', label: 'Unsubscribed' },
        ]}
        value={subscribed}
        onChange={setSubscribed}
      />
      <View style={styles.syncRow}>
        <Text style={listStyles.meta}>{totalContacts} contacts</Text>
        <TouchableOpacity onPress={sync} disabled={syncing} style={styles.syncBtn} activeOpacity={0.7}>
          {syncing ? <ActivityIndicator size="small" color={Colors.primary} /> : <RefreshCw size={15} color={Colors.primary} />}
          <Text style={styles.syncText}>{syncing ? 'Syncing…' : 'Sync from orders'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const refreshControl = <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} colors={[Colors.primary]} />;

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Email campaigns" subtitle="Offers sent to customers by email" />

      {tab === 'campaigns' ? (
        campaignsLoading ? (
          <View style={styles.center}><ActivityIndicator color={Colors.primary} /></View>
        ) : campaignsError && campaigns.length === 0 ? (
          <LoadError message={campaignsError} onRetry={() => { setCampaignsLoading(true); loadCampaigns(); }} />
        ) : (
          <FlatList
            data={campaigns}
            keyExtractor={(c) => c._id}
            renderItem={renderCampaign}
            ListHeaderComponent={overview}
            ListEmptyComponent={
              <EmptyState
                icon={Mail}
                title="No campaigns yet"
                message="Send your first offer to subscribed customers."
                actionLabel="New campaign"
                onAction={() => router.push('/new-campaign')}
              />
            }
            contentContainerStyle={[styles.list, listStyles.frame, { paddingBottom: FAB_SPACE }]}
            refreshControl={refreshControl}
          />
        )
      ) : contactsLoading && contacts.length === 0 ? (
        <View style={styles.center}><ActivityIndicator color={Colors.primary} /></View>
      ) : contactsError && contacts.length === 0 ? (
        <LoadError message={contactsError} onRetry={() => { setContactsLoading(true); loadContacts(1); }} />
      ) : (
        <FlatList
          data={contacts}
          keyExtractor={(c) => c._id}
          renderItem={renderContact}
          ListHeaderComponent={contactsHeader}
          ListEmptyComponent={
            <EmptyState
              icon={Users}
              title={search || subscribed !== 'all' ? 'No matching contacts' : 'No contacts yet'}
              message={search || subscribed !== 'all' ? 'Try another search or filter.' : 'Tap “Sync from orders” to import customers from past orders.'}
            />
          }
          ListFooterComponent={loadingMore ? <ActivityIndicator style={{ marginVertical: 16 }} color={Colors.primary} /> : null}
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (!loadingMore && page < totalPages) loadContacts(page + 1);
          }}
          contentContainerStyle={[styles.list, listStyles.frame, { paddingBottom: FAB_SPACE }]}
          refreshControl={refreshControl}
          keyboardShouldPersistTaps="handled"
        />
      )}

      <Fab label="New campaign" icon={Plus} onPress={() => router.push('/new-campaign')} />

      <ConfirmModal
        visible={!!toDelete}
        title="Delete contact?"
        message={`${toDelete?.email || ''} will be removed. If they have past orders, "Sync from orders" will add them back — to stop emails, turn off their subscription instead.`}
        confirmText="Delete"
        isDestructive
        onConfirm={confirmDelete}
        onClose={() => setToDelete(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: 16, paddingTop: 12 },

  statsRow: { flexDirection: 'row', gap: 10 },
  statBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    paddingHorizontal: 14,
    paddingVertical: 12,
    justifyContent: 'center',
  },
  statWide: { flex: 1 },
  statValue: { fontSize: 22, fontWeight: '800', color: Colors.text, fontVariant: ['tabular-nums'] },
  statLabel: { fontSize: 13, color: Colors.textMuted, fontWeight: '600' },
  statStrong: { color: Colors.text, fontWeight: '800' },
  usageTrack: { height: 6, borderRadius: 3, backgroundColor: '#F1F3F5', marginTop: 8, overflow: 'hidden' },
  usageFill: { height: 6, borderRadius: 3, backgroundColor: Colors.primary },
  usageFillHigh: { backgroundColor: '#DC2626' },

  card: { marginBottom: 10 },
  cardMeta: { marginTop: 8 },
  cardCounts: { fontSize: 13.5, fontWeight: '600', color: Colors.text, marginTop: 4 },

  contactName: { fontSize: 15, fontWeight: '700', color: Colors.text },
  contactMeta: { marginTop: 4 },
  contactActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },

  syncRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  syncBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: 4 },
  syncText: { fontSize: 13.5, fontWeight: '700', color: Colors.primary },
});

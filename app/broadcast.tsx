/**
 * Restaurant updates (Super Admin) — service push notifications sent to restaurant devices.
 * New updates are written in `app/new-broadcast.tsx`.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { BellRing, Info, Plus, TriangleAlert, Wrench } from 'lucide-react-native';
import { Colors } from '../constants/colors';
import { ScreenHeader } from '../components/ScreenHeader';
import { Badge, Card, EmptyState, Fab, FAB_SPACE, FilterChips, LoadError, listStyles } from '../components/ui/ListKit';
import { broadcastService, type AudienceSummary, type Broadcast } from '../services/broadcast.service';

type Filter = 'all' | 'sent' | 'failed';

const CATEGORY = {
  info: { label: 'Info', icon: Info, color: '#2563EB', bg: '#EFF6FF' },
  important: { label: 'Important', icon: TriangleAlert, color: '#DC2626', bg: '#FEF2F2' },
  maintenance: { label: 'Maintenance', icon: Wrench, color: '#B45309', bg: '#FFFBEB' },
} as const;

const formatDateTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

export default function BroadcastScreen() {
  const router = useRouter();
  const [items, setItems] = useState<Broadcast[]>([]);
  const [reach, setReach] = useState<AudienceSummary | null>(null);
  const [meta, setMeta] = useState<{ sentToday: number; dailyLimit: number } | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [listRes, reachRes] = await Promise.all([
        broadcastService.list(),
        broadcastService.audience({ mode: 'all', restaurantIds: [], onlyOpen: false }).catch(() => null),
      ]);
      if (!listRes.success) throw new Error(listRes.message || 'Could not load updates.');
      setItems(listRes.data || []);
      setMeta(listRes.meta || null);
      if (reachRes?.success && reachRes.data) setReach(reachRes.data);
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'Could not load updates.');
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

  // Refresh while an update is still sending so the counts fill in.
  const sending = items.some((b) => b.status === 'sending');
  useEffect(() => {
    if (!sending) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [sending, load]);

  const visible = items.filter((b) => filter === 'all' || (filter === 'sent' ? b.status !== 'failed' : b.status === 'failed'));

  const renderItem = ({ item: b }: { item: Broadcast }) => {
    const c = CATEGORY[b.category] || CATEGORY.info;
    const Icon = c.icon;
    const who =
      b.audience?.mode === 'selected'
        ? `${b.recipientRestaurants} chosen restaurant${b.recipientRestaurants === 1 ? '' : 's'}`
        : `All restaurants${b.audience?.onlyOpen ? ' (open)' : ''} · ${b.recipientRestaurants}`;
    return (
      <Card style={styles.card}>
        <View style={listStyles.row}>
          <View style={[styles.icon, { backgroundColor: c.bg }]}>
            <Icon size={18} color={c.color} />
          </View>
          <View style={listStyles.flex}>
            <Text style={listStyles.title} numberOfLines={1}>{b.title}</Text>
            <Text style={listStyles.sub} numberOfLines={2}>{b.body}</Text>
          </View>
          <Badge
            label={b.status === 'sending' ? 'Sending…' : b.status === 'sent' ? 'Sent' : 'Failed'}
            tone={b.status === 'sent' ? 'success' : b.status === 'failed' ? 'danger' : 'info'}
          />
        </View>
        <Text style={[listStyles.meta, styles.meta]}>
          {who} · {formatDateTime(b.sentAt || b.createdAt)}
          {b.createdBy?.fullName ? ` · ${b.createdBy.fullName}` : ''}
        </Text>
        {b.status !== 'sending' ? (
          <Text style={styles.counts}>
            {b.deviceCount === 0
              ? 'No devices — shown in their Krifoo updates list only'
              : `${b.deliveredCount} delivered${b.failedCount ? ` · ${b.failedCount} failed` : ''} of ${b.deviceCount} devices`}
          </Text>
        ) : null}
      </Card>
    );
  };

  const header = (
    <View>
      <View style={styles.stats}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{reach ? reach.restaurantsWithApp : '—'}</Text>
          <Text style={styles.statLabel}>Restaurants with the app</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{reach ? reach.devices : '—'}</Text>
          <Text style={styles.statLabel}>Devices reachable</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{meta ? `${meta.sentToday}/${meta.dailyLimit}` : '—'}</Text>
          <Text style={styles.statLabel}>Sent today</Text>
        </View>
      </View>
      <FilterChips<Filter>
        options={[
          { value: 'all', label: 'All', count: items.length },
          { value: 'sent', label: 'Sent' },
          { value: 'failed', label: 'Failed' },
        ]}
        value={filter}
        onChange={setFilter}
      />
    </View>
  );

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Restaurant updates" subtitle="Push notifications to restaurant devices" />
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={Colors.primary} /></View>
      ) : error && items.length === 0 ? (
        <LoadError message={error} onRetry={() => { setLoading(true); load(); }} />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(b) => b._id}
          renderItem={renderItem}
          ListHeaderComponent={header}
          ListEmptyComponent={
            <EmptyState
              icon={BellRing}
              title="No updates sent yet"
              message="Let restaurants know about maintenance, new features or payout changes."
              actionLabel="New update"
              onAction={() => router.push('/new-broadcast')}
            />
          }
          contentContainerStyle={[styles.list, listStyles.frame, { paddingBottom: FAB_SPACE }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} colors={[Colors.primary]} />}
        />
      )}
      <Fab label="New update" icon={Plus} onPress={() => router.push('/new-broadcast')} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.backgroundSecondary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 16 },
  stats: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  stat: { flex: 1, backgroundColor: Colors.background, borderRadius: 12, borderWidth: 1, borderColor: Colors.cardBorder, paddingVertical: 12, paddingHorizontal: 10 },
  statValue: { fontSize: 20, fontWeight: '800', color: Colors.text, fontVariant: ['tabular-nums'] },
  statLabel: { fontSize: 12, fontWeight: '600', color: Colors.textMuted, marginTop: 2 },
  card: { marginBottom: 10 },
  icon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  meta: { marginTop: 10 },
  counts: { fontSize: 13.5, fontWeight: '600', color: Colors.text, marginTop: 4 },
});

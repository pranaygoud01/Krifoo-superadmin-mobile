/**
 * Krifoo updates (restaurant owner) — service messages from Krifoo, e.g. maintenance or new
 * features. Opening the screen marks them as read. Also opened by tapping the push notification.
 */
import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator, DeviceEventEmitter } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Info, TriangleAlert, Wrench, BellRing } from 'lucide-react-native';
import { Colors } from '../constants/colors';
import { ScreenHeader } from '../components/ScreenHeader';
import { EmptyState, LoadError, listStyles } from '../components/ui/ListKit';
import { restaurantOwnerService, type RestaurantUpdate } from '../services/restaurant-owner.service';
import { NOTIFICATIONS_BADGE_EVENT } from '../services/notification-tracker.service';

const CATEGORY = {
  info: { label: 'Info', icon: Info, color: '#2563EB', bg: '#EFF6FF' },
  important: { label: 'Important', icon: TriangleAlert, color: '#DC2626', bg: '#FEF2F2' },
  maintenance: { label: 'Maintenance', icon: Wrench, color: '#B45309', bg: '#FFFBEB' },
} as const;

const formatWhen = (iso: string) => {
  const d = new Date(iso);
  const diffMin = Math.round((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffMin < 24 * 60) return `${Math.round(diffMin / 60)} h ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

export default function UpdatesScreen() {
  const [updates, setUpdates] = useState<RestaurantUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await restaurantOwnerService.getUpdates();
      if (!res.success) throw new Error(res.message || 'Could not load updates.');
      setUpdates(res.data || []);
      setError(null);
      if ((res.unreadCount || 0) > 0) {
        // Viewing the list marks everything read; keep the "new" highlight for this visit.
        restaurantOwnerService
          .markUpdatesRead()
          .then(() => DeviceEventEmitter.emit(NOTIFICATIONS_BADGE_EVENT))
          .catch(() => {});
      }
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

  const renderItem = ({ item }: { item: RestaurantUpdate }) => {
    const c = CATEGORY[item.category] || CATEGORY.info;
    const Icon = c.icon;
    return (
      <View style={[styles.card, !item.isRead && styles.cardUnread]}>
        <View style={[styles.icon, { backgroundColor: c.bg }]}>
          <Icon size={18} color={c.color} />
        </View>
        <View style={listStyles.flex}>
          <View style={styles.metaRow}>
            <Text style={[styles.category, { color: c.color }]}>{c.label}</Text>
            <Text style={styles.when}>{formatWhen(item.createdAt)}</Text>
            {!item.isRead ? <View style={styles.newDot} /> : null}
          </View>
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.body}>{item.body}</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Krifoo updates" subtitle="Service messages from the Krifoo team" />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      ) : error && updates.length === 0 ? (
        <LoadError message={error} onRetry={() => { setLoading(true); load(); }} />
      ) : (
        <FlatList
          data={updates}
          keyExtractor={(u) => u._id}
          renderItem={renderItem}
          contentContainerStyle={[styles.list, listStyles.frame]}
          ListEmptyComponent={
            <EmptyState icon={BellRing} title="No updates yet" message="Messages from Krifoo about maintenance and new features will appear here." />
          }
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} colors={[Colors.primary]} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.backgroundSecondary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 16, gap: 10 },
  card: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: Colors.background,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 14,
  },
  cardUnread: { borderColor: '#FDBA74', backgroundColor: '#FFFBF7' },
  icon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  category: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  when: { fontSize: 12, color: Colors.textMuted },
  newDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.primary },
  title: { fontSize: 15.5, fontWeight: '800', color: Colors.text, marginTop: 4 },
  body: { fontSize: 14, color: Colors.text, lineHeight: 20, marginTop: 4 },
});

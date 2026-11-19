import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { BellRing, ChevronRight } from 'lucide-react-native';
import { Colors } from '../constants/colors';
import { useAuth } from '../context/AuthContext';
import { restaurantOwnerService } from '../services/restaurant-owner.service';

/** "Krifoo updates" row at the top of the notification feed (restaurant owners only). */
export function KrifooUpdatesEntry() {
  const router = useRouter();
  const { user } = useAuth();
  const isOwner = user?.userType !== 'super_admin';
  const [unread, setUnread] = useState(0);
  const [latest, setLatest] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!isOwner) return;
      restaurantOwnerService
        .getUpdates()
        .then((res) => {
          if (!res.success) return;
          setUnread(res.unreadCount || 0);
          setLatest(res.data?.[0]?.title || null);
        })
        .catch(() => {});
    }, [isOwner])
  );

  if (!isOwner) return null;

  return (
    <TouchableOpacity style={styles.row} onPress={() => router.push('/updates')} activeOpacity={0.8} accessibilityRole="button">
      <View style={styles.icon}>
        <BellRing size={18} color={Colors.primary} />
      </View>
      <View style={styles.text}>
        <Text style={styles.title}>Krifoo updates</Text>
        <Text style={styles.sub} numberOfLines={1}>{latest || 'Service messages from the Krifoo team'}</Text>
      </View>
      {unread > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{unread > 9 ? '9+' : unread} new</Text>
        </View>
      ) : null}
      <ChevronRight size={18} color={Colors.textMuted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.background,
  },
  icon: { width: 38, height: 38, borderRadius: 11, backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, minWidth: 0 },
  title: { fontSize: 15, fontWeight: '800', color: Colors.text },
  sub: { fontSize: 13, color: Colors.textMuted, marginTop: 2 },
  badge: { backgroundColor: Colors.primary, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 12, fontWeight: '800', color: '#FFFFFF' },
});

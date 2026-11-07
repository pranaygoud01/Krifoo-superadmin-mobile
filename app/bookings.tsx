/**
 * Table reservations — what's coming up today and next, grouped by day.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, SectionList, RefreshControl, Alert, Linking, TouchableOpacity } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { CalendarCheck, Users, Phone, MessageSquare, Check, X, Unlock, CircleCheck, Clock3, Ban } from 'lucide-react-native';
import { Colors } from '../constants/colors';
import { useToast } from '../context/ToastContext';
import { ScreenHeader } from '../components/ScreenHeader';
import { SearchBar, FilterChips, Card, Badge, BadgeTone, EmptyState, LoadError, TextAction, formatGBP, initials, listStyles } from '../components/ui/ListKit';
import { restaurantOwnerService } from '../services/restaurant-owner.service';

interface Booking {
  _id: string;
  bookingNumber?: string;
  customerName?: string;
  customerPhone?: string;
  customerId?: { _id?: string; fullName?: string; email?: string; phoneNumber?: string } | string;
  numberOfGuests?: number;
  guests?: number;
  bookingDate: string;
  bookingTime?: string;
  bookedSlots?: string[];
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'cancelled_by_user' | 'cancelled_by_owner' | 'expired';
  tableId?: { _id?: string; tableNumber: string; capacity?: number; area?: string } | string;
  paymentDetails?: { paymentStatus?: 'pending' | 'paid' | 'refunded' | 'failed'; bookingFee?: number };
  specialRequests?: string;
  createdAt?: string;
}

type Filter = 'today' | 'upcoming' | 'pending' | 'past' | 'cancelled' | 'all';

const CANCELLED = ['cancelled', 'cancelled_by_user', 'cancelled_by_owner', 'expired'];
const isCancelled = (b: Booking) => CANCELLED.includes(b.status);
const isOpen = (b: Booking) => b.status === 'pending' || b.status === 'confirmed';

const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const bookingDay = (b: Booking) => (/^\d{4}-\d{2}-\d{2}/.test(b.bookingDate || '') ? b.bookingDate.slice(0, 10) : b.bookingDate ? isoDay(new Date(b.bookingDate)) : '');
const sortedSlots = (b: Booking) => (b.bookedSlots?.length ? [...b.bookedSlots].sort() : b.bookingTime ? [b.bookingTime] : []);
const startTime = (b: Booking) => sortedSlots(b)[0] || '';

function timeRange(b: Booking): string {
  const slots = sortedSlots(b);
  if (!slots.length) return 'Time not set';
  const end = parseInt(slots[slots.length - 1], 10) + 1;
  return `${slots[0]}–${String(end).padStart(2, '0')}:00`;
}

function dayTitle(iso: string, today: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (iso === today) return 'Today';
  if (iso === isoDay(tomorrow)) return 'Tomorrow';
  return date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

const customerName = (b: Booking) => b.customerName || (typeof b.customerId === 'object' ? b.customerId?.fullName : '') || 'Guest';
const customerPhone = (b: Booking) => b.customerPhone || (typeof b.customerId === 'object' ? b.customerId?.phoneNumber : '') || '';
const tableInfo = (b: Booking) => (typeof b.tableId === 'object' ? b.tableId : null);

const STATUS: Record<string, { label: string; tone: BadgeTone; icon: any }> = {
  pending: { label: 'Awaiting payment', tone: 'warning', icon: Clock3 },
  confirmed: { label: 'Confirmed', tone: 'success', icon: CircleCheck },
  completed: { label: 'Completed', tone: 'info', icon: Check },
  cancelled: { label: 'Cancelled', tone: 'danger', icon: Ban },
  cancelled_by_user: { label: 'Cancelled by guest', tone: 'danger', icon: Ban },
  cancelled_by_owner: { label: 'Cancelled by you', tone: 'danger', icon: Ban },
  expired: { label: 'Expired', tone: 'neutral', icon: Ban },
};

export default function BookingsScreen() {
  const { showToast } = useToast();
  const today = isoDay(new Date());

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('today');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await restaurantOwnerService.getBookings();
      if (res.success) {
        setBookings(res.data || []);
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

  const matches = useCallback(
    (b: Booking, f: Filter) => {
      const day = bookingDay(b);
      switch (f) {
        case 'today':
          return day === today && !isCancelled(b);
        case 'upcoming':
          return day >= today && isOpen(b);
        case 'pending':
          return b.status === 'pending';
        case 'past':
          return (day < today && !isCancelled(b)) || b.status === 'completed';
        case 'cancelled':
          return isCancelled(b);
        default:
          return true;
      }
    },
    [today]
  );

  const counts = useMemo(() => {
    const c = {} as Record<Filter, number>;
    (['today', 'upcoming', 'pending', 'past', 'cancelled', 'all'] as Filter[]).forEach((f) => (c[f] = bookings.filter((b) => matches(b, f)).length));
    return c;
  }, [bookings, matches]);

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = bookings.filter((b) => {
      if (!matches(b, filter)) return false;
      if (!q) return true;
      const t = tableInfo(b);
      return `${b.bookingNumber || b._id} ${customerName(b)} ${customerPhone(b)} ${t?.tableNumber || ''}`.toLowerCase().includes(q);
    });
    const newestFirst = filter === 'past' || filter === 'cancelled' || filter === 'all';
    list.sort((a, b) => {
      const k = `${bookingDay(a)} ${startTime(a)}`.localeCompare(`${bookingDay(b)} ${startTime(b)}`);
      return newestFirst ? -k : k;
    });
    const groups = new Map<string, Booking[]>();
    list.forEach((b) => {
      const d = bookingDay(b);
      groups.set(d, [...(groups.get(d) || []), b]);
    });
    return Array.from(groups.entries()).map(([day, data]) => ({ title: dayTitle(day, today), data }));
  }, [bookings, filter, query, matches, today]);

  /* ── Actions ───────────────────────────────────────────────────────── */

  const run = async (b: Booking, action: () => Promise<{ success: boolean; message?: string }>, done: string, nextStatus: Booking['status']) => {
    setBusy(b._id);
    try {
      const res = await action();
      if (!res.success) throw new Error(res.message);
      setBookings((prev) => prev.map((x) => (x._id === b._id ? { ...x, status: nextStatus } : x)));
      showToast({ title: done, message: `${customerName(b)} · ${timeRange(b)}`, type: 'success' });
    } catch (e: any) {
      showToast({ title: 'Couldn’t update reservation', message: e?.message || 'Please try again.', type: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const complete = (b: Booking) => run(b, () => restaurantOwnerService.completeBooking(b._id), 'Marked as completed', 'completed');

  const cancel = (b: Booking) => {
    const paid = b.paymentDetails?.paymentStatus === 'paid' && Number(b.paymentDetails?.bookingFee) > 0;
    Alert.alert(
      'Cancel this reservation?',
      `${customerName(b)}, ${dayTitle(bookingDay(b), today)} at ${timeRange(b)}.${paid ? `\n\nThe guest paid a ${formatGBP(b.paymentDetails?.bookingFee)} deposit — check whether it needs refunding.` : ''}`,
      [
        { text: 'Keep it', style: 'cancel' },
        { text: 'Cancel reservation', style: 'destructive', onPress: () => run(b, () => restaurantOwnerService.cancelBooking(b._id), 'Reservation cancelled', 'cancelled_by_owner') },
      ]
    );
  };

  const release = (b: Booking) => {
    Alert.alert(
      'Release this table?',
      'The guest hasn’t finished paying. Releasing cancels the hold so other guests can book this time.',
      [
        { text: 'Keep holding', style: 'cancel' },
        { text: 'Release', style: 'destructive', onPress: () => run(b, () => restaurantOwnerService.expireBooking(b._id), 'Table released', 'expired') },
      ]
    );
  };

  /* ── Render ────────────────────────────────────────────────────────── */

  const renderBooking = ({ item: b }: { item: Booking }) => {
    const t = tableInfo(b);
    const guests = b.guests ?? b.numberOfGuests ?? 1;
    const phone = customerPhone(b);
    const fee = Number(b.paymentDetails?.bookingFee || 0);
    const payStatus = b.paymentDetails?.paymentStatus;
    const status = STATUS[b.status] || STATUS.confirmed;
    const isBusy = busy === b._id;

    return (
      <Card muted={isCancelled(b)}>
        <View style={listStyles.row}>
          <View style={styles.timeBox}>
            <Text style={styles.timeStart}>{startTime(b) || '--:--'}</Text>
            <Text style={styles.timeRange}>{timeRange(b).split('–')[1] ? `to ${timeRange(b).split('–')[1]}` : ''}</Text>
          </View>
          <View style={listStyles.flex}>
            <Text style={listStyles.title} numberOfLines={1}>
              {customerName(b)}
            </Text>
            <View style={styles.inline}>
              <Users size={13} color={Colors.textSubtle} />
              <Text style={listStyles.meta}>
                {guests} guest{guests === 1 ? '' : 's'}
                {t ? ` · Table ${t.tableNumber}${t.area ? ` (${t.area})` : ''}` : ''}
              </Text>
            </View>
          </View>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials(customerName(b))}</Text>
          </View>
        </View>

        <View style={[styles.badges]}>
          <Badge label={status.label} tone={status.tone} icon={status.icon} />
          {fee > 0 ? (
            <Badge
              label={payStatus === 'paid' ? `${formatGBP(fee)} paid` : payStatus === 'refunded' ? `${formatGBP(fee)} refunded` : `${formatGBP(fee)} unpaid`}
              tone={payStatus === 'paid' ? 'success' : payStatus === 'refunded' ? 'info' : 'warning'}
            />
          ) : (
            <Badge label="Free booking" tone="neutral" />
          )}
          <Text style={styles.ref}>#{(b.bookingNumber || b._id.slice(-6)).toUpperCase()}</Text>
        </View>

        {b.specialRequests ? (
          <View style={styles.note}>
            <MessageSquare size={14} color={Colors.statusPending.text} />
            <Text style={styles.noteText}>{b.specialRequests}</Text>
          </View>
        ) : null}

        {(phone || isOpen(b)) && (
          <View style={styles.actions}>
            {phone ? (
              <TouchableOpacity style={styles.phone} onPress={() => Linking.openURL(`tel:${phone.replace(/\s/g, '')}`)} accessibilityRole="button" accessibilityLabel={`Call ${customerName(b)}`}>
                <Phone size={14} color={Colors.primary} />
                <Text style={styles.phoneText}>{phone}</Text>
              </TouchableOpacity>
            ) : (
              <View style={listStyles.flex} />
            )}
            {b.status === 'pending' && <TextAction label="Release" icon={Unlock} tone="danger" onPress={() => release(b)} busy={isBusy} />}
            {b.status === 'confirmed' && (
              <>
                <TextAction label="Cancel" icon={X} tone="danger" onPress={() => cancel(b)} disabled={isBusy} />
                <TextAction label="Completed" icon={Check} tone="primary" onPress={() => complete(b)} busy={isBusy} />
              </>
            )}
          </View>
        )}
      </Card>
    );
  };

  const emptyText: Record<Filter, string> = {
    today: 'No reservations for today.',
    upcoming: 'No upcoming reservations.',
    pending: 'No reservations are waiting for payment.',
    past: 'No past reservations yet.',
    cancelled: 'No cancelled reservations.',
    all: 'Reservations made in the Krifoo app appear here.',
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="Reservations"
        subtitle={`${counts.today || 0} today · ${counts.upcoming || 0} upcoming${counts.pending ? ` · ${counts.pending} awaiting payment` : ''}`}
      />

      <View style={listStyles.toolbar}>
        <View style={[listStyles.frame, styles.toolbarInner]}>
          <SearchBar value={query} onChangeText={setQuery} placeholder="Search name, phone, table or booking #" />
          <FilterChips<Filter>
            options={[
              { value: 'today', label: 'Today', count: counts.today },
              { value: 'upcoming', label: 'Upcoming', count: counts.upcoming },
              { value: 'pending', label: 'Awaiting payment', count: counts.pending },
              { value: 'past', label: 'Past', count: counts.past },
              { value: 'cancelled', label: 'Cancelled', count: counts.cancelled },
              { value: 'all', label: 'All', count: counts.all },
            ]}
            value={filter}
            onChange={setFilter}
          />
        </View>
      </View>

      {loading ? (
        <EmptyState icon={CalendarCheck} title="Loading reservations…" />
      ) : loadError && bookings.length === 0 ? (
        <LoadError message={loadError} onRetry={() => { setLoading(true); load(); }} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(b) => b._id}
          renderItem={renderBooking}
          renderSectionHeader={({ section }) => <Text style={[listStyles.sectionHeader, styles.sectionHeader]}>{section.title}</Text>}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={[styles.list, listStyles.frame]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} colors={[Colors.primary]} />}
          ListEmptyComponent={<EmptyState icon={CalendarCheck} title={query ? 'No matches' : 'Nothing here'} message={query ? 'Try a different name, phone or table.' : emptyText[filter]} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.backgroundSecondary },
  toolbarInner: { paddingHorizontal: 16 },
  list: { padding: 16, paddingBottom: 40 },
  sectionHeader: { marginTop: 4 },
  timeBox: { width: 64, paddingVertical: 6, borderRadius: 12, backgroundColor: Colors.primaryLight, alignItems: 'center' },
  timeStart: { fontSize: 17, fontWeight: '900', color: Colors.primaryDark },
  timeRange: { fontSize: 11, fontWeight: '700', color: Colors.primaryDark, opacity: 0.8 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.cardSurface, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 13, fontWeight: '800', color: Colors.textMuted },
  badges: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 12 },
  ref: { fontSize: 12, color: Colors.textSubtle, fontWeight: '700', marginLeft: 'auto' },
  note: { flexDirection: 'row', gap: 8, marginTop: 12, padding: 10, borderRadius: 10, backgroundColor: Colors.statusPending.bg },
  noteText: { flex: 1, fontSize: 13, color: Colors.statusPending.text, lineHeight: 18 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.cardBorder },
  phone: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 },
  phoneText: { fontSize: 14, fontWeight: '700', color: Colors.primary },
});

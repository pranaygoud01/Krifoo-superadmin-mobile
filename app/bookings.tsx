/**
 * Table reservations.
 *  - List: what's coming up, grouped by day, with filters and search.
 *  - Day: a timeline of tables × hours — tap a free square to add a phone / walk-in booking.
 * Tap any booking for its actions: call, seat now, move, no-show, completed, cancel (refunds
 * any fee automatically). Updates live when guests book in the app.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, SectionList, RefreshControl, Alert, Linking, TouchableOpacity, ScrollView, DeviceEventEmitter } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  CalendarCheck,
  Users,
  Phone,
  MessageSquare,
  Check,
  X,
  Unlock,
  CircleCheck,
  Clock3,
  Ban,
  UserX,
  ArrowRightLeft,
  Armchair,
  List as ListIcon,
  CalendarRange,
  Plus,
} from 'lucide-react-native';
import { Colors } from '../constants/colors';
import { useToast } from '../context/ToastContext';
import { ScreenHeader } from '../components/ScreenHeader';
import { BottomSheet } from '../components/ui/BottomSheet';
import { PrimaryButton } from '../components/settings/FormKit';
import { SearchBar, FilterChips, Card, Badge, BadgeTone, EmptyState, LoadError, TextAction, Fab, FAB_SPACE, formatGBP, initials, listStyles } from '../components/ui/ListKit';
import { BookingDayView } from '../components/bookings/BookingDayView';
import { BookingFormSheet, type BookingFormMode } from '../components/bookings/BookingFormSheet';
import { addDays, dayLabel, hourOf, timeRange as rangeOf, ukHour, ukToday } from '../components/bookings/dayModel';
import { restaurantOwnerService, type BookingDay, type BookingDayEntry } from '../services/restaurant-owner.service';
import { bookingDay, isOpenBooking as isOpen, isUpcomingBooking } from '../utils/bookings';

interface Booking {
  _id: string;
  bookingNumber?: string;
  customerName?: string;
  customerPhone?: string;
  guestName?: string;
  guestPhone?: string;
  source?: 'app' | 'phone' | 'walk_in';
  customerId?: { _id?: string; fullName?: string; email?: string; phoneNumber?: string } | string | null;
  numberOfGuests?: number;
  guests?: number;
  bookingDate: string;
  bookingTime?: string;
  bookedSlots?: string[];
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'cancelled_by_user' | 'cancelled_by_owner' | 'expired' | 'no_show';
  tableId?: { _id?: string; tableNumber: string; capacity?: number; area?: string } | string;
  paymentDetails?: { paymentStatus?: 'pending' | 'paid' | 'refunded' | 'failed'; bookingFee?: number; refundAmount?: number };
  specialRequests?: string;
  seating?: { tableLabel?: string } | null;
  createdAt?: string;
}

/** What the actions sheet needs, from either the list or the day view. */
interface Selected {
  _id: string;
  date: string;
  name: string;
  phone: string;
  guests: number;
  slots: string[];
  status: Booking['status'];
  source: string;
  fee: number;
  payStatus?: string;
  tableLabel: string;
  specialRequests?: string;
  seatedAt?: string;
}

type Filter = 'today' | 'upcoming' | 'pending' | 'past' | 'cancelled' | 'all';

const CANCELLED = ['cancelled', 'cancelled_by_user', 'cancelled_by_owner', 'expired'];
const isCancelled = (b: { status: string }) => CANCELLED.includes(b.status);

const sortedSlots = (b: Booking) => (b.bookedSlots?.length ? [...b.bookedSlots].sort() : b.bookingTime ? [b.bookingTime] : []);
const startTime = (b: Booking) => sortedSlots(b)[0] || '';
const timeRange = (b: Booking) => rangeOf(sortedSlots(b)) || 'Time not set';

function dayTitle(iso: string, today: string): string {
  const label = dayLabel(iso, today);
  if (label === 'Today' || label === 'Tomorrow') return label;
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
}

const customerName = (b: Booking) => b.guestName || b.customerName || (typeof b.customerId === 'object' ? b.customerId?.fullName : '') || 'Guest';
const customerPhone = (b: Booking) => b.guestPhone || b.customerPhone || (typeof b.customerId === 'object' ? b.customerId?.phoneNumber : '') || '';
const tableInfo = (b: Booking) => (typeof b.tableId === 'object' ? b.tableId : null);

/** Started / over, on the UK clock. */
const hasStarted = (date: string, slots: string[], today: string) => date < today || (date === today && slots.length > 0 && hourOf([...slots].sort()[0]) <= ukHour());
const isOver = (date: string, slots: string[], today: string) => date < today || (date === today && slots.length > 0 && hourOf([...slots].sort()[slots.length - 1]) + 1 <= ukHour());

const STATUS: Record<string, { label: string; tone: BadgeTone; icon: any }> = {
  pending: { label: 'Awaiting payment', tone: 'warning', icon: Clock3 },
  confirmed: { label: 'Confirmed', tone: 'success', icon: CircleCheck },
  completed: { label: 'Completed', tone: 'info', icon: Check },
  no_show: { label: 'No-show', tone: 'neutral', icon: UserX },
  cancelled: { label: 'Cancelled', tone: 'danger', icon: Ban },
  cancelled_by_user: { label: 'Cancelled by guest', tone: 'danger', icon: Ban },
  cancelled_by_owner: { label: 'Cancelled by you', tone: 'danger', icon: Ban },
  expired: { label: 'Expired', tone: 'neutral', icon: Ban },
};
const SOURCE_LABEL: Record<string, string> = { app: 'Booked in app', phone: 'Phone booking', walk_in: 'Walk-in' };

export default function BookingsScreen() {
  const { showToast } = useToast();
  const router = useRouter();
  const today = ukToday();

  const [view, setView] = useState<'list' | 'day'>('list');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('today');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const [dayDate, setDayDate] = useState(today);
  const [day, setDay] = useState<BookingDay | null>(null);
  const [dayLoading, setDayLoading] = useState(false);

  const [selected, setSelected] = useState<Selected | null>(null);
  const [form, setForm] = useState<BookingFormMode | null>(null);
  const [formDay, setFormDay] = useState<BookingDay | null>(null);

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

  const fetchDay = useCallback(async (date: string) => {
    const res = await restaurantOwnerService.getBookingDay(date);
    return res.success && res.data ? res.data : null;
  }, []);

  const loadDay = useCallback(
    async (date: string) => {
      setDayLoading(true);
      const d = await fetchDay(date);
      setDayLoading(false);
      setRefreshing(false);
      if (d) setDay(d);
    },
    [fetchDay]
  );

  const reloadAll = useCallback(() => {
    load();
    if (view === 'day') loadDay(dayDate);
  }, [load, loadDay, view, dayDate]);

  useFocusEffect(
    useCallback(() => {
      reloadAll();
    }, [reloadAll])
  );

  // Live: guests booking / paying in the app
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('websocket_message', (msg: any) => {
      if (msg?.type === 'RESTAURANT_BOOKING_UPDATE') reloadAll();
    });
    return () => sub.remove();
  }, [reloadAll]);

  const matches = useCallback(
    (b: Booking, f: Filter) => {
      const d = bookingDay(b);
      switch (f) {
        case 'today':
          return d === today && !isCancelled(b);
        case 'upcoming':
          return isUpcomingBooking(b, today);
        case 'pending':
          return b.status === 'pending';
        case 'past':
          return (d < today && !isCancelled(b)) || b.status === 'completed' || b.status === 'no_show';
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
    return Array.from(groups.entries()).map(([d, data]) => ({ title: dayTitle(d, today), data }));
  }, [bookings, filter, query, matches, today]);

  /* ── Selection (list or day) ───────────────────────────────────────── */

  const fromList = (b: Booking): Selected => ({
    _id: b._id,
    date: bookingDay(b),
    name: customerName(b),
    phone: customerPhone(b),
    guests: b.guests ?? b.numberOfGuests ?? 1,
    slots: sortedSlots(b),
    status: b.status,
    source: b.source || 'app',
    fee: Number(b.paymentDetails?.bookingFee || 0),
    payStatus: b.paymentDetails?.paymentStatus,
    tableLabel: tableInfo(b)?.tableNumber ? `Table ${tableInfo(b)!.tableNumber}` : '',
    specialRequests: b.specialRequests,
    seatedAt: b.seating?.tableLabel,
  });

  const fromDay = (b: BookingDayEntry): Selected => ({
    _id: b._id,
    date: day?.date || dayDate,
    name: b.customerName,
    phone: b.customerPhone,
    guests: b.guests,
    slots: b.slots,
    status: b.status,
    source: b.source,
    fee: b.paymentDetails.bookingFee || 0,
    payStatus: b.paymentDetails.paymentStatus,
    tableLabel: (() => {
      const t = day?.tables.find((x) => x._id === String(b.tableId));
      return t ? `Table ${t.tableNumber}` : '';
    })(),
    specialRequests: b.specialRequests,
    seatedAt: b.seating?.tableLabel,
  });

  /* ── Actions ───────────────────────────────────────────────────────── */

  const afterChange = (title: string, s: Selected) => {
    showToast({ title, message: `${s.name} · ${rangeOf(s.slots)}`, type: 'success' });
    setSelected(null);
    reloadAll();
  };

  const run = async (s: Selected, action: () => Promise<{ success: boolean; message?: string }>, done: string) => {
    setBusy(s._id);
    try {
      const res = await action();
      if (!res.success) throw new Error(res.message);
      afterChange(res.message && res.message.length < 60 ? res.message : done, s);
    } catch (e: any) {
      showToast({ title: 'Couldn’t update reservation', message: e?.message || 'Please try again.', type: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const complete = (s: Selected) => run(s, () => restaurantOwnerService.completeBooking(s._id), 'Marked as completed');

  const noShow = (s: Selected) =>
    Alert.alert('Mark as no-show?', `${s.name} didn’t arrive. Their table is freed for walk-ins${s.fee > 0 && s.payStatus === 'paid' ? ` and the ${formatGBP(s.fee)} fee is kept` : ''}.`, [
      { text: 'Not yet', style: 'cancel' },
      { text: 'No-show', style: 'destructive', onPress: () => run(s, () => restaurantOwnerService.markNoShow(s._id), 'Marked as no-show') },
    ]);

  const cancel = (s: Selected) => {
    const paid = s.payStatus === 'paid' && s.fee > 0;
    Alert.alert(
      'Cancel this reservation?',
      `${s.name}, ${dayTitle(s.date, today)} at ${rangeOf(s.slots)}.${paid ? `\n\nThe guest’s ${formatGBP(s.fee)} will be refunded in full automatically.` : ''}${s.source === 'app' ? '\n\nThey’ll get a notification.' : ''}`,
      [
        { text: 'Keep it', style: 'cancel' },
        { text: paid ? 'Cancel & refund' : 'Cancel reservation', style: 'destructive', onPress: () => run(s, () => restaurantOwnerService.cancelBooking(s._id), paid ? 'Cancelled and refunded' : 'Reservation cancelled') },
      ]
    );
  };

  const release = (s: Selected) =>
    Alert.alert('Release this table?', 'The guest hasn’t finished paying. Releasing cancels the hold so other guests can book this time.', [
      { text: 'Keep holding', style: 'cancel' },
      { text: 'Release', style: 'destructive', onPress: () => run(s, () => restaurantOwnerService.expireBooking(s._id), 'Table released') },
    ]);

  const openMove = async (s: Selected) => {
    const d = s.date === day?.date ? day : await fetchDay(s.date);
    const entry = d?.bookings.find((b) => b._id === s._id);
    if (!d || !entry) {
      showToast({ title: 'Couldn’t load that day', message: 'Pull to refresh and try again.', type: 'error' });
      return;
    }
    setSelected(null);
    setFormDay(d);
    setForm({ kind: 'move', booking: entry });
  };

  const openCreate = async (tableId?: string, start?: number) => {
    const date = view === 'day' ? dayDate : today;
    const d = date === day?.date ? day : await fetchDay(date);
    if (!d) {
      showToast({ title: 'Couldn’t load the day', message: 'Pull to refresh and try again.', type: 'error' });
      return;
    }
    setFormDay(d);
    setForm({ kind: 'create', tableId, start });
  };

  const switchView = (v: 'list' | 'day') => {
    setView(v);
    if (v === 'day') loadDay(dayDate);
  };

  /* ── Render: list ──────────────────────────────────────────────────── */

  const renderBooking = ({ item: b }: { item: Booking }) => {
    const s = fromList(b);
    const t = tableInfo(b);
    const status = STATUS[b.status] || STATUS.confirmed;
    const isBusy = busy === b._id;

    return (
      <Card muted={isCancelled(b) || b.status === 'no_show'}>
        <TouchableOpacity onPress={() => setSelected(s)} accessibilityRole="button" accessibilityLabel={`${s.name}, ${timeRange(b)}, ${status.label}. Open actions`}>
          <View style={listStyles.row}>
            <View style={styles.timeBox}>
              <Text style={styles.timeStart}>{startTime(b) || '--:--'}</Text>
              <Text style={styles.timeRange}>{timeRange(b).split('–')[1] ? `to ${timeRange(b).split('–')[1]}` : ''}</Text>
            </View>
            <View style={listStyles.flex}>
              <Text style={listStyles.title} numberOfLines={1}>
                {s.name}
              </Text>
              <View style={styles.inline}>
                <Users size={13} color={Colors.textSubtle} />
                <Text style={listStyles.meta}>
                  {s.guests} guest{s.guests === 1 ? '' : 's'}
                  {t ? ` · Table ${t.tableNumber}${t.area ? ` (${t.area})` : ''}` : ''}
                </Text>
              </View>
            </View>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials(s.name)}</Text>
            </View>
          </View>

          <View style={styles.badges}>
            <Badge label={status.label} tone={status.tone} icon={status.icon} />
            <PaymentBadge s={s} />
            {s.source !== 'app' ? <Badge label={SOURCE_LABEL[s.source]} tone="neutral" /> : null}
            <Text style={styles.ref}>#{(b.bookingNumber || b._id.slice(-6)).toUpperCase()}</Text>
          </View>

          {b.specialRequests ? (
            <View style={styles.note}>
              <MessageSquare size={14} color={Colors.statusPending.text} />
              <Text style={styles.noteText}>{b.specialRequests}</Text>
            </View>
          ) : null}
        </TouchableOpacity>

        {(s.phone || isOpen(b)) && (
          <View style={styles.actions}>
            {s.phone ? (
              <TouchableOpacity style={styles.phone} onPress={() => Linking.openURL(`tel:${s.phone.replace(/\s/g, '')}`)} accessibilityRole="button" accessibilityLabel={`Call ${s.name}`}>
                <Phone size={14} color={Colors.primary} />
                <Text style={styles.phoneText}>{s.phone}</Text>
              </TouchableOpacity>
            ) : (
              <View style={listStyles.flex} />
            )}
            {b.status === 'pending' && <TextAction label="Release" icon={Unlock} tone="danger" onPress={() => release(s)} busy={isBusy} />}
            {b.status === 'confirmed' && hasStarted(s.date, s.slots, today) && !isOver(s.date, s.slots, today) ? (
              <TextAction label="No-show" icon={UserX} tone="danger" onPress={() => noShow(s)} disabled={isBusy} />
            ) : null}
            {b.status === 'confirmed' && !isOver(s.date, s.slots, today) && !hasStarted(s.date, s.slots, today) ? (
              <TextAction label="Cancel" icon={X} tone="danger" onPress={() => cancel(s)} disabled={isBusy} />
            ) : null}
            {b.status === 'confirmed' && isOver(s.date, s.slots, today) ? (
              <TextAction label="Completed" icon={Check} tone="primary" onPress={() => complete(s)} busy={isBusy} />
            ) : null}
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

  const dayChoices = Array.from({ length: 14 }, (_, i) => addDays(today, i));

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="Reservations"
        subtitle={`${counts.today || 0} today · ${counts.upcoming || 0} upcoming${counts.pending ? ` · ${counts.pending} awaiting payment` : ''}`}
        rightElement={
          <View style={styles.viewToggle}>
            {(['list', 'day'] as const).map((v) => {
              const Icon = v === 'list' ? ListIcon : CalendarRange;
              const active = view === v;
              return (
                <TouchableOpacity
                  key={v}
                  onPress={() => switchView(v)}
                  style={[styles.viewBtn, active && styles.viewBtnActive]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={v === 'list' ? 'List view' : 'Day timeline view'}
                >
                  <Icon size={16} color={active ? '#FFFFFF' : Colors.textMuted} />
                  <Text style={[styles.viewBtnText, active && styles.viewBtnTextActive]}>{v === 'list' ? 'List' : 'Day'}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        }
      />

      {view === 'list' ? (
        <>
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
        </>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.list, listStyles.frame]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadDay(dayDate); }} tintColor={Colors.primary} colors={[Colors.primary]} />}
        >
          <FilterChips
            options={dayChoices.map((d) => ({ value: d, label: dayLabel(d, today) }))}
            value={dayDate}
            onChange={(d) => {
              setDayDate(d);
              loadDay(d);
            }}
          />
          <View style={styles.gap} />
          {dayLoading && !day ? (
            <EmptyState icon={CalendarRange} title="Loading the day…" />
          ) : !day || day.date !== dayDate ? (
            dayLoading ? <EmptyState icon={CalendarRange} title="Loading the day…" /> : <LoadError message="Couldn’t load this day." onRetry={() => loadDay(dayDate)} />
          ) : !day.tables.length ? (
            <EmptyState
              icon={Armchair}
              title={day.setUp ? 'No booking hours this day' : 'No tables to book yet'}
              message={day.setUp ? 'This day is closed in your booking hours. Change it on the Booking hours screen.' : 'Add your tables and set your booking hours once on the Tables screen.'}
              actionLabel="Go to Tables"
              onAction={() => router.push('/tables')}
            />
          ) : (
            <>
              <BookingDayView day={day} isToday={day.date === today} onAdd={(tableId, h) => openCreate(tableId, h)} onOpen={(b) => setSelected(fromDay(b))} />
              <Text style={styles.legend}>Tap + to add a booking · the number under each hour is guests expected · grey = closed or past</Text>
            </>
          )}
        </ScrollView>
      )}

      <Fab label="New booking" icon={Plus} onPress={() => openCreate()} />

      {/* Booking actions */}
      <BottomSheet
        visible={!!selected && !form}
        title={selected ? selected.name : ''}
        subtitle={selected ? `${dayTitle(selected.date, today)} · ${rangeOf(selected.slots)} · ${selected.guests} guest${selected.guests === 1 ? '' : 's'}${selected.tableLabel ? ` · ${selected.tableLabel}` : ''}` : undefined}
        onClose={() => setSelected(null)}
      >
        {selected ? <ActionsBody s={selected} /> : null}
      </BottomSheet>

      <BookingFormSheet
        visible={!!form}
        mode={form}
        day={formDay}
        onClose={() => setForm(null)}
        onDone={(message) => {
          setForm(null);
          showToast({ message, type: 'success' });
          if (formDay && view === 'day') setDayDate(formDay.date);
          load();
          loadDay(formDay?.date || dayDate);
        }}
      />
    </View>
  );

  function ActionsBody({ s }: { s: Selected }) {
    const status = STATUS[s.status] || STATUS.confirmed;
    const started = hasStarted(s.date, s.slots, today);
    const over = isOver(s.date, s.slots, today);
    const isBusy = busy === s._id;
    return (
      <View style={styles.sheetBody}>
        <View style={styles.badges}>
          <Badge label={status.label} tone={status.tone} icon={status.icon} />
          <PaymentBadge s={s} />
          <Badge label={SOURCE_LABEL[s.source] || 'Booked in app'} tone="neutral" />
          {s.seatedAt ? <Badge label={`Seated at ${s.seatedAt}`} tone="info" /> : null}
        </View>
        {s.specialRequests ? (
          <View style={styles.note}>
            <MessageSquare size={14} color={Colors.statusPending.text} />
            <Text style={styles.noteText}>{s.specialRequests}</Text>
          </View>
        ) : null}

        {s.phone ? <PrimaryButton label={`Call ${s.phone}`} icon={Phone} tone="secondary" onPress={() => Linking.openURL(`tel:${s.phone.replace(/\s/g, '')}`)} /> : null}

        {s.status === 'confirmed' && !over && !s.seatedAt ? (
          <PrimaryButton label="Seat now (Floor)" icon={Armchair} onPress={() => { setSelected(null); router.push('/floor'); }} />
        ) : null}
        {s.status === 'confirmed' && !over ? <PrimaryButton label="Move to another table or time" icon={ArrowRightLeft} tone="secondary" onPress={() => openMove(s)} /> : null}
        {s.status === 'confirmed' && started && !over ? <PrimaryButton label="No-show" icon={UserX} tone="secondary" loading={isBusy} onPress={() => noShow(s)} /> : null}
        {s.status === 'confirmed' && over ? <PrimaryButton label="Mark completed" icon={Check} loading={isBusy} onPress={() => complete(s)} /> : null}
        {s.status === 'confirmed' && over ? <PrimaryButton label="Didn’t come (no-show)" icon={UserX} tone="secondary" onPress={() => noShow(s)} /> : null}
        {s.status === 'pending' ? <PrimaryButton label="Release table" icon={Unlock} tone="danger" loading={isBusy} onPress={() => release(s)} /> : null}
        {s.status === 'confirmed' && !over ? (
          <PrimaryButton
            label={s.payStatus === 'paid' && s.fee > 0 ? `Cancel & refund ${formatGBP(s.fee)}` : 'Cancel reservation'}
            icon={X}
            tone="danger"
            loading={isBusy}
            onPress={() => cancel(s)}
          />
        ) : null}
        {!isOpen(s) ? <Text style={styles.muted}>No actions — this reservation is {status.label.toLowerCase()}.</Text> : null}
      </View>
    );
  }
}

function PaymentBadge({ s }: { s: Selected }) {
  if (!(s.fee > 0)) return <Badge label={s.source === 'app' ? 'Free booking' : 'No payment'} tone="neutral" />;
  const label = s.payStatus === 'paid' ? `${formatGBP(s.fee)} paid` : s.payStatus === 'refunded' ? `${formatGBP(s.fee)} refunded` : `${formatGBP(s.fee)} unpaid`;
  const tone: BadgeTone = s.payStatus === 'paid' ? 'success' : s.payStatus === 'refunded' ? 'info' : 'warning';
  return <Badge label={label} tone={tone} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.backgroundSecondary },
  toolbarInner: { paddingHorizontal: 16 },
  list: { padding: 16, paddingBottom: FAB_SPACE },
  gap: { height: 10 },
  sectionHeader: { marginTop: 4 },
  viewToggle: { flexDirection: 'row', backgroundColor: Colors.cardSurface, borderRadius: 10, padding: 2 },
  viewBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, height: 32, borderRadius: 8 },
  viewBtnActive: { backgroundColor: Colors.text },
  viewBtnText: { fontSize: 13, fontWeight: '700', color: Colors.textMuted },
  viewBtnTextActive: { color: '#FFFFFF' },
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
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.cardBorder, flexWrap: 'wrap' },
  phone: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 },
  phoneText: { fontSize: 14, fontWeight: '700', color: Colors.primary },
  legend: { fontSize: 12, color: Colors.textMuted, marginTop: 10 },
  sheetBody: { gap: 10 },
  muted: { fontSize: 13, color: Colors.textMuted },
});


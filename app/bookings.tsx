import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
  TextInput,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors } from '../constants/colors';
import { restaurantOwnerService } from '../services/restaurant-owner.service';
import {
  ArrowLeft,
  Users,
  Calendar,
  Clock,
  X,
  Check,
  Search,
  RefreshCw,
  CreditCard,
  Phone,
  MessageSquare,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Clock3,
} from 'lucide-react-native';

interface Booking {
  _id: string;
  bookingNumber?: string;
  customerName?: string;
  customerPhone?: string;
  customerId?: {
    _id?: string;
    fullName?: string;
    email?: string;
    phoneNumber?: string;
  } | string;
  numberOfGuests?: number;
  guests?: number;
  bookingDate: string; // ISO string
  bookingTime?: string; // Slot time or single hour
  bookedSlots?: string[]; // Array of slot strings e.g. ["19:00", "20:00"]
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'cancelled_by_user' | 'cancelled_by_owner' | 'expired';
  tableId?: {
    _id?: string;
    tableNumber: string;
    capacity?: number;
    area?: string;
  } | string;
  paymentDetails?: {
    sessionId?: string;
    paymentStatus?: 'pending' | 'paid' | 'refunded' | 'failed';
    bookingFee?: number;
  };
  paymentMethod?: string;
  specialRequests?: string;
  createdAt?: string;
  updatedAt?: string;
}

const STATUS_FILTERS = [
  { label: 'All Bookings', value: 'all' },
  { label: 'Confirmed', value: 'confirmed' },
  { label: 'Pending', value: 'pending' },
  { label: 'Completed', value: 'completed' },
  { label: 'Cancelled', value: 'cancelled' },
];

export default function BookingsScreen() {
  const router = useRouter();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const loadBookings = async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const res = await restaurantOwnerService.getBookings();
      if (res.success && res.data) {
        // Sort bookings by date descending
        const sorted = res.data.sort((a, b) => {
          const dateA = new Date(a.bookingDate || a.createdAt || 0).getTime();
          const dateB = new Date(b.bookingDate || b.createdAt || 0).getTime();
          return dateB - dateA;
        });
        setBookings(sorted);
      }
    } catch (e) {
      console.error('Failed loading bookings:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadBookings();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    loadBookings(true);
  };

  const handleComplete = async (bookingId: string) => {
    try {
      const res = await restaurantOwnerService.completeBooking(bookingId);
      if (res.success) {
        Alert.alert('Success', 'Reservation marked as Completed.');
        loadBookings(true);
      } else {
        Alert.alert('Error', res.message || 'Failed to complete booking.');
      }
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to complete booking.');
    }
  };

  const handleCancel = async (bookingId: string) => {
    Alert.alert(
      'Cancel Reservation',
      'Are you sure you want to cancel this reservation?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            const res = await restaurantOwnerService.cancelBooking(bookingId);
            if (res.success) {
              Alert.alert('Success', 'Reservation cancelled successfully.');
              loadBookings(true);
            } else {
              Alert.alert('Error', res.message || 'Failed to cancel booking.');
            }
          },
        },
      ]
    );
  };

  const handleForceRelease = async (bookingId: string) => {
    Alert.alert(
      'Force Release Locked Slots',
      'This will cancel the pending reservation and unlock its table time slots immediately. Proceed?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Release Slots',
          style: 'destructive',
          onPress: async () => {
            const res = await restaurantOwnerService.expireBooking(bookingId);
            if (res.success) {
              Alert.alert('Success', 'Pending booking released and time slots unlocked.');
              loadBookings(true);
            } else {
              Alert.alert('Error', res.message || 'Failed to release booking.');
            }
          },
        },
      ]
    );
  };

  // Helper formatting methods
  const formatBookingDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-GB', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  const formatCreationTime = (dateStr?: string) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const formatTimeSlotDisplay = (item: Booking) => {
    if (item.bookedSlots && item.bookedSlots.length > 0) {
      if (item.bookedSlots.length === 1) {
        return item.bookedSlots[0];
      }
      const sorted = [...item.bookedSlots].sort();
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const lastH = parseInt(last.split(':')[0], 10) + 1;
      const endFormatted = `${String(lastH).padStart(2, '0')}:00`;
      return `${first} - ${endFormatted} (${sorted.length} hrs)`;
    }
    return item.bookingTime || 'Scheduled Time';
  };

  // Filtered Bookings
  const filteredBookings = useMemo(() => {
    return bookings.filter((b) => {
      if (!b) return false;

      // Status Filter
      if (statusFilter === 'confirmed' && b.status !== 'confirmed') return false;
      if (statusFilter === 'pending' && b.status !== 'pending') return false;
      if (statusFilter === 'completed' && b.status !== 'completed') return false;
      if (
        statusFilter === 'cancelled' &&
        b.status !== 'cancelled' &&
        b.status !== 'cancelled_by_user' &&
        b.status !== 'cancelled_by_owner' &&
        b.status !== 'expired'
      ) {
        return false;
      }

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const bNum = (b.bookingNumber || b._id || '').toLowerCase();
        const cName = (
          b.customerName ||
          (typeof b.customerId === 'object' ? b.customerId?.fullName : '') ||
          ''
        ).toLowerCase();
        const cPhone = (
          b.customerPhone ||
          (typeof b.customerId === 'object' ? b.customerId?.phoneNumber : '') ||
          ''
        ).toLowerCase();
        const tNum = (
          typeof b.tableId === 'object' ? b.tableId?.tableNumber : String(b.tableId || '')
        ).toLowerCase();

        if (!bNum.includes(q) && !cName.includes(q) && !cPhone.includes(q) && !tNum.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [bookings, statusFilter, searchQuery]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: bookings.length,
      confirmed: bookings.filter((b) => b.status === 'confirmed').length,
      pending: bookings.filter((b) => b.status === 'pending').length,
      completed: bookings.filter((b) => b.status === 'completed').length,
      cancelled: bookings.filter(
        (b) =>
          b.status === 'cancelled' ||
          b.status === 'cancelled_by_user' ||
          b.status === 'cancelled_by_owner' ||
          b.status === 'expired'
      ).length,
    };
    return counts;
  }, [bookings]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Page Header */}
      <View style={styles.pageHeader}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.back()}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.7}
          >
            <ArrowLeft size={20} color="#11181C" />
          </TouchableOpacity>
          <View>
            <View style={styles.pageTitleRow}>
              <Text style={styles.pageTitle}>Table Reservations</Text>
              <View style={styles.liveBadge}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>Live</Text>
              </View>
            </View>
            <Text style={styles.pageSubtitle}>
              {filteredBookings.length} booking{filteredBookings.length !== 1 ? 's' : ''} ({statusCounts.confirmed} confirmed, {statusCounts.pending} pending)
            </Text>
          </View>
        </View>

        <TouchableOpacity style={styles.refreshBtn} onPress={handleRefresh} activeOpacity={0.7}>
          <RefreshCw size={16} color={Colors.textSubtle} />
        </TouchableOpacity>
      </View>

      {/* Search & Status Filters */}
      <View style={styles.controlsRow}>
        <View style={styles.searchBox}>
          <Search size={14} color={Colors.textSubtle} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search customer, phone, booking #, table..."
            placeholderTextColor={Colors.textSubtle}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <X size={14} color={Colors.textSubtle} />
            </TouchableOpacity>
          )}
        </View>

        {/* Status Pill Filters */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statusFilters}>
          {STATUS_FILTERS.map((f) => {
            const isActive = statusFilter === f.value;
            const count = statusCounts[f.value] || 0;
            return (
              <TouchableOpacity
                key={f.value}
                style={[styles.statusChip, isActive && styles.statusChipActive]}
                onPress={() => setStatusFilter(f.value)}
                activeOpacity={0.7}
              >
                <Text style={[styles.statusChipText, isActive && styles.statusChipTextActive]}>
                  {f.label}
                </Text>
                <View style={[styles.statusBadgeCount, isActive ? styles.statusBadgeCountActive : styles.statusBadgeCountInactive]}>
                  <Text style={[styles.statusBadgeCountText, isActive && { color: '#11181C' }]}>
                    {count}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Bookings Feed */}
      {loading && !refreshing ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color="#FF5C39" />
          <Text style={styles.loadingText}>Fetching reservations...</Text>
        </View>
      ) : filteredBookings.length === 0 ? (
        <View style={styles.centerBox}>
          <Calendar size={48} color="#EEEEEE" />
          <Text style={styles.emptyTitle}>No Reservations Found</Text>
          <Text style={styles.emptySub}>
            {statusFilter !== 'all'
              ? `There are no ${statusFilter} bookings found for this search filter.`
              : 'Customer table reservations will appear here in real time.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredBookings}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#FF5C39"
              colors={['#FF5C39']}
            />
          }
          renderItem={({ item }) => {
            const custName =
              item.customerName ||
              (typeof item.customerId === 'object' ? item.customerId?.fullName : '') ||
              'Guest Customer';

            const custPhone =
              item.customerPhone ||
              (typeof item.customerId === 'object' ? item.customerId?.phoneNumber : '');

            const custEmail =
              typeof item.customerId === 'object' ? item.customerId?.email : '';

            const tableNum =
              typeof item.tableId === 'object'
                ? item.tableId?.tableNumber
                : item.tableId;

            const tableArea =
              typeof item.tableId === 'object' ? item.tableId?.area : '';

            const guestCount = item.guests ?? item.numberOfGuests ?? 1;

            const bookingRef =
              item.bookingNumber || item._id?.substring(0, 8).toUpperCase();

            const timeSlotText = formatTimeSlotDisplay(item);
            const bookingDateText = formatBookingDate(item.bookingDate);
            const createdTime = formatCreationTime(item.createdAt);

            // Payment information
            const paymentStatus = (item.paymentDetails?.paymentStatus || 'pending').toLowerCase();
            const bookingFee = item.paymentDetails?.bookingFee ?? 0;
            const isPaid = paymentStatus === 'paid';
            const isFree = bookingFee === 0;

            const paymentMethodLabel = item.paymentMethod
              ? item.paymentMethod
              : isFree
              ? 'Free Reservation'
              : 'Online Card (Stripe)';

            const isPending = item.status === 'pending';
            const isConfirmed = item.status === 'confirmed';
            const isCompleted = item.status === 'completed';
            const isCancelled =
              item.status === 'cancelled' ||
              item.status === 'cancelled_by_user' ||
              item.status === 'cancelled_by_owner' ||
              item.status === 'expired';

            return (
              <View style={styles.bookingCard}>
                {/* Top Section: Booking ID & Status Badges */}
                <View style={styles.cardTopRow}>
                  <View style={styles.bookingIdCol}>
                    <View style={styles.bookingIdRow}>
                      <Text style={styles.bookingIdText}>#{bookingRef}</Text>
                      {tableNum ? (
                        <View style={styles.tablePillBadge}>
                          <Text style={styles.tablePillText}>Table {tableNum}</Text>
                          {tableArea ? <Text style={styles.tableAreaText}>• {tableArea}</Text> : null}
                        </View>
                      ) : null}
                    </View>
                    {createdTime ? (
                      <Text style={styles.createdAtText}>Booked at {createdTime}</Text>
                    ) : null}
                  </View>

                  <View style={styles.statusBadgesGroup}>
                    {isConfirmed && (
                      <View style={[styles.statusBadge, styles.badgeConfirmed]}>
                        <CheckCircle2 size={11} color="#065F46" style={{ marginRight: 3 }} />
                        <Text style={[styles.statusBadgeText, styles.textConfirmed]}>CONFIRMED</Text>
                      </View>
                    )}
                    {isPending && (
                      <View style={[styles.statusBadge, styles.badgePending]}>
                        <Clock3 size={11} color="#B45309" style={{ marginRight: 3 }} />
                        <Text style={[styles.statusBadgeText, styles.textPending]}>PENDING</Text>
                      </View>
                    )}
                    {isCompleted && (
                      <View style={[styles.statusBadge, styles.badgeCompleted]}>
                        <Check size={11} color="#1D4ED8" style={{ marginRight: 3 }} />
                        <Text style={[styles.statusBadgeText, styles.textCompleted]}>COMPLETED</Text>
                      </View>
                    )}
                    {isCancelled && (
                      <View style={[styles.statusBadge, styles.badgeCancelled]}>
                        <X size={11} color="#B91C1C" style={{ marginRight: 3 }} />
                        <Text style={[styles.statusBadgeText, styles.textCancelled]}>CANCELLED</Text>
                      </View>
                    )}
                  </View>
                </View>

                {/* Customer Information Row */}
                <View style={styles.customerRow}>
                  <View style={styles.custAvatar}>
                    <Text style={styles.custAvatarText}>{custName.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.custName}>{custName}</Text>
                    <View style={styles.contactRow}>
                      {custPhone ? (
                        <View style={styles.contactItem}>
                          <Phone size={11} color="#687076" style={{ marginRight: 3 }} />
                          <Text style={styles.contactText}>{custPhone}</Text>
                        </View>
                      ) : null}
                      {custEmail ? (
                        <Text style={styles.contactTextSub} numberOfLines={1}>
                          {custEmail}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                </View>

                <View style={styles.divider} />

                {/* DATE & TIME SECTION (Prominently Highlighted) */}
                <View style={styles.dateTimeContainer}>
                  <View style={styles.dateTimePill}>
                    <Calendar size={13} color="#FF5C39" style={{ marginRight: 6 }} />
                    <View>
                      <Text style={styles.dateTimeLabel}>Reservation Date</Text>
                      <Text style={styles.dateTimeValue}>{bookingDateText}</Text>
                    </View>
                  </View>

                  <View style={[styles.dateTimePill, styles.timeSlotHighlight]}>
                    <Clock size={13} color="#FF5C39" style={{ marginRight: 6 }} />
                    <View>
                      <Text style={styles.dateTimeLabel}>Booked Time Slot</Text>
                      <Text style={[styles.dateTimeValue, { color: '#FF5C39', fontWeight: '800' }]}>
                        {timeSlotText}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Guest Count & Seating */}
                <View style={styles.specsRow}>
                  <View style={styles.specBadge}>
                    <Users size={12} color="#687076" style={{ marginRight: 4 }} />
                    <Text style={styles.specBadgeText}>{guestCount} Guest{guestCount !== 1 ? 's' : ''}</Text>
                  </View>
                  {tableNum ? (
                    <View style={styles.specBadge}>
                      <Text style={styles.specBadgeText}>Table #{tableNum}</Text>
                    </View>
                  ) : null}
                </View>

                {/* PAYMENT METHOD & PAYMENT STATUS SECTION (NEW) */}
                <View style={styles.paymentSectionBox}>
                  <View style={styles.paymentMethodRow}>
                    <View style={styles.paymentMethodLeft}>
                      <CreditCard size={14} color="#11181C" style={{ marginRight: 6 }} />
                      <View>
                        <Text style={styles.paymentMethodLabel}>Payment Method</Text>
                        <Text style={styles.paymentMethodValue}>{paymentMethodLabel}</Text>
                      </View>
                    </View>

                    <View style={styles.paymentStatusCol}>
                      <View
                        style={[
                          styles.paidPill,
                          isPaid
                            ? styles.paidPillGreen
                            : paymentStatus === 'refunded'
                            ? styles.paidPillBlue
                            : paymentStatus === 'failed'
                            ? styles.paidPillRed
                            : styles.paidPillYellow,
                        ]}
                      >
                        <Text
                          style={[
                            styles.paidPillText,
                            isPaid
                              ? styles.paidTextGreen
                              : paymentStatus === 'refunded'
                              ? styles.paidTextBlue
                              : paymentStatus === 'failed'
                              ? styles.paidTextRed
                              : styles.paidTextYellow,
                          ]}
                        >
                          {isPaid ? 'PAID' : paymentStatus.toUpperCase()}
                        </Text>
                      </View>

                      <Text style={styles.bookingFeeText}>
                        {bookingFee > 0 ? `£${Number(bookingFee).toFixed(2)}` : '£0.00'}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Special Requests (if any) */}
                {item.specialRequests ? (
                  <View style={styles.specialRequestBox}>
                    <MessageSquare size={12} color="#D97706" style={{ marginRight: 6, marginTop: 1 }} />
                    <Text style={styles.specialRequestText}>
                      <Text style={{ fontWeight: '700' }}>Note: </Text>
                      {item.specialRequests}
                    </Text>
                  </View>
                ) : null}

                {/* Action Buttons for Confirmed & Pending Reservations */}
                {(isConfirmed || isPending) && (
                  <View style={styles.cardActionsRow}>
                    {isPending && (
                      <TouchableOpacity
                        style={styles.btnRelease}
                        activeOpacity={0.7}
                        onPress={() => handleForceRelease(item._id)}
                      >
                        <X size={13} color="#EF4444" style={{ marginRight: 4 }} />
                        <Text style={styles.btnReleaseText}>Release Slots</Text>
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity
                      style={styles.btnCancel}
                      activeOpacity={0.7}
                      onPress={() => handleCancel(item._id)}
                    >
                      <X size={13} color="#EF4444" style={{ marginRight: 4 }} />
                      <Text style={styles.btnCancelText}>Cancel</Text>
                    </TouchableOpacity>

                    {isConfirmed && (
                      <TouchableOpacity
                        style={styles.btnComplete}
                        activeOpacity={0.7}
                        onPress={() => handleComplete(item._id)}
                      >
                        <Check size={14} color="#FFFFFF" style={{ marginRight: 4 }} />
                        <Text style={styles.btnCompleteText}>Mark Completed</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  backBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#EEEEEE',
  },
  pageTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pageTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#11181C',
    letterSpacing: -0.3,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 2,
    gap: 4,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  liveText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#065F46',
  },
  pageSubtitle: {
    fontSize: 11.5,
    color: '#9BA1A6',
    marginTop: 2,
  },
  refreshBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#EEEEEE',
  },
  controlsRow: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingBottom: 10,
    paddingTop: 8,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#EEEEEE',
    paddingHorizontal: 10,
    gap: 8,
    height: 38,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#11181C',
    height: 38,
  },
  statusFilters: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#EEEEEE',
  },
  statusChipActive: {
    backgroundColor: '#11181C',
    borderColor: '#11181C',
  },
  statusChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#687076',
  },
  statusChipTextActive: {
    color: '#FFFFFF',
  },
  statusBadgeCount: {
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
    minWidth: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBadgeCountActive: {
    backgroundColor: '#FFFFFF',
  },
  statusBadgeCountInactive: {
    backgroundColor: '#E2E8F0',
  },
  statusBadgeCountText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#687076',
  },
  listContent: {
    padding: 16,
    gap: 12,
    paddingBottom: 100,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  loadingText: {
    color: '#9BA1A6',
    fontSize: 13,
    marginTop: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#11181C',
    marginTop: 14,
  },
  emptySub: {
    fontSize: 12.5,
    color: '#9BA1A6',
    textAlign: 'center',
    marginTop: 4,
    maxWidth: 280,
    lineHeight: 18,
  },
  bookingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#EEEEEE',
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  bookingIdCol: {
    gap: 2,
  },
  bookingIdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  bookingIdText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#11181C',
  },
  tablePillBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF0EC',
    borderWidth: 1,
    borderColor: '#FFE0D8',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  tablePillText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#FF5C39',
  },
  tableAreaText: {
    fontSize: 10,
    color: '#D97706',
    marginLeft: 3,
    fontWeight: '600',
  },
  createdAtText: {
    fontSize: 10.5,
    color: '#9BA1A6',
  },
  statusBadgesGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeConfirmed: {
    backgroundColor: '#ECFDF5',
  },
  textConfirmed: {
    color: '#065F46',
  },
  badgePending: {
    backgroundColor: '#FEF3C7',
  },
  textPending: {
    color: '#B45309',
  },
  badgeCompleted: {
    backgroundColor: '#EFF6FF',
  },
  textCompleted: {
    color: '#1D4ED8',
  },
  badgeCancelled: {
    backgroundColor: '#FEF2F2',
  },
  textCancelled: {
    color: '#B91C1C',
  },
  statusBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
  },
  custAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  custAvatarText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#475569',
  },
  custName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#11181C',
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  contactText: {
    fontSize: 11,
    color: '#687076',
    fontWeight: '600',
  },
  contactTextSub: {
    fontSize: 11,
    color: '#9BA1A6',
  },
  divider: {
    height: 1,
    backgroundColor: '#F0F0F0',
    marginVertical: 10,
  },
  dateTimeContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  dateTimePill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#EEEEEE',
    padding: 8,
  },
  timeSlotHighlight: {
    backgroundColor: '#FFF0EC',
    borderColor: '#FFE0D8',
  },
  dateTimeLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#9BA1A6',
    textTransform: 'uppercase',
  },
  dateTimeValue: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#11181C',
    marginTop: 1,
  },
  specsRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
  },
  specBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#EEEEEE',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  specBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#687076',
  },
  paymentSectionBox: {
    backgroundColor: '#F8F9FA',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#EEEEEE',
    padding: 10,
    marginTop: 10,
  },
  paymentMethodRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  paymentMethodLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  paymentMethodLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#9BA1A6',
    textTransform: 'uppercase',
  },
  paymentMethodValue: {
    fontSize: 12,
    fontWeight: '800',
    color: '#11181C',
    marginTop: 1,
  },
  paymentStatusCol: {
    alignItems: 'flex-end',
    gap: 2,
  },
  paidPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  paidPillGreen: {
    backgroundColor: '#ECFDF5',
  },
  paidTextGreen: {
    color: '#065F46',
  },
  paidPillYellow: {
    backgroundColor: '#FEF3C7',
  },
  paidTextYellow: {
    color: '#B45309',
  },
  paidPillBlue: {
    backgroundColor: '#EFF6FF',
  },
  paidTextBlue: {
    color: '#1D4ED8',
  },
  paidPillRed: {
    backgroundColor: '#FEF2F2',
  },
  paidTextRed: {
    color: '#B91C1C',
  },
  paidPillText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  bookingFeeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#11181C',
  },
  specialRequestBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 8,
    padding: 8,
    marginTop: 10,
  },
  specialRequestText: {
    fontSize: 11,
    color: '#92400E',
    flex: 1,
    lineHeight: 15,
  },
  cardActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  btnRelease: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
  },
  btnReleaseText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#EF4444',
  },
  btnCancel: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
  },
  btnCancelText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#EF4444',
  },
  btnComplete: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#10B981',
  },
  btnCompleteText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});

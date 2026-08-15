import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Header } from '../components/Header';
import { Colors } from '../constants/colors';
import { StatusBadge } from '../components/StatusBadge';
import { restaurantOwnerService } from '../services/restaurant-owner.service';
import { Users, Calendar, Clock, X, Check, Eye } from 'lucide-react-native';

interface Booking {
  _id: string;
  customerName?: string;
  customerPhone?: string;
  customerId?: {
    fullName?: string;
    phoneNumber?: string;
  } | string;
  numberOfGuests: number;
  bookingDate: string; // ISO string or date
  bookingTime: string; // slot time
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'expired';
  tableId?: {
    tableNumber: string;
  } | string;
}

export default function BookingsScreen() {
  const router = useRouter();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadBookings = async () => {
    setLoading(true);
    try {
      const res = await restaurantOwnerService.getBookings();
      if (res.success && res.data) {
        // Sort bookings: pending/confirmed first, then sort by date descending
        const sorted = res.data.sort((a, b) => {
          const dateA = new Date(a.bookingDate).getTime();
          const dateB = new Date(b.bookingDate).getTime();
          return dateB - dateA;
        });
        setBookings(sorted);
      }
    } catch (e) {
      console.error('Failed loading bookings:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const res = await restaurantOwnerService.getBookings();
      if (res.success && res.data) {
        setBookings(res.data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadBookings();
  }, []);

  const handleComplete = async (bookingId: string) => {
    try {
      const res = await restaurantOwnerService.completeBooking(bookingId);
      if (res.success) {
        Alert.alert('Success', 'Reservation marked as Completed.');
        loadBookings();
      } else {
        Alert.alert('Error', res.message || 'Failed to complete booking.');
      }
    } catch (e) {
      console.error(e);
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
              loadBookings();
            } else {
              Alert.alert('Error', res.message || 'Failed to cancel booking.');
            }
          },
        },
      ]
    );
  };

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <View style={styles.container}>
      <Header title="Table Reservations" showBackButton={true} />

      {loading && !refreshing ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading bookings...</Text>
        </View>
      ) : bookings.length === 0 ? (
        <View style={styles.centerBox}>
          <Calendar size={48} color={Colors.cardBorder} />
          <Text style={styles.emptyTitle}>No Reservations Found</Text>
          <Text style={styles.emptySub}>
            All table bookings made by customers will show up here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={bookings}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={Colors.primary}
            />
          }
          renderItem={({ item }) => {
            const custName =
              item.customerName ||
              (typeof item.customerId === 'object' ? item.customerId?.fullName : 'Guest Customer');
            const custPhone =
              item.customerPhone ||
              (typeof item.customerId === 'object' ? item.customerId?.phoneNumber : '');
            const tableNum =
              typeof item.tableId === 'object'
                ? item.tableId?.tableNumber
                : item.tableId;

            const isPendingOrConfirmed = item.status === 'pending' || item.status === 'confirmed';

            return (
              <View style={styles.bookingCard}>
                <View style={styles.cardHeader}>
                  <View style={styles.custInfo}>
                    <Text style={styles.custName}>{custName}</Text>
                    {custPhone ? <Text style={styles.custPhone}>{custPhone}</Text> : null}
                  </View>
                  <StatusBadge status={item.status === 'confirmed' ? 'approved' : item.status} type="restaurant" />
                </View>

                <View style={styles.divider} />

                <View style={styles.detailsGrid}>
                  <View style={styles.detailItem}>
                    <Calendar size={13} color={Colors.textMuted} style={{ marginRight: 6 }} />
                    <Text style={styles.detailText}>{formatDate(item.bookingDate)}</Text>
                  </View>

                  <View style={styles.detailItem}>
                    <Clock size={13} color={Colors.textMuted} style={{ marginRight: 6 }} />
                    <Text style={styles.detailText}>{item.bookingTime}</Text>
                  </View>

                  <View style={styles.detailItem}>
                    <Users size={13} color={Colors.textMuted} style={{ marginRight: 6 }} />
                    <Text style={styles.detailText}>{item.numberOfGuests} Guests</Text>
                  </View>

                  {tableNum ? (
                    <View style={styles.detailItem}>
                      <Text style={styles.tablePrefix}>Table</Text>
                      <Text style={styles.tableText}>{tableNum}</Text>
                    </View>
                  ) : null}
                </View>

                {isPendingOrConfirmed && (
                  <View style={styles.cardActions}>
                    <TouchableOpacity
                      style={styles.btnCancel}
                      activeOpacity={0.7}
                      onPress={() => handleCancel(item._id)}
                    >
                      <X size={14} color={Colors.danger} style={{ marginRight: 4 }} />
                      <Text style={styles.btnCancelText}>Cancel</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.btnComplete}
                      activeOpacity={0.7}
                      onPress={() => handleComplete(item._id)}
                    >
                      <Check size={14} color="#FFFFFF" style={{ marginRight: 4 }} />
                      <Text style={styles.btnCompleteText}>Complete</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  loadingText: {
    color: Colors.textMuted,
    fontSize: 13,
    marginTop: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
    marginTop: 14,
  },
  emptySub: {
    fontSize: 13,
    color: Colors.textSubtle,
    textAlign: 'center',
    marginTop: 4,
    maxWidth: 240,
    lineHeight: 18,
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  bookingCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.cardBorder,
    padding: 14,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  custInfo: {
    flex: 1,
    marginRight: 8,
  },
  custName: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: -0.2,
  },
  custPhone: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: Colors.cardBorder,
    marginVertical: 12,
  },
  detailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 4,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardSurface,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  detailText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  tablePrefix: {
    fontSize: 9,
    fontWeight: '800',
    color: Colors.textSubtle,
    textTransform: 'uppercase',
    marginRight: 4,
  },
  tableText: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.primary,
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.cardBorder,
  },
  btnCancel: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
  },
  btnCancelText: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.danger,
  },
  btnComplete: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Colors.success,
  },
  btnCompleteText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});

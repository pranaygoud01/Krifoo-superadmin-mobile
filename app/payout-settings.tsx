import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { Header } from '../components/Header';
import { Colors } from '../constants/colors';
import { restaurantOwnerService } from '../services/restaurant-owner.service';
import { CreditCard, ExternalLink } from 'lucide-react-native';

import { useWindowDimensions } from 'react-native';

export default function PayoutSettingsScreen() {
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  const [loading, setLoading] = useState(false);
  const [stripeStatus, setStripeStatus] = useState<'active' | 'pending' | 'inactive'>('pending');

  const loadStatus = async () => {
    setLoading(true);
    try {
      const res = await restaurantOwnerService.getRestaurantProfile();
      if (res.success && res.data) {
        if (res.data.stripeAccountStatus) {
          setStripeStatus(res.data.stripeAccountStatus);
        }
      }
    } catch (e) {
      console.error('Failed loading payout status:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const handleStripeAction = async () => {
    try {
      if (stripeStatus === 'active') {
        const res = await restaurantOwnerService.getStripeLoginLink();
        if (res.success && res.data?.url) {
          Linking.openURL(res.data.url);
        } else {
          Alert.alert('Error', 'Could not retrieve Stripe login link.');
        }
      } else {
        const res = await restaurantOwnerService.getStripeOnboardingLink();
        if (res.success && res.data?.url) {
          Linking.openURL(res.data.url);
        } else {
          Alert.alert('Error', 'Could not retrieve Stripe onboarding link.');
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <View style={styles.container}>
      <Header title="Payouts Integration (Stripe)" showBackButton={true} />

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Fetching payout integration status...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingHorizontal: isTablet ? 24 : 16, maxWidth: 840, alignSelf: 'center', width: '100%' },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.sectionCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <View style={styles.storeIconBadge}>
                <CreditCard size={20} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionHeader}>Stripe Connect Integration</Text>
                <Text style={styles.sectionSub}>Direct bank payout processing & instant settlements</Text>
              </View>
            </View>

            <View style={styles.stripeBox}>
              <View style={styles.stripeHeader}>
                <CreditCard size={20} color={stripeStatus === 'active' ? Colors.success : Colors.warning} />
                <Text style={styles.stripeTitle}>Bank Payout Connection</Text>
              </View>
              <Text style={styles.stripeDesc}>
                Payouts are handled securely via Stripe Connect. Connect your bank account to receive online order settlements.
              </Text>
              <View style={styles.stripeStatusRow}>
                <Text style={styles.statusLabel}>Setup Status: </Text>
                <View style={[styles.stripeBadge, stripeStatus === 'active' ? styles.badgeActive : styles.badgePending]}>
                  <Text style={[styles.stripeBadgeText, stripeStatus === 'active' ? { color: '#065F46' } : { color: '#92400E' }]}>
                    {stripeStatus.toUpperCase()}
                  </Text>
                </View>
              </View>

              <TouchableOpacity style={styles.stripeBtn} onPress={handleStripeAction}>
                <Text style={styles.stripeBtnText}>
                  {stripeStatus === 'active' ? 'Open Stripe Express Dashboard' : 'Complete Stripe Onboarding'}
                </Text>
                <ExternalLink size={14} color="#FFFFFF" style={{ marginLeft: 6 }} />
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
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
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: Colors.textMuted,
  },
  scrollContent: {
    padding: 16,
  },
  sectionCard: {
    backgroundColor: Colors.cardSurface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  storeIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.primaryLight,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  sectionHeader: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
  },
  sectionSub: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  stripeBox: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  stripeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  stripeTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
  },
  stripeDesc: {
    fontSize: 12,
    color: Colors.textMuted,
    lineHeight: 18,
    marginBottom: 10,
  },
  stripeStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text,
  },
  stripeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeActive: {
    backgroundColor: '#D1FAE5',
  },
  badgePending: {
    backgroundColor: '#FEF3C7',
  },
  stripeBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  stripeBtn: {
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 42,
    borderRadius: 10,
  },
  stripeBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});

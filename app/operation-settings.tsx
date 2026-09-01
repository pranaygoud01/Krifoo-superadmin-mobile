import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Header } from '../components/Header';
import { Colors } from '../constants/colors';
import { restaurantOwnerService } from '../services/restaurant-owner.service';
import { Settings2, Save } from 'lucide-react-native';

import { useWindowDimensions } from 'react-native';

export default function OperationSettingsScreen() {
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [config, setConfig] = useState({
    acceptsOnlineOrders: true,
    acceptsDining: true,
    acceptsCashOnDelivery: true,
    autoApproveOrders: false,
  });

  const loadConfig = async () => {
    setLoading(true);
    try {
      const res = await restaurantOwnerService.getRestaurantProfile();
      if (res.success && res.data) {
        const r = res.data;
        setConfig({
          acceptsOnlineOrders: r.acceptsOnlineOrders ?? true,
          acceptsDining: r.acceptsDining ?? true,
          acceptsCashOnDelivery: r.acceptsCashOnDelivery ?? true,
          autoApproveOrders: r.autoApproveOrders ?? false,
        });
      }
    } catch (e) {
      console.error('Failed loading operations settings:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  const handleToggle = (field: string, value: boolean) => {
    setConfig((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await restaurantOwnerService.updateRestaurantProfile({
        acceptsOnlineOrders: config.acceptsOnlineOrders,
        acceptsDining: config.acceptsDining,
        acceptsCashOnDelivery: config.acceptsCashOnDelivery,
        autoApproveOrders: config.autoApproveOrders,
      });

      if (res.success) {
        Alert.alert('Success', 'Acceptance and operation settings updated.');
        loadConfig();
      } else {
        Alert.alert('Error', res.message || 'Failed to save settings.');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'An error occurred while saving.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <Header title="Acceptance & Operation Settings" showBackButton={true} />

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Fetching operation parameters...</Text>
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
                <Settings2 size={20} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionHeader}>Order Acceptance Rules</Text>
                <Text style={styles.sectionSub}>Configure how your store accepts online and dining orders</Text>
              </View>
            </View>

            <View style={styles.toggleRow}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={styles.toggleTitle}>Accept Online Orders</Text>
                <Text style={styles.toggleSub}>Open store to receive new customer order requests</Text>
              </View>
              <Switch
                value={config.acceptsOnlineOrders}
                onValueChange={(val) => handleToggle('acceptsOnlineOrders', val)}
                trackColor={{ true: Colors.primaryLight, false: Colors.cardBorder }}
                thumbColor={config.acceptsOnlineOrders ? Colors.primary : Colors.textSubtle}
              />
            </View>

            <View style={styles.toggleRow}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={styles.toggleTitle}>Accept Table Bookings</Text>
                <Text style={styles.toggleSub}>Allow dine-in customers to book tables online</Text>
              </View>
              <Switch
                value={config.acceptsDining}
                onValueChange={(val) => handleToggle('acceptsDining', val)}
                trackColor={{ true: Colors.primaryLight, false: Colors.cardBorder }}
                thumbColor={config.acceptsDining ? Colors.primary : Colors.textSubtle}
              />
            </View>

            <View style={styles.toggleRow}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={styles.toggleTitle}>Accept Cash on Delivery (COD)</Text>
                <Text style={styles.toggleSub}>Allow customers to pay cash when order is delivered</Text>
              </View>
              <Switch
                value={config.acceptsCashOnDelivery}
                onValueChange={(val) => handleToggle('acceptsCashOnDelivery', val)}
                trackColor={{ true: Colors.primaryLight, false: Colors.cardBorder }}
                thumbColor={config.acceptsCashOnDelivery ? Colors.primary : Colors.textSubtle}
              />
            </View>

            <View style={[styles.toggleRow, { borderBottomWidth: 0 }]}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={styles.toggleTitle}>Auto Approve Orders</Text>
                <Text style={styles.toggleSub}>Automatically confirm orders without manual acceptance</Text>
              </View>
              <Switch
                value={config.autoApproveOrders}
                onValueChange={(val) => handleToggle('autoApproveOrders', val)}
                trackColor={{ true: Colors.primaryLight, false: Colors.cardBorder }}
                thumbColor={config.autoApproveOrders ? Colors.primary : Colors.textSubtle}
              />
            </View>
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.7 }]}
            disabled={saving}
            onPress={handleSave}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Text style={styles.saveBtnText}>Save Operation Settings</Text>
                <Save size={18} color="#FFFFFF" style={{ marginLeft: 6 }} />
              </>
            )}
          </TouchableOpacity>
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
    marginBottom: 16,
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
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  toggleTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
  },
  toggleSub: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  saveBtn: {
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 46,
    borderRadius: 12,
    marginTop: 8,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});

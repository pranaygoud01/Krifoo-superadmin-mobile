import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Header } from '../components/Header';
import { Colors } from '../constants/colors';
import { restaurantOwnerService } from '../services/restaurant-owner.service';
import { Truck, Save } from 'lucide-react-native';

import { useWindowDimensions } from 'react-native';

export default function DeliverySettingsScreen() {
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [config, setConfig] = useState({
    freeDeliveryRadius: '2',
    chargePerMile: '1',
    maxDeliveryRadius: '10',
    handlingChargesPercentage: '5.0',
  });

  const loadConfig = async () => {
    setLoading(true);
    try {
      const res = await restaurantOwnerService.getRestaurantProfile();
      if (res.success && res.data) {
        const r = res.data;
        setConfig({
          freeDeliveryRadius: (r.deliverySettings?.freeDeliveryRadius ?? 2).toString(),
          chargePerMile: (r.deliverySettings?.chargePerMile ?? 1).toString(),
          maxDeliveryRadius: (r.deliverySettings?.maxDeliveryRadius ?? 10).toString(),
          handlingChargesPercentage: (r.handlingChargesPercentage ?? 5.0).toString(),
        });
      }
    } catch (e) {
      console.error('Failed loading delivery settings:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  const handleChange = (field: string, value: string) => {
    setConfig((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await restaurantOwnerService.updateRestaurantProfile({
        handlingChargesPercentage: parseFloat(config.handlingChargesPercentage) || 0,
        deliverySettings: {
          freeDeliveryRadius: parseFloat(config.freeDeliveryRadius) || 0,
          chargePerMile: parseFloat(config.chargePerMile) || 0,
          maxDeliveryRadius: parseFloat(config.maxDeliveryRadius) || 0,
        },
      });

      if (res.success) {
        Alert.alert('Success', 'Delivery parameters updated successfully.');
        loadConfig();
      } else {
        Alert.alert('Error', res.message || 'Failed to save delivery parameters.');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'An error occurred while saving.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Header title="Delivery Parameters" showBackButton={true} />

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Fetching delivery parameters...</Text>
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
                <Truck size={20} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionHeader}>Delivery Fee & Radius Configuration</Text>
                <Text style={styles.sectionSub}>Configure rider delivery radius, per-mile rates and fees</Text>
              </View>
            </View>

            <View style={styles.rowInputs}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                <Text style={styles.label}>Free Radius (Miles)</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={config.freeDeliveryRadius}
                  onChangeText={(val) => handleChange('freeDeliveryRadius', val)}
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.label}>£ / Mile Fee</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={config.chargePerMile}
                  onChangeText={(val) => handleChange('chargePerMile', val)}
                />
              </View>
            </View>

            <View style={styles.rowInputs}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                <Text style={styles.label}>Max Radius (Miles)</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={config.maxDeliveryRadius}
                  onChangeText={(val) => handleChange('maxDeliveryRadius', val)}
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.label}>Handling Fee %</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={config.handlingChargesPercentage}
                  onChangeText={(val) => handleChange('handlingChargesPercentage', val)}
                />
              </View>
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
                <Text style={styles.saveBtnText}>Save Delivery Parameters</Text>
                <Save size={18} color="#FFFFFF" style={{ marginLeft: 6 }} />
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      )}
    </KeyboardAvoidingView>
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
  inputGroup: {
    marginBottom: 14,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textMuted,
    marginBottom: 6,
  },
  input: {
    backgroundColor: Colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    paddingHorizontal: 12,
    height: 42,
    fontSize: 13,
    color: Colors.text,
  },
  rowInputs: {
    flexDirection: 'row',
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

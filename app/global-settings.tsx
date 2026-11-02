import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Header } from '../components/Header';
import { Colors } from '../constants/colors';
import { globalSettingsService } from '../services/global-settings.service';
import { useToast } from '../context/ToastContext';
import {
  Sliders,
  Mail,
  Save,
  Percent,
  Plus,
  Trash2,
  Settings as SettingsIcon,
} from 'lucide-react-native';

export default function GlobalSettingsScreen() {
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [emails, setEmails] = useState<string[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [platformFee, setPlatformFee] = useState('0');
  const [defaultCommission, setDefaultCommission] = useState('10');

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const res = await globalSettingsService.getSettings();
      if (res.success && res.data) {
        const d = res.data;
        setEmails(Array.isArray(d.orderNotificationEmails) ? d.orderNotificationEmails : []);
        setPlatformFee(String(d.platformFee ?? 0));
        setDefaultCommission(String(d.defaultCommissionRate ?? 10));
      }
    } catch (e: any) {
      showToast({ title: 'Error', message: e.message || 'Failed to load platform settings', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleAddEmail = () => {
    const trimmed = newEmail.trim().toLowerCase();
    if (!trimmed) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      showToast({ title: 'Validation', message: 'Enter a valid email address.', type: 'error' });
      return;
    }
    if (emails.includes(trimmed)) {
      showToast({ title: 'Duplicate', message: 'Email already exists in notifications list.', type: 'info' });
      return;
    }
    setEmails([...emails, trimmed]);
    setNewEmail('');
  };

  const handleRemoveEmail = (index: number) => {
    setEmails(emails.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await globalSettingsService.updateSettings({
        orderNotificationEmails: emails,
        platformFee: parseFloat(platformFee) || 0,
        defaultCommissionRate: parseFloat(defaultCommission) || 10,
      });

      if (res.success) {
        showToast({ title: 'Saved', message: 'Global platform settings updated.', type: 'success' });
        fetchSettings();
      } else {
        showToast({ title: 'Error', message: res.message || 'Failed to save settings.', type: 'error' });
      }
    } catch (e: any) {
      showToast({ title: 'Error', message: e.message || 'Error occurred while saving.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Header title="Platform Settings" showBackButton={true} />

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading settings...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingHorizontal: isTablet ? 24 : 16, maxWidth: 840, alignSelf: 'center', width: '100%' },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* Email Notifications Card */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.iconCircle}>
                <Mail size={18} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>Order Notification Emails</Text>
                <Text style={styles.cardSubtitle}>SuperAdmin email alerts for all incoming platform orders</Text>
              </View>
            </View>

            <View style={styles.addEmailRow}>
              <TextInput
                style={styles.emailInput}
                placeholder="admin@krifoo.co.uk"
                placeholderTextColor={Colors.textSubtle}
                keyboardType="email-address"
                autoCapitalize="none"
                value={newEmail}
                onChangeText={setNewEmail}
              />
              <TouchableOpacity style={styles.addBtn} onPress={handleAddEmail}>
                <Plus size={16} color="#FFFFFF" />
                <Text style={styles.addBtnText}>Add</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.emailList}>
              {emails.length === 0 ? (
                <Text style={styles.emptyEmailText}>No notification emails registered yet.</Text>
              ) : (
                emails.map((email, idx) => (
                  <View key={idx} style={styles.emailChip}>
                    <Mail size={14} color={Colors.textSubtle} />
                    <Text style={styles.emailChipText}>{email}</Text>
                    <TouchableOpacity onPress={() => handleRemoveEmail(idx)}>
                      <Trash2 size={14} color={Colors.danger} />
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </View>
          </View>

          {/* Platform Defaults Card */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.iconCircle}>
                <Percent size={18} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>Platform Rate Defaults</Text>
                <Text style={styles.cardSubtitle}>Default commission rates and fees for new onboarded restaurants</Text>
              </View>
            </View>

            <View style={styles.formRow}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                <Text style={styles.inputLabel}>Default Commission (%)</Text>
                <TextInput
                  style={styles.textInput}
                  keyboardType="numeric"
                  value={defaultCommission}
                  onChangeText={setDefaultCommission}
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.inputLabel}>Platform Fixed Fee (£)</Text>
                <TextInput
                  style={styles.textInput}
                  keyboardType="numeric"
                  value={platformFee}
                  onChangeText={setPlatformFee}
                />
              </View>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.saveButton, saving && { opacity: 0.7 }]}
            disabled={saving}
            onPress={handleSave}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Text style={styles.saveButtonText}>Save Platform Settings</Text>
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
    color: Colors.textMuted,
    fontSize: 14,
  },
  scrollContent: {
    padding: 16,
    gap: 16,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.cardSurface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
  },
  cardSubtitle: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  addEmailRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  emailInput: {
    flex: 1,
    height: 42,
    backgroundColor: Colors.cardSurface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    paddingHorizontal: 12,
    color: Colors.text,
    fontSize: 13,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  addBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  emailList: {
    gap: 8,
  },
  emptyEmailText: {
    color: Colors.textMuted,
    fontSize: 12,
    fontStyle: 'italic',
    paddingVertical: 6,
  },
  emailChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.cardSurface,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  emailChipText: {
    flex: 1,
    marginLeft: 8,
    color: Colors.text,
    fontSize: 13,
    fontWeight: '500',
  },
  formRow: {
    flexDirection: 'row',
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  textInput: {
    backgroundColor: Colors.cardSurface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    paddingHorizontal: 12,
    height: 42,
    color: Colors.text,
    fontSize: 14,
  },
  saveButton: {
    flexDirection: 'row',
    backgroundColor: Colors.primary,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});

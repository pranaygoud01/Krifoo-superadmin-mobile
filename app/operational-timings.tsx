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
  Modal,
  TextInput,
} from 'react-native';
import { Header } from '../components/Header';
import { Colors } from '../constants/colors';
import { restaurantOwnerService } from '../services/restaurant-owner.service';
import { Clock, Save } from 'lucide-react-native';

function formatTime12h(time24?: string): string {
  if (!time24) return '09:00 AM';
  const parts = time24.split(':');
  if (parts.length < 2) return time24;
  let hours = parseInt(parts[0], 10);
  const minutes = parts[1];
  if (isNaN(hours)) return time24;
  const period = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${hours}:${minutes} ${period}`;
}

const TIME_SLOTS = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2);
  const m = i % 2 === 0 ? '00' : '30';
  const hh = h < 10 ? `0${h}` : `${h}`;
  return `${hh}:${m}`;
});

import { useWindowDimensions } from 'react-native';

export default function OperationalTimingsScreen() {
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [timings, setTimings] = useState<
    Array<{ day: string; isOpen: boolean; openTime: string; closeTime: string }>
  >([]);

  // JS Time Picker Modal State
  const [timePickerVisible, setTimePickerVisible] = useState(false);
  const [pickerDay, setPickerDay] = useState<string>('');
  const [pickerField, setPickerField] = useState<'openTime' | 'closeTime'>('openTime');
  const [customTimeInput, setCustomTimeInput] = useState('09:00');

  const loadTimings = async () => {
    setLoading(true);
    try {
      const timRes = await restaurantOwnerService.getRestaurantTimings();
      if (timRes.success && timRes.data && timRes.data.length > 0) {
        setTimings(timRes.data);
      } else {
        const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
        setTimings(
          days.map((d) => ({
            day: d,
            isOpen: true,
            openTime: '09:00',
            closeTime: '23:00',
          }))
        );
      }
    } catch (e) {
      console.error('Failed loading timings:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTimings();
  }, []);

  const handleTimingToggle = (day: string) => {
    setTimings((prev) =>
      prev.map((t) => (t.day === day ? { ...t, isOpen: !t.isOpen } : t))
    );
  };

  const openTimePickerModal = (day: string, field: 'openTime' | 'closeTime', currentVal: string) => {
    setPickerDay(day);
    setPickerField(field);
    setCustomTimeInput(currentVal || '09:00');
    setTimePickerVisible(true);
  };

  const handleSelectTimeSlot = (time24: string) => {
    if (!pickerDay) return;
    setTimings((prev) =>
      prev.map((t) => (t.day === pickerDay ? { ...t, [pickerField]: time24 } : t))
    );
    setTimePickerVisible(false);
  };

  const handleApplyMondayToAll = () => {
    const mondayTiming = timings.find((t) => t.day === 'monday');
    if (!mondayTiming) return;
    setTimings((prev) =>
      prev.map((t) => ({
        ...t,
        isOpen: mondayTiming.isOpen,
        openTime: mondayTiming.openTime,
        closeTime: mondayTiming.closeTime,
      }))
    );
    Alert.alert('Applied', 'Monday operating hours copied to all days of the week.');
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await restaurantOwnerService.updateRestaurantTimings(timings);
      if (res.success) {
        Alert.alert('Success', 'Operational timings updated successfully.');
        loadTimings();
      } else {
        Alert.alert('Error', res.message || 'Failed to save timings.');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'An error occurred while saving timings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <Header title="Operational Timings" showBackButton={true} />

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Fetching operating schedule...</Text>
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
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                <View style={styles.storeIconBadge}>
                  <Clock size={20} color={Colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionHeader}>Weekly Operating Hours</Text>
                  <Text style={styles.sectionSub}>Configure open/close hours for each day</Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.applyAllBtn}
                onPress={handleApplyMondayToAll}
                activeOpacity={0.7}
              >
                <Text style={styles.applyAllBtnText}>Copy Mon to All</Text>
              </TouchableOpacity>
            </View>

            {timings.map((t) => (
              <View key={t.day} style={styles.timingRow}>
                <View style={styles.timingLabelCol}>
                  <Text style={styles.dayName}>{t.day.toUpperCase().substring(0, 3)}</Text>
                  <Switch
                    value={t.isOpen}
                    onValueChange={() => handleTimingToggle(t.day)}
                    trackColor={{ true: Colors.primaryLight, false: Colors.cardBorder }}
                    thumbColor={t.isOpen ? Colors.primary : Colors.textSubtle}
                    style={{ transform: [{ scaleX: 0.7 }, { scaleY: 0.7 }] }}
                  />
                </View>

                {t.isOpen ? (
                  <View style={styles.timeInputsCol}>
                    <TouchableOpacity
                      style={styles.timeSelectorPill}
                      onPress={() => openTimePickerModal(t.day, 'openTime', t.openTime)}
                      activeOpacity={0.8}
                    >
                      <Clock size={12} color={Colors.primary} />
                      <Text style={styles.timeSelectorText}>{formatTime12h(t.openTime)}</Text>
                    </TouchableOpacity>
                    <Text style={styles.timeTo}>to</Text>
                    <TouchableOpacity
                      style={styles.timeSelectorPill}
                      onPress={() => openTimePickerModal(t.day, 'closeTime', t.closeTime)}
                      activeOpacity={0.8}
                    >
                      <Clock size={12} color={Colors.primary} />
                      <Text style={styles.timeSelectorText}>{formatTime12h(t.closeTime)}</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.closedCol}>
                    <Text style={styles.closedText}>CLOSED ON THIS DAY</Text>
                  </View>
                )}
              </View>
            ))}
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
                <Text style={styles.saveBtnText}>Save Timings Schedule</Text>
                <Save size={18} color="#FFFFFF" style={{ marginLeft: 6 }} />
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* JS Time Picker Modal */}
      <Modal
        visible={timePickerVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setTimePickerVisible(false)}
      >
        <TouchableOpacity
          style={styles.timeModalOverlay}
          activeOpacity={1}
          onPress={() => setTimePickerVisible(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.timeModalCard}>
            <View style={styles.timeModalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Clock size={18} color={Colors.primary} />
                <Text style={styles.timeModalTitle}>
                  Select {pickerField === 'openTime' ? 'Opening' : 'Closing'} Time
                </Text>
              </View>
              <Text style={styles.timeModalSubtitle}>
                {pickerDay.toUpperCase()} · Currently {formatTime12h(customTimeInput)}
              </Text>
            </View>

            <View style={styles.customTimeRow}>
              <TextInput
                style={styles.customTimeInput}
                placeholder="HH:mm (e.g. 09:30)"
                placeholderTextColor={Colors.textSubtle}
                value={customTimeInput}
                onChangeText={setCustomTimeInput}
              />
              <TouchableOpacity
                style={styles.customTimeApplyBtn}
                onPress={() => handleSelectTimeSlot(customTimeInput)}
              >
                <Text style={styles.customTimeApplyText}>Set</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.gridSectionTitle}>Standard Time Slots</Text>

            <ScrollView style={{ maxHeight: 260 }} contentContainerStyle={styles.timeSlotGrid}>
              {TIME_SLOTS.map((slot) => {
                const isSelected = slot === customTimeInput;
                return (
                  <TouchableOpacity
                    key={slot}
                    style={[styles.timeSlotItem, isSelected && styles.timeSlotItemSelected]}
                    onPress={() => handleSelectTimeSlot(slot)}
                  >
                    <Text style={[styles.timeSlotItemText, isSelected && styles.timeSlotItemTextSelected]}>
                      {formatTime12h(slot)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TouchableOpacity
              style={styles.timeModalCloseBtn}
              onPress={() => setTimePickerVisible(false)}
            >
              <Text style={styles.timeModalCloseText}>Cancel</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
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
  applyAllBtn: {
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  applyAllBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
  },
  timingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  timingLabelCol: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 90,
  },
  dayName: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.text,
    width: 42,
  },
  timeInputsCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  timeSelectorPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  timeSelectorText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text,
  },
  timeTo: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  closedCol: {
    paddingVertical: 4,
  },
  closedText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.danger,
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
  timeModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  timeModalCard: {
    backgroundColor: Colors.cardSurface,
    borderRadius: 16,
    padding: 16,
    width: '100%',
    maxWidth: 360,
  },
  timeModalHeader: {
    marginBottom: 12,
  },
  timeModalTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.text,
  },
  timeModalSubtitle: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  customTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  customTimeInput: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    paddingHorizontal: 10,
    height: 38,
    fontSize: 13,
    color: Colors.text,
  },
  customTimeApplyBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    height: 38,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  customTimeApplyText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  gridSectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSubtle,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  timeSlotGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  timeSlotItem: {
    width: '31%',
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    alignItems: 'center',
  },
  timeSlotItemSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  timeSlotItemText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.text,
  },
  timeSlotItemTextSelected: {
    color: '#FFFFFF',
  },
  timeModalCloseBtn: {
    marginTop: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  timeModalCloseText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textMuted,
  },
});

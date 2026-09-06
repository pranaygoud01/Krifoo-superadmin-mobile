import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Header } from '../components/Header';
import { Colors } from '../constants/colors';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { restaurantService } from '../services/restaurant.service';
import { restaurantOwnerService } from '../services/restaurant-owner.service';
import {
  Clock,
  Truck,
  Globe,
  Store,
  Check,
  ChevronDown,
  Copy,
  Info,
} from 'lucide-react-native';
import { Restaurant } from '../types';

interface DaySchedule {
  day: string;
  isOpen: boolean;
  openTime: string;
  closeTime: string;
}

const DAYS_OF_WEEK = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

const DEFAULT_SCHEDULE: DaySchedule[] = DAYS_OF_WEEK.map((d) => ({
  day: d,
  isOpen: true,
  openTime: '09:00',
  closeTime: '23:00',
}));

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

export default function OperationalTimingsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ restaurantId?: string }>();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  const isSuperAdmin = user?.userType === 'super_admin';

  // Restaurant Selection State (for SuperAdmin)
  const [restaurantsList, setRestaurantsList] = useState<Restaurant[]>([]);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<string>(params.restaurantId || '');
  const [currentRestaurantName, setCurrentRestaurantName] = useState<string>('');
  const [showPicker, setShowPicker] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'general' | 'krifoo' | 'external'>('general');

  // Timings State
  const [generalTimings, setGeneralTimings] = useState<DaySchedule[]>(DEFAULT_SCHEDULE);
  const [hasCustomDeliveryTimings, setHasCustomDeliveryTimings] = useState(false);
  const [deliveryTimings, setDeliveryTimings] = useState<DaySchedule[]>(DEFAULT_SCHEDULE);
  const [hasCustomExternalDeliveryTimings, setHasCustomExternalDeliveryTimings] = useState(false);
  const [externalDeliveryTimings, setExternalDeliveryTimings] = useState<DaySchedule[]>(DEFAULT_SCHEDULE);

  // Time Picker Modal State
  const [timePickerVisible, setTimePickerVisible] = useState(false);
  const [pickerTab, setPickerTab] = useState<'general' | 'krifoo' | 'external'>('general');
  const [pickerDay, setPickerDay] = useState<string>('');
  const [pickerField, setPickerField] = useState<'openTime' | 'closeTime'>('openTime');

  useEffect(() => {
    loadInitialData();
  }, [params.restaurantId]);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      if (isSuperAdmin) {
        const listRes = await restaurantService.getRestaurants({ limit: 100 });
        if (listRes.success && listRes.data && listRes.data.length > 0) {
          setRestaurantsList(listRes.data);
          const targetId = params.restaurantId || selectedRestaurantId || listRes.data[0]._id;
          setSelectedRestaurantId(targetId);
          const matched = listRes.data.find((r) => r._id === targetId);
          if (matched) setCurrentRestaurantName(matched.restaurantName);
          await loadTimingsForRestaurant(targetId);
        }
      } else {
        await loadOwnerTimings();
      }
    } catch (e) {
      console.error('Failed to load initial timing data:', e);
      showToast({ title: 'Error', message: 'Could not load operational timings.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const loadOwnerTimings = async () => {
    try {
      const res = await restaurantOwnerService.getRestaurantTimings();
      if (res.success && res.data) {
        applyTimingsData(res.data);
      }
    } catch (e) {
      console.error('Failed loading owner timings:', e);
    }
  };

  const loadTimingsForRestaurant = async (restId: string) => {
    try {
      const res = await restaurantService.getRestaurantTimings(restId);
      if (res.success && res.data) {
        applyTimingsData(res.data);
      }
    } catch (e) {
      console.error('Failed loading admin timings for restaurant:', e);
    }
  };

  const applyTimingsData = (data: any) => {
    const gen = data.timings && data.timings.length > 0 ? data.timings : DEFAULT_SCHEDULE;
    setGeneralTimings(ensureAllDays(gen));

    setHasCustomDeliveryTimings(data.hasCustomDeliveryTimings === true);
    const del = data.deliveryTimings && data.deliveryTimings.length > 0 ? data.deliveryTimings : gen;
    setDeliveryTimings(ensureAllDays(del));

    setHasCustomExternalDeliveryTimings(data.hasCustomExternalDeliveryTimings === true);
    const ext = data.externalDeliveryTimings && data.externalDeliveryTimings.length > 0 ? data.externalDeliveryTimings : gen;
    setExternalDeliveryTimings(ensureAllDays(ext));
  };

  const ensureAllDays = (list: DaySchedule[]) => {
    return DAYS_OF_WEEK.map((day) => {
      const existing = list.find((t) => t.day.toLowerCase() === day);
      return (
        existing || {
          day,
          isOpen: true,
          openTime: '09:00',
          closeTime: '23:00',
        }
      );
    });
  };

  const handleSelectRestaurant = async (rest: Restaurant) => {
    setSelectedRestaurantId(rest._id);
    setCurrentRestaurantName(rest.restaurantName);
    setShowPicker(false);
    setLoading(true);
    await loadTimingsForRestaurant(rest._id);
    setLoading(false);
  };

  const handleToggleDay = (day: string) => {
    if (activeTab === 'general') {
      setGeneralTimings((prev) =>
        prev.map((t) => (t.day === day ? { ...t, isOpen: !t.isOpen } : t))
      );
    } else if (activeTab === 'krifoo') {
      setDeliveryTimings((prev) =>
        prev.map((t) => (t.day === day ? { ...t, isOpen: !t.isOpen } : t))
      );
    } else {
      setExternalDeliveryTimings((prev) =>
        prev.map((t) => (t.day === day ? { ...t, isOpen: !t.isOpen } : t))
      );
    }
  };

  const openTimePicker = (tab: 'general' | 'krifoo' | 'external', day: string, field: 'openTime' | 'closeTime') => {
    setPickerTab(tab);
    setPickerDay(day);
    setPickerField(field);
    setTimePickerVisible(true);
  };

  const handleSelectTimeSlot = (time24: string) => {
    if (!pickerDay) return;
    if (pickerTab === 'general') {
      setGeneralTimings((prev) =>
        prev.map((t) => (t.day === pickerDay ? { ...t, [pickerField]: time24 } : t))
      );
    } else if (pickerTab === 'krifoo') {
      setDeliveryTimings((prev) =>
        prev.map((t) => (t.day === pickerDay ? { ...t, [pickerField]: time24 } : t))
      );
    } else {
      setExternalDeliveryTimings((prev) =>
        prev.map((t) => (t.day === pickerDay ? { ...t, [pickerField]: time24 } : t))
      );
    }
    setTimePickerVisible(false);
  };

  const handleApplyMondayToAll = () => {
    if (activeTab === 'general') {
      const mon = generalTimings.find((t) => t.day === 'monday');
      if (!mon) return;
      setGeneralTimings((prev) =>
        prev.map((t) => ({ ...t, isOpen: mon.isOpen, openTime: mon.openTime, closeTime: mon.closeTime }))
      );
    } else if (activeTab === 'krifoo') {
      const mon = deliveryTimings.find((t) => t.day === 'monday');
      if (!mon) return;
      setDeliveryTimings((prev) =>
        prev.map((t) => ({ ...t, isOpen: mon.isOpen, openTime: mon.openTime, closeTime: mon.closeTime }))
      );
    } else {
      const mon = externalDeliveryTimings.find((t) => t.day === 'monday');
      if (!mon) return;
      setExternalDeliveryTimings((prev) =>
        prev.map((t) => ({ ...t, isOpen: mon.isOpen, openTime: mon.openTime, closeTime: mon.closeTime }))
      );
    }
    showToast({ title: 'Applied', message: 'Monday schedule applied to all 7 days.', type: 'success' });
  };

  const handleCopyFromGeneral = () => {
    if (activeTab === 'krifoo') {
      setDeliveryTimings(JSON.parse(JSON.stringify(generalTimings)));
      showToast({ title: 'Copied', message: 'Krifoo delivery timings synchronized with general hours.', type: 'success' });
    } else if (activeTab === 'external') {
      setExternalDeliveryTimings(JSON.parse(JSON.stringify(generalTimings)));
      showToast({ title: 'Copied', message: 'External delivery timings synchronized with general hours.', type: 'success' });
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        timings: generalTimings,
        hasCustomDeliveryTimings,
        deliveryTimings: hasCustomDeliveryTimings ? deliveryTimings : generalTimings,
        hasCustomExternalDeliveryTimings,
        externalDeliveryTimings: hasCustomExternalDeliveryTimings
          ? externalDeliveryTimings
          : generalTimings,
      };

      let res;
      if (isSuperAdmin) {
        if (!selectedRestaurantId) {
          showToast({ title: 'No Restaurant', message: 'Please select a restaurant.', type: 'warning' });
          return;
        }
        res = await restaurantService.updateRestaurantTimings(selectedRestaurantId, payload);
      } else {
        res = await restaurantOwnerService.updateRestaurantTimings(payload);
      }

      if (res.success) {
        showToast({
          title: 'Timings Saved',
          message: 'Operating and delivery hours updated successfully.',
          type: 'success',
        });
      } else {
        showToast({ title: 'Save Failed', message: res.message || 'Could not update timings.', type: 'error' });
      }
    } catch (e: any) {
      console.error('Error saving timings:', e);
      showToast({ title: 'Error', message: e.message || 'An error occurred while saving.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const currentScheduleList =
    activeTab === 'general'
      ? generalTimings
      : activeTab === 'krifoo'
      ? deliveryTimings
      : externalDeliveryTimings;

  return (
    <View style={styles.container}>
      <Header
        title="Operating & Delivery Hours"
        showBackButton={true}
        rightElement={
          <TouchableOpacity
            style={[styles.headerSaveBtn, saving && { opacity: 0.7 }]}
            onPress={handleSave}
            disabled={saving || loading}
            activeOpacity={0.8}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <View style={styles.headerSaveBtnContent}>
                <Check size={16} color="#FFFFFF" strokeWidth={2.5} />
                <Text style={styles.headerSaveBtnText}>Save</Text>
              </View>
            )}
          </TouchableOpacity>
        }
      />

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading operational timings...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingHorizontal: isTablet ? 24 : 16, maxWidth: 840, alignSelf: 'center', width: '100%' },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* Restaurant Selector for SuperAdmin */}
          {isSuperAdmin && restaurantsList.length > 0 && (
            <View style={styles.selectorCard}>
              <Text style={styles.sectionCaption}>SELECT RESTAURANT</Text>
              <TouchableOpacity
                style={styles.pickerButton}
                onPress={() => setShowPicker(!showPicker)}
                activeOpacity={0.7}
              >
                <View style={styles.pickerContent}>
                  <Store size={18} color={Colors.primary} />
                  <Text style={styles.pickerText} numberOfLines={1}>
                    {currentRestaurantName || 'Choose Restaurant'}
                  </Text>
                </View>
                <ChevronDown size={18} color={Colors.textMuted} />
              </TouchableOpacity>

              {showPicker && (
                <View style={styles.dropdownList}>
                  {restaurantsList.map((rest) => (
                    <TouchableOpacity
                      key={rest._id}
                      style={[
                        styles.dropdownItem,
                        rest._id === selectedRestaurantId && styles.dropdownItemActive,
                      ]}
                      onPress={() => handleSelectRestaurant(rest)}
                    >
                      <Text
                        style={[
                          styles.dropdownItemText,
                          rest._id === selectedRestaurantId && styles.dropdownItemTextActive,
                        ]}
                      >
                        {rest.restaurantName}
                      </Text>
                      {rest._id === selectedRestaurantId && <Check size={16} color={Colors.primary} />}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* 3-Way Timing Channels Tab Bar */}
          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'general' && styles.tabBtnActive]}
              onPress={() => setActiveTab('general')}
              activeOpacity={0.7}
            >
              <Store
                size={15}
                color={activeTab === 'general' ? Colors.primary : Colors.textMuted}
              />
              <Text
                style={[
                  styles.tabText,
                  activeTab === 'general' && styles.tabTextActive,
                ]}
              >
                Store Hours
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'krifoo' && styles.tabBtnActive]}
              onPress={() => setActiveTab('krifoo')}
              activeOpacity={0.7}
            >
              <Truck
                size={15}
                color={activeTab === 'krifoo' ? Colors.primary : Colors.textMuted}
              />
              <Text
                style={[
                  styles.tabText,
                  activeTab === 'krifoo' && styles.tabTextActive,
                ]}
              >
                Krifoo Delivery
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'external' && styles.tabBtnActive]}
              onPress={() => setActiveTab('external')}
              activeOpacity={0.7}
            >
              <Globe
                size={15}
                color={activeTab === 'external' ? Colors.primary : Colors.textMuted}
              />
              <Text
                style={[
                  styles.tabText,
                  activeTab === 'external' && styles.tabTextActive,
                ]}
              >
                External Web
              </Text>
            </TouchableOpacity>
          </View>

          {/* TAB 1: GENERAL STORE OPERATING HOURS */}
          {activeTab === 'general' && (
            <View style={styles.bannerInfoCard}>
              <Store size={18} color={Colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.bannerInfoTitle}>Store & Dine-In Operating Hours</Text>
                <Text style={styles.bannerInfoSub}>
                  Base open/close schedule. Delivery channels follow this schedule by default unless custom timings are enabled.
                </Text>
              </View>
            </View>
          )}

          {/* TAB 2: KRIFOO APP DELIVERY TIMINGS */}
          {activeTab === 'krifoo' && (
            <View style={styles.customToggleCard}>
              <View style={styles.customToggleHeader}>
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <Text style={styles.customToggleTitle}>Separate Krifoo Delivery Timings</Text>
                  <Text style={styles.customToggleSub}>
                    Configure different delivery operating hours for the Krifoo marketplace app.
                  </Text>
                </View>
                <Switch
                  value={hasCustomDeliveryTimings}
                  onValueChange={setHasCustomDeliveryTimings}
                  trackColor={{ true: Colors.primaryLight, false: Colors.cardBorder }}
                  thumbColor={hasCustomDeliveryTimings ? Colors.primary : Colors.textSubtle}
                />
              </View>

              {!hasCustomDeliveryTimings && (
                <View style={styles.syncedNoticeBox}>
                  <Info size={14} color="#0284C7" />
                  <Text style={styles.syncedNoticeText}>
                    Currently synced with Store Operating Hours. Enable the toggle above to customize delivery hours.
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* TAB 3: EXTERNAL WEBSITE DELIVERY TIMINGS */}
          {activeTab === 'external' && (
            <View style={styles.customToggleCard}>
              <View style={styles.customToggleHeader}>
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <Text style={styles.customToggleTitle}>Separate External Website Timings</Text>
                  <Text style={styles.customToggleSub}>
                    Configure different delivery hours for direct orders placed via your standalone website.
                  </Text>
                </View>
                <Switch
                  value={hasCustomExternalDeliveryTimings}
                  onValueChange={setHasCustomExternalDeliveryTimings}
                  trackColor={{ true: Colors.primaryLight, false: Colors.cardBorder }}
                  thumbColor={hasCustomExternalDeliveryTimings ? Colors.primary : Colors.textSubtle}
                />
              </View>

              {!hasCustomExternalDeliveryTimings && (
                <View style={styles.syncedNoticeBox}>
                  <Info size={14} color="#0284C7" />
                  <Text style={styles.syncedNoticeText}>
                    Currently synced with Store Operating Hours. Enable the toggle above to customize standalone website delivery hours.
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Quick Actions Bar */}
          <View style={styles.quickActionsRow}>
            <TouchableOpacity
              style={styles.quickActionBtn}
              onPress={handleApplyMondayToAll}
              activeOpacity={0.7}
            >
              <Copy size={13} color={Colors.primary} />
              <Text style={styles.quickActionBtnText}>Apply Monday to All</Text>
            </TouchableOpacity>

            {activeTab !== 'general' && (
              <TouchableOpacity
                style={styles.quickActionBtn}
                onPress={handleCopyFromGeneral}
                activeOpacity={0.7}
              >
                <Store size={13} color={Colors.primary} />
                <Text style={styles.quickActionBtnText}>Sync with Store Hours</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Weekly 7-Day Schedule Matrix Card */}
          <View style={styles.scheduleCard}>
            <Text style={styles.scheduleCardHeaderTitle}>
              {activeTab === 'general'
                ? 'WEEKLY STORE SCHEDULE'
                : activeTab === 'krifoo'
                ? 'KRIFOO APP DELIVERY SCHEDULE'
                : 'EXTERNAL WEBSITE DELIVERY SCHEDULE'}
            </Text>

            {currentScheduleList.map((item, index) => {
              const isLast = index === currentScheduleList.length - 1;
              return (
                <View
                  key={item.day}
                  style={[styles.dayRow, !isLast && styles.dayRowBorder]}
                >
                  {/* Day Name & Toggle */}
                  <View style={styles.dayInfoCol}>
                    <Text style={styles.dayName}>{item.day.toUpperCase()}</Text>
                    <View
                      style={[
                        styles.dayStatusPill,
                        item.isOpen ? styles.dayStatusOpen : styles.dayStatusClosed,
                      ]}
                    >
                      <Text
                        style={[
                          styles.dayStatusText,
                          { color: item.isOpen ? '#065F46' : '#991B1B' },
                        ]}
                      >
                        {item.isOpen ? 'OPEN' : 'CLOSED'}
                      </Text>
                    </View>
                  </View>

                  {/* Switch Toggle */}
                  <Switch
                    value={item.isOpen}
                    onValueChange={() => handleToggleDay(item.day)}
                    trackColor={{ true: Colors.primaryLight, false: Colors.cardBorder }}
                    thumbColor={item.isOpen ? Colors.primary : Colors.textSubtle}
                  />

                  {/* Time Badges (If Open) */}
                  {item.isOpen ? (
                    <View style={styles.timesContainer}>
                      <TouchableOpacity
                        style={styles.timeBadge}
                        onPress={() => openTimePicker(activeTab, item.day, 'openTime')}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.timeLabel}>OPEN</Text>
                        <Text style={styles.timeValue}>{formatTime12h(item.openTime)}</Text>
                      </TouchableOpacity>

                      <Text style={styles.timeSeparator}>to</Text>

                      <TouchableOpacity
                        style={styles.timeBadge}
                        onPress={() => openTimePicker(activeTab, item.day, 'closeTime')}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.timeLabel}>CLOSE</Text>
                        <Text style={styles.timeValue}>{formatTime12h(item.closeTime)}</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={styles.closedPlaceholder}>
                      <Text style={styles.closedPlaceholderText}>Closed All Day</Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>

          {/* Bottom Save Action Button */}
          <TouchableOpacity
            style={[styles.bottomSaveBtn, saving && { opacity: 0.7 }]}
            onPress={handleSave}
            disabled={saving || loading}
            activeOpacity={0.8}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.bottomSaveBtnText}>Save Operational & Delivery Timings</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* Time Slot Picker Modal */}
      <Modal
        visible={timePickerVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setTimePickerVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Select {pickerField === 'openTime' ? 'Opening' : 'Closing'} Time</Text>
                <Text style={styles.modalSub}>{pickerDay ? pickerDay.toUpperCase() : ''}</Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setTimePickerVisible(false)}
              >
                <Text style={styles.modalCloseText}>Cancel</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.slotsScrollView} showsVerticalScrollIndicator={false}>
              <View style={styles.slotsGrid}>
                {TIME_SLOTS.map((slot) => (
                  <TouchableOpacity
                    key={slot}
                    style={styles.slotPill}
                    onPress={() => handleSelectTimeSlot(slot)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.slotText}>{formatTime12h(slot)}</Text>
                    <Text style={styles.slotSub}>{slot}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  headerSaveBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    marginRight: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerSaveBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerSaveBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: Colors.textMuted,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 120,
  },
  selectorCard: {
    backgroundColor: Colors.cardSurface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  sectionCaption: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.textSubtle,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: Colors.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  pickerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  pickerText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
  },
  dropdownList: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.cardBorder,
    paddingTop: 6,
    maxHeight: 180,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  dropdownItemActive: {
    backgroundColor: Colors.primaryLight,
  },
  dropdownItemText: {
    fontSize: 13,
    color: Colors.text,
    fontWeight: '500',
  },
  dropdownItemTextActive: {
    color: Colors.primary,
    fontWeight: '700',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.cardSurface,
    borderRadius: 12,
    padding: 4,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
  },
  tabBtnActive: {
    backgroundColor: Colors.primaryLight,
  },
  tabText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  tabTextActive: {
    color: Colors.primary,
    fontWeight: '800',
  },
  bannerInfoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.cardSurface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  bannerInfoTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: Colors.text,
  },
  bannerInfoSub: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
    lineHeight: 15,
  },
  customToggleCard: {
    backgroundColor: Colors.cardSurface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  customToggleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  customToggleTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: Colors.text,
  },
  customToggleSub: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
    lineHeight: 15,
  },
  syncedNoticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: 8,
    padding: 10,
    marginTop: 10,
  },
  syncedNoticeText: {
    flex: 1,
    fontSize: 11,
    color: '#0369A1',
    lineHeight: 15,
  },
  quickActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  quickActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.cardSurface,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  quickActionBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: Colors.primary,
  },
  scheduleCard: {
    backgroundColor: Colors.cardSurface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    overflow: 'hidden',
    marginBottom: 16,
  },
  scheduleCardHeaderTitle: {
    fontSize: 10.5,
    fontWeight: '800',
    color: Colors.textSubtle,
    letterSpacing: 0.5,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  dayRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  dayInfoCol: {
    width: 80,
  },
  dayName: {
    fontSize: 12.5,
    fontWeight: '800',
    color: Colors.text,
  },
  dayStatusPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginTop: 3,
  },
  dayStatusOpen: {
    backgroundColor: '#ECFDF5',
  },
  dayStatusClosed: {
    backgroundColor: '#FEF2F2',
  },
  dayStatusText: {
    fontSize: 9,
    fontWeight: '800',
  },
  timesContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
  },
  timeBadge: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    alignItems: 'center',
    minWidth: 72,
  },
  timeLabel: {
    fontSize: 8,
    fontWeight: '800',
    color: Colors.textSubtle,
  },
  timeValue: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.text,
    marginTop: 1,
  },
  timeSeparator: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  closedPlaceholder: {
    flex: 1,
    alignItems: 'flex-end',
    paddingRight: 6,
  },
  closedPlaceholderText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSubtle,
    fontStyle: 'italic',
  },
  bottomSaveBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: Colors.primary,
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  bottomSaveBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: Colors.cardSurface,
    borderRadius: 18,
    width: '100%',
    maxWidth: 420,
    maxHeight: '75%',
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.text,
  },
  modalSub: {
    fontSize: 11,
    color: Colors.primary,
    fontWeight: '700',
    marginTop: 2,
  },
  modalCloseBtn: {
    padding: 6,
  },
  modalCloseText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  slotsScrollView: {
    flexGrow: 0,
  },
  slotsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
  },
  slotPill: {
    width: '31%',
    backgroundColor: Colors.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    paddingVertical: 8,
    alignItems: 'center',
  },
  slotText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text,
  },
  slotSub: {
    fontSize: 9,
    color: Colors.textSubtle,
    marginTop: 2,
  },
});

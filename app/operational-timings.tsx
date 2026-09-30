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
  RefreshCw,
  Sparkles,
  CheckCircle2,
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

const TIME_SLOTS = [
  ...Array.from({ length: 48 }, (_, i) => {
    const h = Math.floor(i / 2);
    const m = i % 2 === 0 ? '00' : '30';
    const hh = h < 10 ? `0${h}` : `${h}`;
    return `${hh}:${m}`;
  }),
  '23:59',
];

const QUICK_PRESETS = [
  { label: '09:00 AM (Morning)', value: '09:00' },
  { label: '12:00 PM (Noon)', value: '12:00' },
  { label: '11:00 PM (Night)', value: '23:00' },
  { label: '11:59 PM (Midnight)', value: '23:59' },
];

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

  // When custom timings are off, schedule always dynamically matches Store Hours
  const isCustomActiveForCurrentTab =
    activeTab === 'general'
      ? false
      : activeTab === 'krifoo'
        ? hasCustomDeliveryTimings
        : hasCustomExternalDeliveryTimings;

  const currentScheduleList =
    activeTab === 'general'
      ? generalTimings
      : activeTab === 'krifoo'
        ? (hasCustomDeliveryTimings ? deliveryTimings : generalTimings)
        : (hasCustomExternalDeliveryTimings ? externalDeliveryTimings : generalTimings);

  const handleToggleDay = (day: string) => {
    if (activeTab === 'general') {
      setGeneralTimings((prev) =>
        prev.map((t) => (t.day === day ? { ...t, isOpen: !t.isOpen } : t))
      );
    } else if (activeTab === 'krifoo') {
      if (!hasCustomDeliveryTimings) {
        setHasCustomDeliveryTimings(true);
      }
      setDeliveryTimings((prev) => {
        const source = hasCustomDeliveryTimings ? prev : generalTimings;
        return source.map((t) => (t.day === day ? { ...t, isOpen: !t.isOpen } : t));
      });
    } else {
      if (!hasCustomExternalDeliveryTimings) {
        setHasCustomExternalDeliveryTimings(true);
      }
      setExternalDeliveryTimings((prev) => {
        const source = hasCustomExternalDeliveryTimings ? prev : generalTimings;
        return source.map((t) => (t.day === day ? { ...t, isOpen: !t.isOpen } : t));
      });
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
      if (!hasCustomDeliveryTimings) {
        setHasCustomDeliveryTimings(true);
      }
      setDeliveryTimings((prev) => {
        const source = hasCustomDeliveryTimings ? prev : generalTimings;
        return source.map((t) => (t.day === pickerDay ? { ...t, [pickerField]: time24 } : t));
      });
    } else {
      if (!hasCustomExternalDeliveryTimings) {
        setHasCustomExternalDeliveryTimings(true);
      }
      setExternalDeliveryTimings((prev) => {
        const source = hasCustomExternalDeliveryTimings ? prev : generalTimings;
        return source.map((t) => (t.day === pickerDay ? { ...t, [pickerField]: time24 } : t));
      });
    }
    setTimePickerVisible(false);
  };

  const handleApplyMondayToAll = () => {
    const list = currentScheduleList;
    const mon = list.find((t) => t.day === 'monday');
    if (!mon) return;

    if (activeTab === 'general') {
      setGeneralTimings((prev) =>
        prev.map((t) => ({ ...t, isOpen: mon.isOpen, openTime: mon.openTime, closeTime: mon.closeTime }))
      );
    } else if (activeTab === 'krifoo') {
      setHasCustomDeliveryTimings(true);
      setDeliveryTimings((prev) =>
        prev.map((t) => ({ ...t, isOpen: mon.isOpen, openTime: mon.openTime, closeTime: mon.closeTime }))
      );
    } else {
      setHasCustomExternalDeliveryTimings(true);
      setExternalDeliveryTimings((prev) =>
        prev.map((t) => ({ ...t, isOpen: mon.isOpen, openTime: mon.openTime, closeTime: mon.closeTime }))
      );
    }
    showToast({ title: 'Applied', message: 'Monday schedule applied to all 7 days.', type: 'success' });
  };

  // Sync current channel with latest store hours
  const handleCopyFromGeneral = () => {
    const freshCopy = JSON.parse(JSON.stringify(generalTimings));
    if (activeTab === 'krifoo') {
      setDeliveryTimings(freshCopy);
      setHasCustomDeliveryTimings(true);
      showToast({
        title: 'Timings Synchronized! ⏱️',
        message: 'Krifoo delivery hours updated to match current Store Hours.',
        type: 'success',
      });
    } else if (activeTab === 'external') {
      setExternalDeliveryTimings(freshCopy);
      setHasCustomExternalDeliveryTimings(true);
      showToast({
        title: 'Timings Synchronized! ⏱️',
        message: 'External website hours updated to match current Store Hours.',
        type: 'success',
      });
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

  const getCurrentActiveSlot = (): string => {
    if (!pickerDay) return '';
    const list =
      pickerTab === 'general'
        ? generalTimings
        : pickerTab === 'krifoo'
          ? (hasCustomDeliveryTimings ? deliveryTimings : generalTimings)
          : (hasCustomExternalDeliveryTimings ? externalDeliveryTimings : generalTimings);
    const dayItem = list.find((t) => t.day === pickerDay);
    return dayItem ? dayItem[pickerField] : '';
  };

  return (
    <View style={styles.container}>
      <Header
        title="Operating Hours"
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

      {/* Pinned Channels Segmented Tab Control */}
      <View style={[styles.pinnedTabBar, { paddingHorizontal: isTablet ? 24 : 16 }]}>
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
              numberOfLines={1}
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
              numberOfLines={1}
            >
              Krifoo Delivery
            </Text>
            {hasCustomDeliveryTimings && <View style={styles.tabBadgeDot} />}
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
              numberOfLines={1}
            >
              External Web
            </Text>
            {hasCustomExternalDeliveryTimings && <View style={styles.tabBadgeDot} />}
          </TouchableOpacity>
        </View>
      </View>

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

          {/* TAB 1: GENERAL STORE OPERATING HOURS */}
          {activeTab === 'general' && (
            <View style={styles.bannerInfoCard}>
                <Store size={20} color={Colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.bannerInfoTitle}>Store & Dine-In Operating Hours</Text>
                <Text style={styles.bannerInfoSub}>
                    Base master schedule. All delivery channels automatically follow these hours in real time unless separate custom hours are toggled on.
                </Text>
              </View>
            </View>
          )}

          {/* TAB 2: KRIFOO APP DELIVERY TIMINGS */}
          {activeTab === 'krifoo' && (
            <View style={styles.customToggleCard}>
              <View style={styles.customToggleHeader}>
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <Text style={styles.customToggleTitle}>Krifoo Delivery Timings</Text>
                      {hasCustomDeliveryTimings ? (
                        <View style={styles.activeCustomBadge}>
                          <Sparkles size={11} color="#D97706" />
                          <Text style={styles.activeCustomBadgeText}>Custom Active</Text>
                        </View>
                      ) : (
                        <View style={styles.liveSyncBadge}>
                          <CheckCircle2 size={11} color="#059669" />
                          <Text style={styles.liveSyncBadgeText}>Live Synced</Text>
                        </View>
                      )}
                    </View>
                  <Text style={styles.customToggleSub}>
                      {hasCustomDeliveryTimings
                        ? 'Custom delivery hours are active for Krifoo app. Toggle off to auto-sync with Store Hours.'
                        : 'Delivery follows Store Hours automatically. Any updates to Store Hours reflect here live.'}
                  </Text>
                </View>
                <Switch
                  value={hasCustomDeliveryTimings}
                    onValueChange={(val) => {
                      setHasCustomDeliveryTimings(val);
                      if (val && (!deliveryTimings || deliveryTimings.length === 0)) {
                        setDeliveryTimings(JSON.parse(JSON.stringify(generalTimings)));
                      }
                    }}
                  trackColor={{ true: Colors.primaryLight, false: Colors.cardBorder }}
                  thumbColor={hasCustomDeliveryTimings ? Colors.primary : Colors.textSubtle}
                />
              </View>

              {!hasCustomDeliveryTimings && (
                <View style={styles.syncedNoticeBox}>
                  <Info size={14} color="#0284C7" />
                  <Text style={styles.syncedNoticeText}>
                      Showing live Store Hours below. Changes made to Store Hours will reflect here automatically.
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* TAB 3: EXTERNAL WEBSITE DELIVERY TIMINGS */}
          {activeTab === 'external' && (
            <View style={styles.customToggleCard}>
              <View style={styles.customToggleHeader}>
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <Text style={styles.customToggleTitle}>External Website Timings</Text>
                      {hasCustomExternalDeliveryTimings ? (
                        <View style={styles.activeCustomBadge}>
                          <Sparkles size={11} color="#D97706" />
                          <Text style={styles.activeCustomBadgeText}>Custom Active</Text>
                        </View>
                      ) : (
                        <View style={styles.liveSyncBadge}>
                          <CheckCircle2 size={11} color="#059669" />
                          <Text style={styles.liveSyncBadgeText}>Live Synced</Text>
                        </View>
                      )}
                    </View>
                  <Text style={styles.customToggleSub}>
                      {hasCustomExternalDeliveryTimings
                        ? 'Custom delivery hours active for your direct website. Toggle off to auto-sync with Store Hours.'
                        : 'External delivery follows Store Hours automatically. Updates to Store Hours reflect here live.'}
                  </Text>
                </View>
                <Switch
                  value={hasCustomExternalDeliveryTimings}
                    onValueChange={(val) => {
                      setHasCustomExternalDeliveryTimings(val);
                      if (val && (!externalDeliveryTimings || externalDeliveryTimings.length === 0)) {
                        setExternalDeliveryTimings(JSON.parse(JSON.stringify(generalTimings)));
                      }
                    }}
                  trackColor={{ true: Colors.primaryLight, false: Colors.cardBorder }}
                  thumbColor={hasCustomExternalDeliveryTimings ? Colors.primary : Colors.textSubtle}
                />
              </View>

              {!hasCustomExternalDeliveryTimings && (
                <View style={styles.syncedNoticeBox}>
                  <Info size={14} color="#0284C7" />
                  <Text style={styles.syncedNoticeText}>
                      Showing live Store Hours below. Changes made to Store Hours will reflect here automatically.
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
                  style={[styles.quickActionBtn, styles.quickActionBtnSync]}
                onPress={handleCopyFromGeneral}
                activeOpacity={0.7}
              >
                  <RefreshCw size={13} color="#0284C7" />
                  <Text style={[styles.quickActionBtnText, { color: '#0284C7' }]}>
                    Sync with Store Hours
                  </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Weekly 7-Day Schedule Matrix Card */}
          <View style={styles.scheduleCard}>
              <View style={styles.scheduleCardHeader}>
                <Text style={styles.scheduleCardHeaderTitle}>
                  {activeTab === 'general'
                    ? 'WEEKLY STORE SCHEDULE'
                    : activeTab === 'krifoo'
                      ? 'KRIFOO APP DELIVERY SCHEDULE'
                      : 'EXTERNAL WEBSITE DELIVERY SCHEDULE'}
                </Text>
                {activeTab !== 'general' && !isCustomActiveForCurrentTab && (
                  <View style={styles.liveBadgeMini}>
                    <Text style={styles.liveBadgeMiniText}>Auto-Synced</Text>
                  </View>
                )}
              </View>

            {currentScheduleList.map((item, index) => {
              const isLast = index === currentScheduleList.length - 1;
              return (
                <View
                  key={item.day}
                  style={[styles.dayRow, !isLast && styles.dayRowBorder]}
                >
                  {/* Day Name & Status */}
                  <View style={styles.dayInfoCol}>
                    <Text
                      style={styles.dayName}
                      numberOfLines={1}
                      adjustsFontSizeToFit={true}
                      minimumFontScale={0.8}
                    >
                      {item.day.toUpperCase()}
                    </Text>
                    <View
                      style={[
                        styles.dayStatusPill,
                        item.isOpen ? styles.dayStatusOpen : styles.dayStatusClosed,
                      ]}
                    >
                      <View
                        style={[
                          styles.statusDot,
                          { backgroundColor: item.isOpen ? '#059669' : '#DC2626' },
                        ]}
                      />
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
                        <Text style={[styles.timeLabel, { color: '#059669' }]}>OPEN</Text>
                        <View style={styles.timeValGroup}>
                          <Text style={styles.timeValue}>{formatTime12h(item.openTime)}</Text>
                          <ChevronDown size={11} color={Colors.textMuted} />
                        </View>
                      </TouchableOpacity>

                      <Text style={styles.timeSeparator}>to</Text>

                      <TouchableOpacity
                        style={styles.timeBadge}
                        onPress={() => openTimePicker(activeTab, item.day, 'closeTime')}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.timeLabel, { color: '#DC2626' }]}>CLOSE</Text>
                        <View style={styles.timeValGroup}>
                          <Text style={styles.timeValue}>{formatTime12h(item.closeTime)}</Text>
                          <ChevronDown size={11} color={Colors.textMuted} />
                        </View>
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
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Check size={18} color="#FFFFFF" strokeWidth={2.5} />
                    <Text style={styles.bottomSaveBtnText}>Save Operational & Delivery Timings</Text>
                  </View>
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
                <Text style={styles.modalTitle}>
                  Select {pickerField === 'openTime' ? 'Opening' : 'Closing'} Time
                </Text>
                <Text style={styles.modalSub}>
                  {pickerDay ? pickerDay.toUpperCase() : ''} • {formatTime12h(getCurrentActiveSlot())}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setTimePickerVisible(false)}
              >
                <Text style={styles.modalCloseText}>Done</Text>
              </TouchableOpacity>
            </View>

            {/* Quick Presets */}
            <View style={styles.presetsWrap}>
              <Text style={styles.presetsLabel}>QUICK PRESETS</Text>
              <View style={styles.presetsRow}>
                {QUICK_PRESETS.map((p) => {
                  const isActive = getCurrentActiveSlot() === p.value;
                  return (
                    <TouchableOpacity
                      key={p.value}
                      style={[styles.presetChip, isActive && styles.presetChipActive]}
                      onPress={() => handleSelectTimeSlot(p.value)}
                    >
                      <Text style={[styles.presetChipText, isActive && styles.presetChipTextActive]}>
                        {p.value === '23:59' ? '11:59 PM' : formatTime12h(p.value)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Grid of Slots */}
            <ScrollView style={styles.slotsScrollView} showsVerticalScrollIndicator={false}>
              <View style={styles.slotsGrid}>
                {TIME_SLOTS.map((slot) => {
                  const isSelected = getCurrentActiveSlot() === slot;
                  return (
                    <TouchableOpacity
                      key={slot}
                      style={[styles.slotPill, isSelected && styles.slotPillSelected]}
                      onPress={() => handleSelectTimeSlot(slot)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.slotText, isSelected && styles.slotTextSelected]}>
                        {formatTime12h(slot)}
                      </Text>
                      <Text style={[styles.slotSub, isSelected && styles.slotSubSelected]}>
                        {slot}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
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
    paddingVertical: 7,
    borderRadius: 8,
    marginRight: 6,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  headerSaveBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  headerSaveBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },
  pinnedTabBar: {
    backgroundColor: Colors.cardSurface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
    paddingVertical: 8,
    zIndex: 10,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.background,
    borderRadius: 12,
    padding: 4,
    gap: 4,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    paddingHorizontal: 6,
    borderRadius: 9,
    gap: 6,
    position: 'relative',
  },
  tabBtnActive: {
    backgroundColor: Colors.cardSurface,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  tabTextActive: {
    color: Colors.primary,
    fontWeight: '800',
  },
  tabBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#D97706',
    position: 'absolute',
    top: 6,
    right: 6,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 13,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  scrollContent: {
    paddingVertical: 14,
    paddingBottom: 40,
  },
  selectorCard: {
    backgroundColor: Colors.cardSurface,
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  sectionCaption: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.textSubtle,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
  pickerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  pickerText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
  },
  dropdownList: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.cardBorder,
    paddingTop: 6,
    maxHeight: 200,
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
    backgroundColor: '#FFF7ED',
  },
  dropdownItemText: {
    fontSize: 12.5,
    color: Colors.text,
    fontWeight: '600',
  },
  dropdownItemTextActive: {
    color: Colors.primary,
    fontWeight: '800',
  },
  bannerInfoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  bannerInfoTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#9A3412',
    marginBottom: 3,
  },
  bannerInfoSub: {
    fontSize: 11.5,
    color: '#7C2D12',
    lineHeight: 16,
  },
  customToggleCard: {
    backgroundColor: Colors.cardSurface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 14,
    marginBottom: 12,
  },
  customToggleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  customToggleTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: Colors.text,
  },
  customToggleSub: {
    fontSize: 11.5,
    color: Colors.textMuted,
    lineHeight: 16,
    marginTop: 3,
  },
  activeCustomBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  activeCustomBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#92400E',
  },
  liveSyncBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  liveSyncBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#065F46',
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
  quickActionBtnSync: {
    backgroundColor: '#F0F9FF',
    borderColor: '#BAE6FD',
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  scheduleCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  scheduleCardHeaderTitle: {
    fontSize: 10.5,
    fontWeight: '800',
    color: Colors.textSubtle,
    letterSpacing: 0.5,
  },
  liveBadgeMini: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  liveBadgeMiniText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#059669',
  },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  dayRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  dayInfoCol: {
    width: 96,
    marginRight: 4,
  },
  dayName: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.text,
  },
  dayStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginTop: 3,
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  dayStatusOpen: {
    backgroundColor: '#ECFDF5',
  },
  dayStatusClosed: {
    backgroundColor: '#FEF2F2',
  },
  dayStatusText: {
    fontSize: 8.5,
    fontWeight: '800',
  },
  timesContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 2,
  },
  timeBadge: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    alignItems: 'center',
    minWidth: 78,
  },
  timeLabel: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  timeValGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 1,
  },
  timeValue: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.text,
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
    elevation: 3,
    shadowColor: Colors.primary,
    shadowOpacity: 0.3,
    shadowRadius: 8,
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
    maxHeight: '80%',
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
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
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
  },
  modalCloseText: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.primary,
  },
  presetsWrap: {
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  presetsLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    color: Colors.textSubtle,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  presetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  presetChip: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 7,
  },
  presetChipActive: {
    backgroundColor: Colors.primaryLight,
    borderColor: Colors.primary,
  },
  presetChipText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: Colors.text,
  },
  presetChipTextActive: {
    color: Colors.primary,
    fontWeight: '800',
  },
  slotsScrollView: {
    flexGrow: 0,
    maxHeight: 280,
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
  slotPillSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  slotText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: Colors.text,
  },
  slotTextSelected: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  slotSub: {
    fontSize: 9,
    color: Colors.textSubtle,
    marginTop: 2,
  },
  slotSubSelected: {
    color: 'rgba(255, 255, 255, 0.85)',
  },
});

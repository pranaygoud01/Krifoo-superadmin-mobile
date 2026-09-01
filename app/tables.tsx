import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  Switch,
  ActivityIndicator,
  Alert,
  ScrollView,
  RefreshControl,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors } from '../constants/colors';
import { restaurantOwnerService } from '../services/restaurant-owner.service';
import { DiningTable } from '../types';
import {
  ArrowLeft,
  Plus,
  Edit2,
  Trash2,
  X,
  Check,
  Users,
  Calendar,
  Clock,
  MapPin,
  RefreshCw,
  Search,
  Sparkles,
  ChevronRight,
  ChevronDown,
  ChevronUp,
} from 'lucide-react-native';

const AREAS = ['Indoor', 'Outdoor', 'Rooftop', 'AC Lounge', 'Terrace', 'Bar & Counter', 'VIP Lounge', 'Garden', 'Balcony', 'Private Dining'];

const TIME_PICKER_OPTIONS = [
  { value: '06:00', label: '06:00 AM' },
  { value: '07:00', label: '07:00 AM' },
  { value: '08:00', label: '08:00 AM' },
  { value: '09:00', label: '09:00 AM' },
  { value: '10:00', label: '10:00 AM' },
  { value: '11:00', label: '11:00 AM' },
  { value: '12:00', label: '12:00 PM' },
  { value: '13:00', label: '01:00 PM (13:00)' },
  { value: '14:00', label: '02:00 PM (14:00)' },
  { value: '15:00', label: '03:00 PM (15:00)' },
  { value: '16:00', label: '04:00 PM (16:00)' },
  { value: '17:00', label: '05:00 PM (17:00)' },
  { value: '18:00', label: '06:00 PM (18:00)' },
  { value: '19:00', label: '07:00 PM (19:00)' },
  { value: '20:00', label: '08:00 PM (20:00)' },
  { value: '21:00', label: '09:00 PM (21:00)' },
  { value: '22:00', label: '10:00 PM (22:00)' },
  { value: '23:00', label: '11:00 PM (23:00)' },
  { value: '00:00', label: '12:00 AM (Midnight)' },
];

function getTimeLabel(val: string) {
  const match = TIME_PICKER_OPTIONS.find((o) => o.value === val);
  return match ? match.label : val;
}

const TIME_PRESETS = [
  { label: 'Lunch & Dinner', start: '11:00', end: '23:00' },
  { label: 'Dinner Only', start: '17:00', end: '23:00' },
  { label: 'Lunch Only', start: '11:00', end: '16:00' },
  { label: 'All Day', start: '09:00', end: '23:00' },
];

const TIME_OPTIONS = [
  '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00',
  '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00', '23:00',
];

// Helper to format date string YYYY-MM-DD
function formatDateISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Generate the next 7 days for the date selector strip
function getUpcomingDays() {
  const days = [];
  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(today.getDate() + i);
    days.push({
      iso: formatDateISO(d),
      dayName: i === 0 ? 'Today' : i === 1 ? 'Tmrw' : d.toLocaleDateString('en-US', { weekday: 'short' }),
      dayNumber: d.getDate(),
      monthName: d.toLocaleDateString('en-US', { month: 'short' }),
      fullDate: d,
    });
  }
  return days;
}

// Generate slots array from start and end time
function generateHourlySlots(start: string, end: string): string[] {
  const slots: string[] = [];
  const startH = parseInt(start.split(':')[0], 10);
  const endH = parseInt(end.split(':')[0], 10);
  if (isNaN(startH) || isNaN(endH) || endH <= startH) return slots;

  for (let h = startH; h < endH; h++) {
    slots.push(`${String(h).padStart(2, '0')}:00`);
  }
  return slots;
}

export default function TablesScreen() {
  const router = useRouter();
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const upcomingDays = useMemo(() => getUpcomingDays(), []);
  const [selectedDateFilter, setSelectedDateFilter] = useState<string>('all');
  const [selectedAreaFilter, setSelectedAreaFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingTable, setEditingTable] = useState<DiningTable | null>(null);

  // Form State
  const [formTableNumber, setFormTableNumber] = useState('');
  const [formCapacity, setFormCapacity] = useState('4');
  const [formArea, setFormArea] = useState('Indoor');
  const [formDate, setFormDate] = useState(upcomingDays[0].iso);
  const [formStartTime, setFormStartTime] = useState('11:00');
  const [formEndTime, setFormEndTime] = useState('23:00');
  const [formBookingPrice, setFormBookingPrice] = useState('0');
  const [formMaxHours, setFormMaxHours] = useState('2');
  const [applyMultiDays, setApplyMultiDays] = useState(false);
  const [multiDaysCount, setMultiDaysCount] = useState(3);
  const [pickerModalType, setPickerModalType] = useState<'area' | 'startTime' | 'endTime' | null>(null);

  const loadTables = async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const res = await restaurantOwnerService.getTables();
      if (res.success && res.data) {
        setTables(res.data);
      }
    } catch (e) {
      console.error('Failed loading tables:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadTables();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadTables(true);
  };

  const openAddModal = (presetDate?: string) => {
    setEditingTable(null);
    setFormTableNumber('');
    setFormCapacity('4');
    setFormArea('Indoor');
    setFormDate(presetDate && presetDate !== 'all' ? presetDate : upcomingDays[0].iso);
    setFormStartTime('11:00');
    setFormEndTime('23:00');
    setFormBookingPrice('0');
    setFormMaxHours('2');
    setApplyMultiDays(false);
    setModalVisible(true);
  };

  const openEditModal = (table: DiningTable) => {
    setEditingTable(table);
    setFormTableNumber(table.tableNumber);
    setFormCapacity(String(table.capacity));
    setFormArea(table.area || 'Indoor');
    const tableDateIso = table.date ? formatDateISO(new Date(table.date)) : upcomingDays[0].iso;
    setFormDate(tableDateIso);
    if (table.availableHours && table.availableHours.length > 0) {
      setFormStartTime(table.availableHours[0]);
      const lastSlotH = parseInt(table.availableHours[table.availableHours.length - 1].split(':')[0], 10) + 1;
      setFormEndTime(`${String(lastSlotH).padStart(2, '0')}:00`);
    } else {
      setFormStartTime('11:00');
      setFormEndTime('23:00');
    }
    setFormBookingPrice(String(table.bookingPrice || 0));
    setFormMaxHours(String(table.maxBookingHours || 2));
    setApplyMultiDays(false);
    setModalVisible(true);
  };

  const handleToggleStatus = async (table: DiningTable) => {
    try {
      const res = await restaurantOwnerService.toggleTableStatus(table._id);
      if (res.success) {
        setTables((prev) =>
          prev.map((t) => (t._id === table._id ? { ...t, isActive: !t.isActive } : t))
        );
      } else {
        Alert.alert('Error', res.message || 'Failed to update table status.');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteTable = async (tableId: string) => {
    Alert.alert('Confirm Delete', 'Are you sure you want to remove this dining table?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const res = await restaurantOwnerService.deleteTable(tableId);
          if (res.success) {
            Alert.alert('Success', 'Dining table removed successfully.');
            loadTables(true);
          } else {
            Alert.alert('Error', res.message || 'Failed to delete table.');
          }
        },
      },
    ]);
  };

  const handleSaveTable = async () => {
    if (!formTableNumber.trim()) {
      return Alert.alert('Required Field', 'Please enter a Table Number or Name (e.g. Table 4).');
    }
    const cap = parseInt(formCapacity, 10);
    if (isNaN(cap) || cap <= 0) {
      return Alert.alert('Invalid Capacity', 'Guest seating capacity must be at least 1.');
    }

    const slots = generateHourlySlots(formStartTime, formEndTime);
    if (slots.length === 0) {
      return Alert.alert('Invalid Time Range', 'End time must be after Start time.');
    }

    setSubmitting(true);
    try {
      if (editingTable) {
        const payload = {
          tableNumber: formTableNumber.trim(),
          capacity: cap,
          area: formArea,
          bookingPrice: Number(formBookingPrice) || 0,
          maxBookingHours: Number(formMaxHours) || 2,
        };
        const res = await restaurantOwnerService.updateTable(editingTable._id, payload);
        if (res.success) {
          setModalVisible(false);
          loadTables(true);
        } else {
          Alert.alert('Error', res.message || 'Failed to update table details.');
        }
      } else {
        const datesToCreate = [formDate];
        if (applyMultiDays && multiDaysCount > 1) {
          const baseDate = new Date(formDate);
          for (let i = 1; i < multiDaysCount; i++) {
            const nextD = new Date(baseDate);
            nextD.setDate(baseDate.getDate() + i);
            datesToCreate.push(formatDateISO(nextD));
          }
        }

        let successCount = 0;
        let lastError = '';

        for (const targetDate of datesToCreate) {
          const payload = {
            tableNumber: formTableNumber.trim(),
            capacity: cap,
            area: formArea,
            date: targetDate,
            startTime: formStartTime,
            endTime: formEndTime,
            bookingPrice: Number(formBookingPrice) || 0,
            maxBookingHours: Number(formMaxHours) || 2,
          };

          const res = await restaurantOwnerService.addTable(payload);
          if (res.success) {
            successCount++;
          } else {
            lastError = res.message || 'Failed to add table for ' + targetDate;
          }
        }

        if (successCount > 0) {
          setModalVisible(false);
          loadTables(true);
          if (successCount === datesToCreate.length) {
            Alert.alert(
              'Success',
              datesToCreate.length > 1
                ? `Successfully posted Table ${formTableNumber} for ${successCount} consecutive days with ${slots.length} time slots each.`
                : `Successfully posted Table ${formTableNumber} with ${slots.length} time slots.`
            );
          } else {
            Alert.alert(
              'Partial Success',
              `Created table for ${successCount} day(s). Some dates failed: ${lastError}`
            );
          }
        } else {
          Alert.alert('Error', lastError || 'Failed to save table details.');
        }
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'An unexpected error occurred.');
    } finally {
      setSubmitting(false);
    }
  };

  // Filtered Tables
  const filteredTables = useMemo(() => {
    return tables.filter((t) => {
      if (!t) return false;
      const tNum = (t.tableNumber || '').toLowerCase();
      const tArea = (t.area || '').toLowerCase();

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        if (!tNum.includes(q) && !tArea.includes(q)) return false;
      }

      if (selectedDateFilter !== 'all') {
        const tableDateIso = t.date ? formatDateISO(new Date(t.date)) : '';
        if (tableDateIso !== selectedDateFilter) return false;
      }

      if (selectedAreaFilter !== 'all' && (t.area || 'Indoor') !== selectedAreaFilter) {
        return false;
      }

      return true;
    });
  }, [tables, searchQuery, selectedDateFilter, selectedAreaFilter]);

  // Counts by date
  const dateCounts = useMemo(() => {
    const map: Record<string, number> = { all: tables.length };
    tables.forEach((t) => {
      const iso = t.date ? formatDateISO(new Date(t.date)) : '';
      if (iso) {
        map[iso] = (map[iso] || 0) + 1;
      }
    });
    return map;
  }, [tables]);

  const activeTablesCount = useMemo(() => {
    return tables.filter((t) => t.isActive).length;
  }, [tables]);

  const totalSlotsCount = useMemo(() => {
    return filteredTables.reduce((sum, t) => sum + (t.availableHours?.length || 0), 0);
  }, [filteredTables]);

  const generatedSlotsPreview = useMemo(() => {
    return generateHourlySlots(formStartTime, formEndTime);
  }, [formStartTime, formEndTime]);

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
              <Text style={styles.pageTitle}>Dining Tables</Text>
              <View style={styles.liveBadge}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>Configured</Text>
              </View>
            </View>
            <Text style={styles.pageSubtitle}>
              {filteredTables.length} table{filteredTables.length !== 1 ? 's' : ''} ({activeTablesCount} active, {totalSlotsCount} open slots)
            </Text>
          </View>
        </View>

        <View style={styles.headerRightControls}>
          {/* <TouchableOpacity
            style={styles.addTableHeaderBtn}
            onPress={() => openAddModal(selectedDateFilter)}
            activeOpacity={0.8}
          >
            <Plus size={14} color="#FFFFFF" />
            <Text style={styles.addTableHeaderBtnText}>Add Table</Text>
          </TouchableOpacity> */}

          <TouchableOpacity style={styles.refreshBtn} onPress={onRefresh} activeOpacity={0.7}>
            <RefreshCw size={16} color={Colors.textSubtle} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Date Strip Navigation (Upcoming 7 Days with Pinned Side All Dates Arrow Button) */}
      <View style={styles.dateStripContainer}>
        {/* Pinned All Dates side button with arrow */}
        <TouchableOpacity
          style={[
            styles.datePillSide,
            selectedDateFilter === 'all' && styles.datePillSideActive,
          ]}
          onPress={() => setSelectedDateFilter('all')}
          activeOpacity={0.7}
        >
          <View style={styles.datePillSideLeft}>
            <Calendar size={12} color={selectedDateFilter === 'all' ? '#FFFFFF' : '#FF5C39'} />
            <Text style={[styles.datePillSideTitle, selectedDateFilter === 'all' && styles.datePillSideTitleActive]}>
              All
            </Text>
          </View>
          <View
            style={[
              styles.datePillSideBadge,
              selectedDateFilter === 'all' ? styles.datePillSideBadgeActive : { backgroundColor: '#FF5C39' },
            ]}
          >
            <Text
              style={[
                styles.datePillSideBadgeText,
                selectedDateFilter === 'all' && { color: '#11181C' },
              ]}
            >
              {dateCounts['all'] || 0}
            </Text>
          </View>
          <ChevronRight
            size={13}
            color={selectedDateFilter === 'all' ? '#FFFFFF' : '#9BA1A6'}
          />
        </TouchableOpacity>

        <View style={styles.dateStripDivider} />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.dateStripContent}
        >

          {upcomingDays.map((day) => {
            const isSelected = selectedDateFilter === day.iso;
            const count = dateCounts[day.iso] || 0;
            return (
              <TouchableOpacity
                key={day.iso}
                style={[
                  styles.dateDayPill,
                  isSelected && styles.dateDayPillActive,
                ]}
                onPress={() => setSelectedDateFilter(day.iso)}
                activeOpacity={0.7}
              >
                <Text style={[styles.dayNameText, isSelected && styles.dayNameTextActive]}>
                  {day.dayName}
                </Text>
                <Text style={[styles.dayNumText, isSelected && styles.dayNumTextActive]}>
                  {day.dayNumber} {day.monthName}
                </Text>
                <View
                  style={[
                    styles.dayCountBadge,
                    isSelected ? styles.dayCountBadgeActive : { backgroundColor: '#F1F5F9' },
                  ]}
                >
                  <Text
                    style={[
                      styles.dayCountText,
                      isSelected ? { color: '#11181C' } : { color: count > 0 ? '#FF5C39' : '#94A3B8' },
                    ]}
                  >
                    {count} {count === 1 ? 'tbl' : 'tbls'}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Controls: Search and Area Sub-Filter */}
      <View style={styles.controlsRow}>
        <View style={styles.searchBox}>
          <Search size={14} color={Colors.textSubtle} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search table number or area..."
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

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.areaFilters}>
          <TouchableOpacity
            style={[styles.areaChip, selectedAreaFilter === 'all' && styles.areaChipActive]}
            onPress={() => setSelectedAreaFilter('all')}
            activeOpacity={0.7}
          >
            <Text style={[styles.areaChipText, selectedAreaFilter === 'all' && styles.areaChipTextActive]}>
              All Areas
            </Text>
          </TouchableOpacity>
          {AREAS.map((area) => (
            <TouchableOpacity
              key={area}
              style={[styles.areaChip, selectedAreaFilter === area && styles.areaChipActive]}
              onPress={() => setSelectedAreaFilter(area)}
              activeOpacity={0.7}
            >
              <Text style={[styles.areaChipText, selectedAreaFilter === area && styles.areaChipTextActive]}>
                {area}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Table Items Feed */}
      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color="#FF5C39" />
          <Text style={styles.loadingText}>Fetching dining tables...</Text>
        </View>
      ) : filteredTables.length === 0 ? (
        <View style={styles.centerBox}>
            <Users size={48} color="#EEEEEE" />
            <Text style={styles.emptyTitle}>No Dining Tables Found</Text>
          <Text style={styles.emptySub}>
              {selectedDateFilter !== 'all'
                ? `No tables posted for ${selectedDateFilter}. Tap below to configure tables for this date.`
                : 'Add tables with time slots, guest capacities and dining areas to enable table reservations.'}
          </Text>
            <TouchableOpacity
              style={styles.emptyAddBtn}
              onPress={() => openAddModal(selectedDateFilter)}
              activeOpacity={0.85}
            >
              <Plus size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={styles.emptyAddBtnText}>Add Table & Slots</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
              data={filteredTables}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.listContent}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  tintColor="#FF5C39"
                  colors={['#FF5C39']}
                />
              }
              renderItem={({ item }) => {
                const tableDate = item.date ? new Date(item.date) : null;
                const dateDisplay = tableDate
                  ? tableDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
                  : 'Daily';

                const slots = item.availableHours || [];
                const bookingFee = item.bookingPrice || 0;
                const maxDuration = item.maxBookingHours || 2;

                return (
                  <View style={styles.tableCard}>
                    {/* Top Section */}
                    <View style={styles.cardHeader}>
                      <View style={styles.cardHeaderLeft}>
                        <View style={styles.tableNumberBox}>
                          <Text style={styles.tableNumberText}>{item.tableNumber}</Text>
                        </View>
                        <View style={{ marginLeft: 10 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={styles.tableNameTitle}>Table {item.tableNumber}</Text>
                            <View style={styles.areaBadge}>
                              <MapPin size={10} color="#FF5C39" style={{ marginRight: 2 }} />
                              <Text style={styles.areaBadgeText}>{item.area || 'Indoor'}</Text>
                            </View>
                          </View>
                          <View style={styles.capRow}>
                            <Users size={12} color="#687076" />
                            <Text style={styles.capText}>Up to {item.capacity} Guests</Text>
                          </View>
                        </View>
                      </View>

                      <View style={styles.switchWrapper}>
                        <View
                          style={[
                            styles.statusBadgePill,
                            item.isActive ? styles.statusBadgeGreen : styles.statusBadgeGray,
                          ]}
                        >
                          <Text
                            style={[
                              styles.statusBadgeText,
                              item.isActive ? styles.statusTextGreen : styles.statusTextGray,
                            ]}
                          >
                            {item.isActive ? 'ACTIVE' : 'INACTIVE'}
                          </Text>
                        </View>
                        <Switch
                          value={item.isActive}
                          onValueChange={() => handleToggleStatus(item)}
                          trackColor={{ true: '#FF5C39', false: '#E2E8F0' }}
                          thumbColor={item.isActive ? '#FFFFFF' : '#94A3B8'}
                          style={{ transform: [{ scaleX: 0.75 }, { scaleY: 0.75 }], marginTop: 2 }}
                        />
                      </View>
                    </View>

                    {/* Date & Booking Policy Row */}
                    <View style={styles.policyRow}>
                      <View style={styles.policyPill}>
                        <Calendar size={11} color="#FF5C39" />
                        <Text style={styles.policyPillText}>{dateDisplay}</Text>
                      </View>
                      <View style={styles.policyPill}>
                        <Clock size={11} color="#687076" />
                        <Text style={styles.policyPillText}>Max {maxDuration} hrs</Text>
                      </View>
                      <View style={styles.policyPill}>
                        <Text style={[styles.policyPillText, { color: bookingFee > 0 ? '#10B981' : '#687076' }]}>
                          {bookingFee > 0 ? `£${bookingFee.toFixed(2)} Fee` : 'Free Booking'}
                        </Text>
                      </View>
                    </View>

                    {/* Time Slots Visualization */}
                    <View style={styles.slotsSection}>
                      <View style={styles.slotsHeaderRow}>
                        <Text style={styles.slotsSectionTitle}>
                          Available Time Slots ({slots.length})
                        </Text>
                        {slots.length > 0 && (
                          <Text style={styles.slotsRangeText}>
                            {slots[0]} - {slots[slots.length - 1]}
                          </Text>
                        )}
                      </View>

                      {slots.length > 0 ? (
                        <View style={styles.slotsGrid}>
                          {slots.map((slot, sIdx) => (
                            <View key={sIdx} style={styles.slotChip}>
                              <Clock size={10} color="#FF5C39" style={{ marginRight: 3 }} />
                              <Text style={styles.slotChipText}>{slot}</Text>
                            </View>
                          ))}
                        </View>
                      ) : (
                        <Text style={styles.noSlotsText}>No hourly slots configured for this date.</Text>
                      )}
                    </View>

                    {/* Card Actions Footer */}
                    <View style={styles.cardFooter}>
                      <Text style={styles.cardFooterSub}>
                        ID: {item._id?.substring(0, 8)} • {item.area || 'Indoor'}
                      </Text>
                      <View style={styles.cardActions}>
                        <TouchableOpacity
                          style={styles.actionBtnEdit}
                          onPress={() => openEditModal(item)}
                          activeOpacity={0.7}
                        >
                          <Edit2 size={13} color="#11181C" />
                          <Text style={styles.actionBtnEditText}>Edit</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.actionBtnDelete}
                          onPress={() => handleDeleteTable(item._id)}
                          activeOpacity={0.7}
                        >
                          <Trash2 size={13} color="#EF4444" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                );
              }}
        />
      )}

      {/* Floating Add FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => openAddModal(selectedDateFilter)}
        activeOpacity={0.85}
      >
        <Plus size={24} color="#FFFFFF" />
      </TouchableOpacity>

      {/* Add / Edit Table Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>
                  {editingTable ? 'Edit Dining Table' : 'Post Dining Table'}
                </Text>
                <Text style={styles.modalSub}>
                  Configure table availability, capacity and time slots
                </Text>
              </View>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeBtn}>
                <X size={20} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={{ paddingBottom: 30 }}
              showsVerticalScrollIndicator={false}
            >
              {/* Table Identification */}
              <View style={styles.formRow}>
                <View style={[styles.inputGroup, { flex: 1.2, marginRight: 10 }]}>
                  <Text style={styles.label}>Table Number / Name *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. Table 01, T-4, Rooftop-2"
                    placeholderTextColor={Colors.textSubtle}
                    value={formTableNumber}
                    onChangeText={setFormTableNumber}
                  />
                </View>

                <View style={[styles.inputGroup, { flex: 0.8 }]}>
                  <Text style={styles.label}>Guests / Capacity *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. 4"
                    placeholderTextColor={Colors.textSubtle}
                    keyboardType="numeric"
                    value={formCapacity}
                    onChangeText={setFormCapacity}
                  />
                </View>
              </View>

              {/* Area Selection Dropdown */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Dining Area / Section *</Text>
                <TouchableOpacity
                  style={styles.dropdownBtn}
                  onPress={() => setPickerModalType('area')}
                  activeOpacity={0.7}
                >
                  <View style={styles.dropdownBtnLeft}>
                    <MapPin size={16} color="#FF5C39" />
                    <Text style={styles.dropdownBtnText}>{formArea || 'Select Dining Area'}</Text>
                  </View>
                  <ChevronDown size={18} color="#687076" />
                </TouchableOpacity>
              </View>

              {/* Date Selection */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Availability Date *</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                  {upcomingDays.map((d) => (
                    <TouchableOpacity
                      key={d.iso}
                      style={[styles.dateSelectChip, formDate === d.iso && styles.dateSelectChipActive]}
                      onPress={() => setFormDate(d.iso)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.dateSelectDay, formDate === d.iso && styles.dateSelectDayActive]}>
                        {d.dayName}
                      </Text>
                      <Text style={[styles.dateSelectNum, formDate === d.iso && styles.dateSelectNumActive]}>
                        {d.dayNumber} {d.monthName}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* Multi-Day Bulk Apply (Only for new tables) */}
              {!editingTable && (
                <View style={styles.multiDayBox}>
                  <View style={styles.multiDayTop}>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text style={styles.multiDayTitle}>Post for Multiple Days</Text>
                      <Text style={styles.multiDaySub}>
                        Automatically copy this table and its slots across consecutive days
                      </Text>
                    </View>
                    <Switch
                      value={applyMultiDays}
                      onValueChange={setApplyMultiDays}
                      trackColor={{ true: '#FF5C39', false: '#E2E8F0' }}
                      thumbColor={applyMultiDays ? '#FFFFFF' : '#94A3B8'}
                    />
                  </View>

                  {applyMultiDays && (
                    <View style={styles.multiDayDaysRow}>
                      {[2, 3, 5, 7].map((num) => (
                        <TouchableOpacity
                          key={num}
                          style={[
                            styles.multiDayPill,
                            multiDaysCount === num && styles.multiDayPillActive,
                          ]}
                          onPress={() => setMultiDaysCount(num)}
                        >
                          <Text
                            style={[
                              styles.multiDayPillText,
                              multiDaysCount === num && styles.multiDayPillTextActive,
                            ]}
                          >
                            Next {num} Days
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              )}

              {/* Time Range Presets */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Time Slot Presets</Text>
                <View style={styles.presetGrid}>
                  {TIME_PRESETS.map((preset) => {
                    const isSelected = formStartTime === preset.start && formEndTime === preset.end;
                    return (
                      <TouchableOpacity
                        key={preset.label}
                        style={[styles.presetCard, isSelected && styles.presetCardActive]}
                        onPress={() => {
                          setFormStartTime(preset.start);
                          setFormEndTime(preset.end);
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.presetLabel, isSelected && styles.presetLabelActive]}>
                          {preset.label}
                        </Text>
                        <Text style={[styles.presetTimes, isSelected && styles.presetTimesActive]}>
                          {preset.start} - {preset.end}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Start and End Time Dropdown Selectors */}
              <View style={styles.formRow}>
                <View style={[styles.inputGroup, { flex: 1, marginRight: 10 }]}>
                  <Text style={styles.label}>Start Time *</Text>
                  <TouchableOpacity
                    style={styles.dropdownBtn}
                    onPress={() => setPickerModalType('startTime')}
                    activeOpacity={0.7}
                  >
                    <View style={styles.dropdownBtnLeft}>
                      <Clock size={16} color="#FF5C39" />
                      <Text style={styles.dropdownBtnText} numberOfLines={1}>
                        {getTimeLabel(formStartTime)}
                      </Text>
                    </View>
                    <ChevronDown size={16} color="#687076" />
                  </TouchableOpacity>
                </View>

                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.label}>End Time *</Text>
                  <TouchableOpacity
                    style={styles.dropdownBtn}
                    onPress={() => setPickerModalType('endTime')}
                    activeOpacity={0.7}
                  >
                    <View style={styles.dropdownBtnLeft}>
                      <Clock size={16} color="#3B82F6" />
                      <Text style={styles.dropdownBtnText} numberOfLines={1}>
                        {getTimeLabel(formEndTime)}
                      </Text>
                    </View>
                    <ChevronDown size={16} color="#687076" />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Slots Preview */}
              <View style={styles.previewBox}>
                <View style={styles.previewTop}>
                  <Sparkles size={14} color="#FF5C39" />
                  <Text style={styles.previewTitle}>
                    {generatedSlotsPreview.length} Hourly Slots will be generated:
                  </Text>
                </View>
                <View style={styles.previewSlotsGrid}>
                  {generatedSlotsPreview.map((s, idx) => (
                    <View key={idx} style={styles.previewSlotPill}>
                      <Text style={styles.previewSlotText}>{s}</Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* Booking Fee & Duration */}
              <View style={styles.formRow}>
                <View style={[styles.inputGroup, { flex: 1, marginRight: 10 }]}>
                  <Text style={styles.label}>Reservation Fee (£)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="0.00 (Free)"
                    placeholderTextColor={Colors.textSubtle}
                    keyboardType="numeric"
                    value={formBookingPrice}
                    onChangeText={setFormBookingPrice}
                  />
                </View>

                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.label}>Max Booking (Hours)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. 2"
                    placeholderTextColor={Colors.textSubtle}
                    keyboardType="numeric"
                    value={formMaxHours}
                    onChangeText={setFormMaxHours}
                  />
                </View>
              </View>

              {/* Save Button */}
              <TouchableOpacity
                style={[styles.saveBtn, submitting && { opacity: 0.7 }]}
                disabled={submitting}
                onPress={handleSaveTable}
                activeOpacity={0.85}
              >
                {submitting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                      <Text style={styles.saveBtnText}>
                        {editingTable ? 'Update Table Details' : 'Post Table & Slots'}
                      </Text>
                    <Check size={16} color="#FFFFFF" style={{ marginLeft: 6 }} />
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Universal Selection Dropdown Modal */}
      <Modal
        visible={pickerModalType !== null}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setPickerModalType(null)}
      >
        <TouchableOpacity
          style={styles.pickerBackdrop}
          activeOpacity={1}
          onPress={() => setPickerModalType(null)}
        >
          <View style={styles.pickerModalBox} onStartShouldSetResponder={() => true}>
            <View style={styles.pickerModalHeader}>
              <Text style={styles.pickerModalTitle}>
                {pickerModalType === 'area'
                  ? 'Select Dining Area'
                  : pickerModalType === 'startTime'
                  ? 'Select Start Time'
                  : 'Select End Time'}
              </Text>
              <TouchableOpacity onPress={() => setPickerModalType(null)} style={styles.closeBtn}>
                <X size={18} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 350 }} showsVerticalScrollIndicator={false}>
              {pickerModalType === 'area' &&
                AREAS.map((area) => {
                  const isSelected = formArea === area;
                  return (
                    <TouchableOpacity
                      key={area}
                      style={[styles.pickerItemRow, isSelected && styles.pickerItemRowSelected]}
                      onPress={() => {
                        setFormArea(area);
                        setPickerModalType(null);
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <MapPin size={16} color={isSelected ? '#FF5C39' : '#687076'} />
                        <Text style={[styles.pickerItemText, isSelected && styles.pickerItemTextSelected]}>
                          {area}
                        </Text>
                      </View>
                      {isSelected && <Check size={16} color="#FF5C39" />}
                    </TouchableOpacity>
                  );
                })}

              {(pickerModalType === 'startTime' || pickerModalType === 'endTime') &&
                TIME_PICKER_OPTIONS.map((opt) => {
                  const isSelected =
                    pickerModalType === 'startTime'
                      ? formStartTime === opt.value
                      : formEndTime === opt.value;
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      style={[styles.pickerItemRow, isSelected && styles.pickerItemRowSelected]}
                      onPress={() => {
                        if (pickerModalType === 'startTime') {
                          setFormStartTime(opt.value);
                        } else {
                          setFormEndTime(opt.value);
                        }
                        setPickerModalType(null);
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Clock size={16} color={isSelected ? '#FF5C39' : '#687076'} />
                        <Text style={[styles.pickerItemText, isSelected && styles.pickerItemTextSelected]}>
                          {opt.label}
                        </Text>
                      </View>
                      {isSelected && <Check size={16} color="#FF5C39" />}
                    </TouchableOpacity>
                  );
                })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
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
  headerRightControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addTableHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF5C39',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    gap: 4,
    shadowColor: '#FF5C39',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  addTableHeaderBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  refreshBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#EEEEEE',
  },
  dateStripContainer: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
    paddingVertical: 8,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  datePillSide: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 24,
    borderRadius: 12,
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#EEEEEE',
  },
  datePillSideActive: {
    backgroundColor: '#11181C',
    borderColor: '#11181C',
  },
  datePillSideLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  datePillSideTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#11181C',
  },
  datePillSideTitleActive: {
    color: '#FFFFFF',
  },
  datePillSideBadge: {
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
    minWidth: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 2,
  },
  datePillSideBadgeActive: {
    backgroundColor: '#FFFFFF',
  },
  datePillSideBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  dateStripDivider: {
    width: 1,
    height: 28,
    backgroundColor: '#EEEEEE',
    marginHorizontal: 8,
  },
  dateStripContent: {
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 12,
  },
  dateDayPill: {
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#EEEEEE',
    minWidth: 70,
  },
  dateDayPillActive: {
    backgroundColor: '#11181C',
    borderColor: '#11181C',
  },
  dayNameText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#687076',
    textTransform: 'uppercase',
  },
  dayNameTextActive: {
    color: '#FF5C39',
  },
  dayNumText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#11181C',
    marginTop: 1,
  },
  dayNumTextActive: {
    color: '#FFFFFF',
  },
  dayCountBadge: {
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginTop: 3,
  },
  dayCountBadgeActive: {
    backgroundColor: '#FFFFFF',
  },
  dayCountText: {
    fontSize: 9,
    fontWeight: '800',
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
  areaFilters: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  areaChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#EEEEEE',
  },
  areaChipActive: {
    backgroundColor: '#11181C',
    borderColor: '#11181C',
  },
  areaChipText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#687076',
  },
  areaChipTextActive: {
    color: '#FFFFFF',
  },
  listContent: {
    padding: 16,
    gap: 12,
    paddingBottom: 110,
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
    marginBottom: 20,
  },
  emptyAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF5C39',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    shadowColor: '#FF5C39',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  emptyAddBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },
  tableCard: {
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
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  tableNumberBox: {
    width: 46,
    height: 46,
    borderRadius: 10,
    backgroundColor: '#FFF0EC',
    borderWidth: 1,
    borderColor: '#FFE0D8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tableNumberText: {
    color: '#FF5C39',
    fontSize: 15,
    fontWeight: '800',
  },
  tableNameTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#11181C',
    letterSpacing: -0.2,
  },
  areaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FFEDD5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  areaBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#D97706',
  },
  capRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  capText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#687076',
  },
  switchWrapper: {
    alignItems: 'flex-end',
    gap: 2,
  },
  statusBadgePill: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  statusBadgeGreen: {
    backgroundColor: '#ECFDF5',
  },
  statusBadgeGray: {
    backgroundColor: '#F1F5F9',
  },
  statusBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  statusTextGreen: {
    color: '#065F46',
  },
  statusTextGray: {
    color: '#64748B',
  },
  policyRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  policyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#EEEEEE',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  policyPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#687076',
  },
  slotsSection: {
    backgroundColor: '#F8F9FA',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#EEEEEE',
    padding: 10,
    marginTop: 10,
  },
  slotsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  slotsSectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#11181C',
  },
  slotsRangeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#FF5C39',
  },
  slotsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  slotChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  slotChipText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#11181C',
  },
  noSlotsText: {
    fontSize: 11,
    color: '#94A3B8',
    fontStyle: 'italic',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    paddingTop: 10,
    marginTop: 10,
  },
  cardFooterSub: {
    fontSize: 10.5,
    color: '#9BA1A6',
    fontWeight: '600',
  },
  cardActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtnEdit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#EEEEEE',
  },
  actionBtnEditText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#11181C',
  },
  actionBtnDelete: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fab: {
    position: 'absolute',
    bottom: 30,
    right: 20,
    backgroundColor: '#FF5C39',
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FF5C39',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 28, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  modalTitle: {
    color: '#11181C',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  modalSub: {
    fontSize: 11.5,
    color: '#9BA1A6',
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
  },
  modalScroll: {
    padding: 16,
  },
  formRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#11181C',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#F8F9FA',
    borderColor: '#EEEEEE',
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 46,
    fontSize: 13.5,
    color: '#11181C',
  },
  chipRow: {
    flexDirection: 'row',
    gap: 6,
  },
  selectChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#F8F9FA',
    borderWidth: 1.5,
    borderColor: '#EEEEEE',
  },
  selectChipActive: {
    borderColor: '#FF5C39',
    backgroundColor: '#FFF0EC',
  },
  selectChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#687076',
  },
  selectChipTextActive: {
    color: '#FF5C39',
  },
  dateSelectChip: {
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#F8F9FA',
    borderWidth: 1.5,
    borderColor: '#EEEEEE',
    minWidth: 68,
  },
  dateSelectChipActive: {
    borderColor: '#FF5C39',
    backgroundColor: '#FFF0EC',
  },
  dateSelectDay: {
    fontSize: 10,
    fontWeight: '700',
    color: '#687076',
    textTransform: 'uppercase',
  },
  dateSelectDayActive: {
    color: '#FF5C39',
  },
  dateSelectNum: {
    fontSize: 12,
    fontWeight: '800',
    color: '#11181C',
    marginTop: 2,
  },
  dateSelectNumActive: {
    color: '#FF5C39',
  },
  multiDayBox: {
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EEEEEE',
    padding: 12,
    marginBottom: 16,
  },
  multiDayTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  multiDayTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#11181C',
  },
  multiDaySub: {
    fontSize: 11,
    color: '#9BA1A6',
    marginTop: 2,
  },
  multiDayDaysRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#EEEEEE',
  },
  multiDayPill: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
  },
  multiDayPillActive: {
    backgroundColor: '#11181C',
    borderColor: '#11181C',
  },
  multiDayPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#687076',
  },
  multiDayPillTextActive: {
    color: '#FFFFFF',
  },
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  presetCard: {
    flex: 1,
    minWidth: '47%',
    backgroundColor: '#F8F9FA',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#EEEEEE',
    padding: 10,
  },
  presetCardActive: {
    borderColor: '#FF5C39',
    backgroundColor: '#FFF0EC',
  },
  presetLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#11181C',
  },
  presetLabelActive: {
    color: '#FF5C39',
  },
  presetTimes: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#687076',
    marginTop: 2,
  },
  presetTimesActive: {
    color: '#FF5C39',
  },
  timeSelectRow: {
    flexDirection: 'row',
    gap: 6,
  },
  timeChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#F8F9FA',
    borderWidth: 1.5,
    borderColor: '#EEEEEE',
  },
  timeChipActive: {
    borderColor: '#FF5C39',
    backgroundColor: '#FF5C39',
  },
  timeChipText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#687076',
  },
  timeChipTextActive: {
    color: '#FFFFFF',
  },
  previewBox: {
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FFEDD5',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  previewTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  previewTitle: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#C2410C',
  },
  previewSlotsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  previewSlotPill: {
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  previewSlotText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#9A3412',
  },
  saveBtn: {
    backgroundColor: '#FF5C39',
    height: 48,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    marginBottom: 20,
    shadowColor: '#FF5C39',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
  dropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8F9FA',
    borderColor: '#EEEEEE',
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 48,
  },
  dropdownBtnLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    marginRight: 6,
  },
  dropdownBtnText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#11181C',
  },
  pickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 28, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  pickerModalBox: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  pickerModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
    marginBottom: 8,
  },
  pickerModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#11181C',
  },
  pickerItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  pickerItemRowSelected: {
    backgroundColor: '#FFF0EC',
  },
  pickerItemText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#11181C',
  },
  pickerItemTextSelected: {
    fontWeight: '800',
    color: '#FF5C39',
  },
});

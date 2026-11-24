/**
 * Reservations timeline for one day: tables down the side, hours across.
 * Free squares (within a table's hours) are tappable to add a booking; bookings are blocks.
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Plus } from 'lucide-react-native';
import { Colors } from '../../constants/colors';
import type { BookingDay, BookingDayEntry } from '../../services/restaurant-owner.service';
import { coversByHour, hh, hourOf, hourSpan, takenSlots, timeRange, ukHour } from './dayModel';

const CELL = 60;
const ROW = 56;
const LABEL = 76;

const BLOCK: Record<BookingDayEntry['status'], { bg: string; border: string; text: string; label?: string }> = {
  confirmed: { bg: Colors.primaryLight, border: Colors.primary, text: Colors.primaryDark },
  pending: { bg: Colors.statusPending.bg, border: '#F59E0B', text: Colors.statusPending.text, label: 'Paying…' },
  completed: { bg: Colors.cardSurface, border: Colors.cardBorder, text: Colors.textMuted, label: 'Done' },
  no_show: { bg: Colors.cardSurface, border: Colors.cardBorder, text: Colors.textMuted, label: 'No-show' },
};

export function BookingDayView({
  day,
  isToday,
  onAdd,
  onOpen,
}: {
  day: BookingDay;
  isToday: boolean;
  onAdd: (tableId: string, hour: number) => void;
  onOpen: (b: BookingDayEntry) => void;
}) {
  const [first, last] = hourSpan(day.tables);
  const hours = Array.from({ length: last - first }, (_, i) => first + i);
  const covers = coversByHour(day.bookings);
  const nowHour = isToday ? ukHour() : -1;

  return (
    <View style={styles.wrap}>
      {/* Fixed table labels */}
      <View style={{ width: LABEL }}>
        <View style={styles.headCell}>
          <Text style={styles.headText}>Table</Text>
          <Text style={styles.coverText}>guests</Text>
        </View>
        {day.tables.map((t) => (
          <View key={t._id} style={[styles.label, !t.isActive && styles.labelOff]}>
            <Text style={styles.labelText} numberOfLines={1}>{t.tableNumber}</Text>
            <Text style={styles.labelSub}>{!t.isActive ? 'hidden' : t.online === false ? `${t.capacity} · not online` : `${t.capacity} seats`}</Text>
          </View>
        ))}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ width: hours.length * CELL }}>
        <View>
          <View style={styles.headRow}>
            {hours.map((h) => (
              <View key={h} style={[styles.headCell, { width: CELL }, h === nowHour && styles.nowHead]}>
                <Text style={styles.headText}>{hh(h)}</Text>
                <Text style={styles.coverText}>{covers[hh(h)] ? covers[hh(h)] : '·'}</Text>
              </View>
            ))}
          </View>

          {day.tables.map((t) => {
            const open = new Set(t.availableHours);
            const taken = takenSlots(t._id, day.bookings);
            const mine = day.bookings.filter((b) => String(b.tableId) === String(t._id));
            return (
              <View key={t._id} style={[styles.row, { width: hours.length * CELL }]}>
                {hours.map((h) => {
                  const slot = hh(h);
                  const past = isToday && h < nowHour;
                  const bookable = t.isActive && open.has(slot) && !taken.has(slot) && !past;
                  return bookable ? (
                    <TouchableOpacity
                      key={h}
                      style={[styles.cell, styles.cellFree]}
                      onPress={() => onAdd(t._id, h)}
                      accessibilityRole="button"
                      accessibilityLabel={`Add booking at table ${t.tableNumber}, ${slot}`}
                    >
                      <Plus size={14} color={Colors.textSubtle} />
                    </TouchableOpacity>
                  ) : (
                    <View key={h} style={[styles.cell, open.has(slot) && t.isActive ? styles.cellPast : styles.cellClosed]} />
                  );
                })}
                {mine.map((b) => {
                  const s = [...b.slots].sort();
                  const left = (hourOf(s[0]) - first) * CELL + 2;
                  const width = s.length * CELL - 4;
                  const look = BLOCK[b.status] || BLOCK.confirmed;
                  return (
                    <TouchableOpacity
                      key={b._id}
                      onPress={() => onOpen(b)}
                      style={[styles.block, { left, width, backgroundColor: look.bg, borderColor: look.border }]}
                      accessibilityRole="button"
                      accessibilityLabel={`${b.customerName}, ${b.guests} guests, ${timeRange(b.slots)}${look.label ? `, ${look.label}` : ''}`}
                    >
                      <Text style={[styles.blockName, { color: look.text }]} numberOfLines={1}>
                        {b.customerName}
                      </Text>
                      <Text style={[styles.blockSub, { color: look.text }]} numberOfLines={1}>
                        {b.guests} · {look.label || (b.source === 'app' ? 'App' : b.source === 'walk_in' ? 'Walk-in' : 'Phone')}
                        {b.specialRequests ? ' · note' : ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', backgroundColor: Colors.background, borderRadius: 14, borderWidth: 1, borderColor: Colors.cardBorder, overflow: 'hidden' },
  headRow: { flexDirection: 'row' },
  headCell: { height: 44, justifyContent: 'center', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: Colors.cardBorder },
  nowHead: { backgroundColor: Colors.primaryLight },
  headText: { fontSize: 12, fontWeight: '800', color: Colors.text },
  coverText: { fontSize: 10, color: Colors.textMuted, marginTop: 1 },
  label: { height: ROW, justifyContent: 'center', paddingHorizontal: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.cardBorder, borderRightWidth: 1, borderRightColor: Colors.cardBorder },
  labelOff: { opacity: 0.5 },
  labelText: { fontSize: 15, fontWeight: '800', color: Colors.text },
  labelSub: { fontSize: 11, color: Colors.textMuted },
  row: { height: ROW, flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.cardBorder },
  cell: { width: CELL, height: ROW, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: Colors.cardBorder, alignItems: 'center', justifyContent: 'center' },
  cellFree: { backgroundColor: Colors.background },
  cellPast: { backgroundColor: Colors.backgroundSecondary },
  cellClosed: { backgroundColor: '#EEF0F2' },
  block: { position: 'absolute', top: 4, height: ROW - 8, borderRadius: 8, borderWidth: 1.5, paddingHorizontal: 6, justifyContent: 'center' },
  blockName: { fontSize: 12, fontWeight: '800' },
  blockSub: { fontSize: 10, fontWeight: '600' },
});

/**
 * Add a phone / walk-in booking, or move an existing one to another table / time.
 * Shows only start times that fit (free, within the table's hours, not already over).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { CalendarPlus, ArrowRightLeft } from 'lucide-react-native';
import { Colors } from '../../constants/colors';
import { BottomSheet } from '../ui/BottomSheet';
import { Field, FieldRow, Segmented, StepperField, PrimaryButton, Notice } from '../settings/FormKit';
import { restaurantOwnerService, type BookingDay, type BookingDayEntry } from '../../services/restaurant-owner.service';
import { bestFit, dayLabel, freeStarts, hh, slotsFrom, timeRange, ukToday } from './dayModel';

export type BookingFormMode = { kind: 'create'; tableId?: string; start?: number } | { kind: 'move'; booking: BookingDayEntry };

export function BookingFormSheet({
  visible,
  mode,
  day,
  onClose,
  onDone,
}: {
  visible: boolean;
  mode: BookingFormMode | null;
  day: BookingDay | null;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const moving = mode?.kind === 'move' ? mode.booking : null;
  const today = ukToday();
  const isToday = day?.date === today;

  const [guests, setGuests] = useState('2');
  const [hours, setHours] = useState('2');
  const [tableId, setTableId] = useState<string | null>(null);
  const [start, setStart] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [source, setSource] = useState<'phone' | 'walk_in'>('phone');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Reset whenever the sheet opens
  useEffect(() => {
    if (!visible || !mode) return;
    setError('');
    if (mode.kind === 'move') {
      setGuests(String(mode.booking.guests));
      setHours(String(mode.booking.slots.length || 1));
      setTableId(String(mode.booking.tableId));
      setStart(parseInt(mode.booking.slots[0], 10));
    } else {
      setGuests('2');
      setHours('2');
      setTableId(mode.tableId || null);
      setStart(mode.start ?? null);
      setName('');
      setPhone('');
      setNotes('');
      setSource(isToday ? 'walk_in' : 'phone');
    }
  }, [visible, mode, isToday]);

  const party = Math.max(1, Number(guests) || 1);
  const length = Math.max(1, Number(hours) || 1);
  const tables = useMemo(() => bestFit((day?.tables || []).filter((t) => t.isActive || t._id === moving?.tableId), party), [day, party, moving]);
  const table = tables.find((t) => t._id === tableId) || null;
  const starts = useMemo(
    () => (table && day ? freeStarts(table, day.bookings, { hours: length, excludeId: moving?._id, isToday }) : []),
    [table, day, length, moving, isToday]
  );

  // Keep the chosen start valid as table / length change
  useEffect(() => {
    if (start !== null && !starts.includes(start)) setStart(null);
  }, [starts, start]);

  const submit = async (allowOverCapacity = false) => {
    if (!table || start === null || !day) return setError('Choose a table and a start time.');
    if (!moving && !name.trim()) return setError('Enter the guest’s name.');
    setError('');
    setSaving(true);
    const slots = slotsFrom(start, length);
    const res = moving
      ? await restaurantOwnerService.moveBooking(moving._id, { tableId: table._id, date: day.date, slots, allowOverCapacity })
      : await restaurantOwnerService.createBooking({
          tableId: table._id,
          date: day.date,
          slots,
          guests: party,
          customerName: name.trim(),
          customerPhone: phone.trim() || undefined,
          specialRequests: notes.trim() || undefined,
          source,
          allowOverCapacity,
        });
    setSaving(false);
    if (!res.success) {
      if (res.statusCode === 409 && /seats \d+/.test(res.message || '') && !allowOverCapacity) {
        Alert.alert('Party is bigger than the table', `${res.message}\n\nBook it anyway (extra chairs)?`, [
          { text: 'Choose another table', style: 'cancel' },
          { text: 'Book anyway', onPress: () => submit(true) },
        ]);
        return;
      }
      return setError(res.message || 'Couldn’t save the booking.');
    }
    onDone(res.message || (moving ? 'Booking moved' : 'Booking added'));
  };

  const title = moving ? `Move ${moving.customerName}’s booking` : 'New booking';
  const subtitle = day ? `${dayLabel(day.date, today)}${moving ? ` · now ${timeRange(moving.slots)}` : ''}` : undefined;

  return (
    <BottomSheet
      visible={visible}
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      footer={
        <>
          <PrimaryButton label="Cancel" tone="secondary" onPress={onClose} style={styles.flex} />
          <PrimaryButton
            label={moving ? 'Move booking' : 'Add booking'}
            icon={moving ? ArrowRightLeft : CalendarPlus}
            loading={saving}
            disabled={!table || start === null}
            onPress={() => submit(false)}
            style={styles.flex}
          />
        </>
      }
    >
      {!day?.tables.length ? (
        <Notice tone="warning" title="No tables this day">Add tables and booking hours on the Tables screen first.</Notice>
      ) : (
        <>
          {!moving ? (
            <>
              <Segmented
                options={[
                  { value: 'phone', label: 'Phone booking' },
                  { value: 'walk_in', label: 'Walk-in' },
                ]}
                value={source}
                onChange={setSource}
              />
              <FieldRow>
                <Field label="Guest name" required value={name} onChangeText={setName} placeholder="e.g. Sam Patel" maxLength={80} containerStyle={styles.top} />
                <Field label="Phone" value={phone} onChangeText={setPhone} placeholder="Optional" keyboardType="phone-pad" maxLength={24} containerStyle={styles.top} />
              </FieldRow>
            </>
          ) : null}

          <FieldRow>
            {!moving ? <StepperField label="Guests" value={guests} onChange={setGuests} step={1} min={1} max={50} /> : null}
            <StepperField label="Length" value={hours} onChange={setHours} step={1} min={1} max={6} suffix="h" />
          </FieldRow>

          <Text style={styles.label}>Table</Text>
          <View style={styles.chips}>
            {tables.map((t) => {
              const active = t._id === tableId;
              const small = t.capacity < party;
              const hasRoom = day ? freeStarts(t, day.bookings, { hours: length, excludeId: moving?._id, isToday }).length > 0 : false;
              return (
                <TouchableOpacity
                  key={t._id}
                  onPress={() => setTableId(t._id)}
                  style={[styles.chip, active && styles.chipActive, (!hasRoom || small) && !active && styles.chipDim]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`Table ${t.tableNumber}, ${t.capacity} seats${small ? ', too small' : ''}${hasRoom ? '' : ', full'}`}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{t.tableNumber}</Text>
                  <Text style={[styles.chipSub, active && styles.chipTextActive]}>
                    {t.capacity} seats{hasRoom ? '' : ' · full'}{t.online === false ? ' · not online' : ''}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {table ? (
            <>
              <Text style={styles.label}>Start time</Text>
              {starts.length ? (
                <View style={styles.chips}>
                  {starts.map((h) => {
                    const active = h === start;
                    return (
                      <TouchableOpacity
                        key={h}
                        onPress={() => setStart(h)}
                        style={[styles.time, active && styles.chipActive]}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        accessibilityLabel={`Start at ${hh(h)}`}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>{hh(h)}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : (
                <Text style={styles.hint}>No {length}-hour gap left on {table.tableNumber}. Try a shorter booking or another table.</Text>
              )}
              {start !== null ? <Text style={styles.hint}>{`${table.tableNumber} · ${timeRange(slotsFrom(start, length))}`}</Text> : null}
            </>
          ) : null}

          {!moving ? <Field label="Notes" value={notes} onChangeText={setNotes} placeholder="Allergies, high chair, occasion…" maxLength={300} containerStyle={styles.top} /> : null}
          {moving?.customerPhone ? <Text style={styles.hint}>The guest gets a notification about the change if they booked in the app.</Text> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  top: { marginTop: 12 },
  label: { fontSize: 13, fontWeight: '700', color: Colors.text, marginTop: 14, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minWidth: 72, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1, borderColor: Colors.cardBorder, backgroundColor: Colors.background, alignItems: 'center' },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipDim: { opacity: 0.5 },
  chipText: { fontSize: 14, fontWeight: '800', color: Colors.text },
  chipSub: { fontSize: 11, color: Colors.textMuted },
  chipTextActive: { color: '#FFFFFF' },
  time: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: Colors.cardBorder, backgroundColor: Colors.background },
  hint: { fontSize: 12, color: Colors.textMuted, marginTop: 8 },
  error: { fontSize: 13, color: Colors.danger, marginTop: 12, fontWeight: '600' },
});

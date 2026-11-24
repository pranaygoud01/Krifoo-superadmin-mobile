/**
 * Add / edit a table — set once (no dates, no hours: those come from the weekly booking hours).
 * Name · seats · area · shape · online booking (longest booking, price) and a live preview of
 * how guests see it in the Krifoo app.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Armchair, Plus, Check, Users, Clock, PoundSterling, MapPin } from 'lucide-react-native';
import { Colors } from '../../constants/colors';
import { BottomSheet } from '../ui/BottomSheet';
import { Field, Segmented, StepperField, ToggleRow, PrimaryButton, sanitizeDecimal } from '../settings/FormKit';
import { floorService, findFreeSpot, SHAPE_SIZE, type LiveFloor, type LiveTable, type TableShape } from '../../services/floor.service';
import { hoursSummary, tablePriceSummary, type BookingSettings } from '../../services/booking-settings.service';

const SHAPES: { value: TableShape; label: string }[] = [
  { value: 'square', label: 'Square' },
  { value: 'round', label: 'Round' },
  { value: 'rectangle', label: 'Long' },
  { value: 'booth', label: 'Booth' },
];
const AREA_IDEAS = ['Indoor', 'Outdoor', 'Terrace', 'Garden', 'Rooftop', 'Bar', 'Private dining'];

export type TableFormTarget = { kind: 'add' } | { kind: 'edit'; table: LiveTable; floorId: string };

export function TableFormSheet({
  visible,
  target,
  floors,
  settings,
  onClose,
  onSaved,
}: {
  visible: boolean;
  target: TableFormTarget | null;
  floors: LiveFloor[];
  settings: BookingSettings;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const editing = target?.kind === 'edit' ? target.table : null;
  const allLabels = useMemo(() => new Set(floors.flatMap((f) => f.tables.map((t) => t.label.toLowerCase()))), [floors]);

  const [label, setLabel] = useState('');
  const [seats, setSeats] = useState('4');
  const [floorChoice, setFloorChoice] = useState<string>(''); // floor id, or "new"
  const [newArea, setNewArea] = useState('');
  const [shape, setShape] = useState<TableShape>('square');
  const [bookable, setBookable] = useState(true);
  const [ownLength, setOwnLength] = useState(false);
  const [maxHours, setMaxHours] = useState('2');
  const [ownPrice, setOwnPrice] = useState(false);
  const [price, setPrice] = useState('');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ label?: string; area?: string; price?: string; form?: string }>({});

  useEffect(() => {
    if (!visible || !target) return;
    setErrors({});
    if (target.kind === 'edit') {
      const t = target.table;
      setLabel(t.label);
      setSeats(String(t.seats));
      setFloorChoice(target.floorId);
      setNewArea('');
      setShape(t.shape);
      setBookable(!!t.bookable);
      setOwnLength(t.maxBookingHours != null);
      setMaxHours(String(t.maxBookingHours ?? settings.maxBookingHours));
      setOwnPrice(t.bookingPrice != null);
      setPrice(t.bookingPrice != null ? String(t.bookingPrice) : '');
    } else {
      let n = 1;
      while (allLabels.has(`t${n}`)) n += 1;
      setLabel(`T${n}`);
      setSeats('4');
      setFloorChoice(floors[0]?._id || 'new');
      setNewArea(floors.length ? '' : 'Indoor');
      setShape('square');
      setBookable(true);
      setOwnLength(false);
      setMaxHours(String(settings.maxBookingHours));
      setOwnPrice(false);
      setPrice('');
    }
  }, [visible, target, floors, settings.maxBookingHours, allLabels]);

  const areaName = floorChoice === 'new' ? newArea.trim() : floors.find((f) => f._id === floorChoice)?.name || '';
  const seatCount = Math.max(1, Number(seats) || 1);
  const priceNumber = ownPrice ? Number(price || 0) : null;

  const save = async () => {
    const e: typeof errors = {};
    const name = label.trim();
    if (!name) e.label = 'Give the table a name, like T4.';
    else if (name.length > 12) e.label = 'Keep it under 12 characters.';
    else if (allLabels.has(name.toLowerCase()) && name.toLowerCase() !== editing?.label.toLowerCase()) e.label = `${name} already exists.`;
    if (!areaName) e.area = 'Choose or name an area.';
    if (ownPrice && (!(Number(price) >= 0) || Number(price) > 500)) e.price = 'Between £0 and £500.';
    setErrors(e);
    if (Object.keys(e).length) return;

    setSaving(true);
    try {
      // Area → floor (create it if new)
      let floorId = floorChoice;
      if (floorChoice === 'new') {
        const existing = floors.find((f) => f.name.toLowerCase() === areaName.toLowerCase());
        if (existing) floorId = existing._id;
        else {
          const res = await floorService.createFloor(areaName);
          if (!res.success || !res.data?._id) throw new Error(res.message || 'Couldn’t create the area.');
          floorId = res.data._id;
        }
      }
      const floor = floors.find((f) => f._id === floorId);
      const size = SHAPE_SIZE[shape];
      const booking = {
        bookable,
        maxBookingHours: bookable && ownLength ? Number(maxHours) : null,
        bookingPrice: bookable && ownPrice ? Math.round(Number(price || 0) * 100) / 100 : null,
      };
      if (editing) {
        const movingFloor = target?.kind === 'edit' && target.floorId !== floorId;
        const body: Parameters<typeof floorService.updateTable>[1] = { label: name, seats: seatCount, shape, ...booking };
        if (movingFloor) {
          body.floorId = floorId;
          body.layout = { ...findFreeSpot((floor?.tables || []).map((t) => t.layout), size.w, size.h), ...size };
        }
        const res = await floorService.updateTable(editing._id, body);
        if (!res.success) throw new Error(res.message || 'Couldn’t save the table.');
        onSaved(`${name} saved`);
      } else {
        const spot = findFreeSpot((floor?.tables || []).map((t) => t.layout), size.w, size.h);
        const res = await floorService.createTable(floorId, { label: name, seats: seatCount, shape, layout: { ...spot, ...size }, ...booking });
        if (!res.success) throw new Error(res.message || 'Couldn’t add the table.');
        onSaved(bookable ? `${name} added — guests can book it` : `${name} added`);
      }
    } catch (err: any) {
      setErrors({ form: err?.message || 'Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  const previewPrice = tablePriceSummary(settings, priceNumber);
  const previewLength = ownLength ? Number(maxHours) : settings.maxBookingHours;

  return (
    <BottomSheet
      visible={visible}
      title={editing ? `Edit ${editing.label}` : 'Add a table'}
      subtitle={editing ? undefined : 'Set it up once — guests book it in hourly slots during your booking hours'}
      onClose={onClose}
      footer={
        <>
          <PrimaryButton label="Cancel" tone="secondary" onPress={onClose} style={styles.flex} />
          <PrimaryButton label={editing ? 'Save table' : 'Add table'} icon={editing ? Check : Plus} loading={saving} onPress={save} style={styles.flex} />
        </>
      }
    >
      {/* 1 · The table */}
      <Text style={styles.step}>The table</Text>
      <View style={styles.row}>
        <Field label="Name" required value={label} onChangeText={setLabel} placeholder="T4, 12, Window 2…" maxLength={12} autoCapitalize="characters" error={errors.label} containerStyle={styles.nameField} />
        <View style={styles.flex}>
          <StepperField label="Seats" value={seats} onChange={setSeats} step={1} min={1} max={30} presets={[2, 4, 6, 8]} />
        </View>
      </View>

      {/* 2 · Where */}
      <Text style={styles.step}>Where is it?</Text>
      <View style={styles.chips}>
        {floors.map((f) => (
          <Chip key={f._id} label={f.name} active={floorChoice === f._id} onPress={() => setFloorChoice(f._id)} />
        ))}
        <Chip label="New area" icon={Plus} active={floorChoice === 'new'} onPress={() => setFloorChoice('new')} />
      </View>
      {floorChoice === 'new' ? (
        <>
          <Field label="Area name" value={newArea} onChangeText={setNewArea} placeholder="e.g. Terrace" maxLength={40} error={errors.area} containerStyle={styles.top} />
          <View style={styles.chips}>
            {AREA_IDEAS.filter((a) => !floors.some((f) => f.name.toLowerCase() === a.toLowerCase())).map((a) => (
              <Chip key={a} label={a} small active={newArea === a} onPress={() => setNewArea(a)} />
            ))}
          </View>
        </>
      ) : errors.area ? (
        <Text style={styles.error}>{errors.area}</Text>
      ) : null}

      <Text style={styles.label}>Shape (for your floor plan)</Text>
      <Segmented options={SHAPES} value={shape} onChange={setShape} />

      {/* 3 · Online booking */}
      <Text style={styles.step}>Online booking</Text>
      <View style={styles.card}>
        <ToggleRow title="Guests can book this table" description="In the Krifoo app, during your booking hours" value={bookable} onChange={setBookable} last={!bookable} />
        {bookable ? (
          <>
            <Text style={styles.label}>Longest booking</Text>
            <Segmented
              options={[
                { value: 'default', label: `Standard (${settings.maxBookingHours} h)` },
                { value: 'own', label: 'Own limit' },
              ]}
              value={ownLength ? 'own' : 'default'}
              onChange={(v) => setOwnLength(v === 'own')}
            />
            {ownLength ? (
              <View style={styles.top}>
                <StepperField label="Up to" value={maxHours} onChange={setMaxHours} step={1} min={1} max={12} suffix="h" />
              </View>
            ) : null}

            <Text style={styles.label}>Price</Text>
            <Segmented
              options={[
                { value: 'default', label: settings.priceModel === 'free' ? 'Free (restaurant)' : 'Restaurant price' },
                { value: 'own', label: 'Own price' },
              ]}
              value={ownPrice ? 'own' : 'default'}
              onChange={(v) => setOwnPrice(v === 'own')}
            />
            {ownPrice ? (
              <Field
                label={settings.priceModel === 'per_hour' ? 'Price per hour' : 'Deposit per booking'}
                prefix="£"
                value={price}
                onChangeText={(v) => setPrice(sanitizeDecimal(v))}
                keyboardType="decimal-pad"
                placeholder="0.00"
                hint="0 = free for this table"
                error={errors.price}
                containerStyle={styles.top}
              />
            ) : null}
          </>
        ) : null}
      </View>

      {/* Preview */}
      <Text style={styles.step}>{bookable ? 'How guests see it' : 'Preview'}</Text>
      <View style={styles.preview} accessible accessibilityLabel={`Preview: ${label || 'Table'}, ${areaName}, up to ${seatCount} guests`}>
        <View style={styles.previewBadge}>
          <Armchair size={18} color={Colors.primaryDark} />
          <Text style={styles.previewBadgeText} numberOfLines={1}>{label || 'T?'}</Text>
        </View>
        <View style={styles.flex}>
          <Text style={styles.previewTitle}>{/^\d+$/.test(label) ? `Table ${label}` : label || 'Your table'}</Text>
          <PreviewLine icon={MapPin} text={areaName || 'Choose an area'} />
          <PreviewLine icon={Users} text={`Up to ${seatCount} guest${seatCount === 1 ? '' : 's'}`} />
          {bookable ? (
            <>
              <PreviewLine icon={PoundSterling} text={previewPrice} />
              <PreviewLine icon={Clock} text={`Book up to ${previewLength} h · ${hoursSummary(settings.weekly)}`} />
            </>
          ) : (
            <Text style={styles.previewOff}>Not bookable online — you can still add phone and walk-in bookings for it.</Text>
          )}
        </View>
      </View>
      {errors.form ? <Text style={styles.error}>{errors.form}</Text> : null}
    </BottomSheet>
  );
}

function Chip({ label, active, onPress, icon: Icon, small }: { label: string; active: boolean; onPress: () => void; icon?: any; small?: boolean }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.chip, small && styles.chipSmall, active && styles.chipActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
    >
      {Icon ? <Icon size={14} color={active ? '#FFFFFF' : Colors.text} /> : null}
      <Text style={[styles.chipText, small && styles.chipTextSmall, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function PreviewLine({ icon: Icon, text }: { icon: any; text: string }) {
  return (
    <View style={styles.previewLine}>
      <Icon size={13} color={Colors.textMuted} />
      <Text style={styles.previewText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  top: { marginTop: 10 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  nameField: { width: 130 },
  step: { fontSize: 15, fontWeight: '800', color: Colors.text, marginTop: 18, marginBottom: 10 },
  label: { fontSize: 13, fontWeight: '700', color: Colors.text, marginTop: 14, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, borderWidth: 1, borderColor: Colors.cardBorder, backgroundColor: Colors.background },
  chipSmall: { paddingHorizontal: 10, paddingVertical: 5 },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: 14, fontWeight: '700', color: Colors.text },
  chipTextSmall: { fontSize: 12, fontWeight: '600' },
  chipTextActive: { color: '#FFFFFF' },
  card: { borderWidth: 1, borderColor: Colors.cardBorder, borderRadius: 14, paddingHorizontal: 14, paddingBottom: 14, backgroundColor: Colors.background },
  preview: { flexDirection: 'row', gap: 12, padding: 14, borderRadius: 14, backgroundColor: Colors.cardSurface, borderWidth: 1, borderColor: Colors.cardBorder },
  previewBadge: { width: 56, height: 56, borderRadius: 14, backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center', gap: 2 },
  previewBadgeText: { fontSize: 12, fontWeight: '900', color: Colors.primaryDark, maxWidth: 52 },
  previewTitle: { fontSize: 16, fontWeight: '800', color: Colors.text, marginBottom: 4 },
  previewLine: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  previewText: { fontSize: 13, color: Colors.text, flexShrink: 1 },
  previewOff: { fontSize: 13, color: Colors.textMuted, marginTop: 4, lineHeight: 18 },
  error: { fontSize: 13, color: Colors.danger, marginTop: 10, fontWeight: '600' },
});

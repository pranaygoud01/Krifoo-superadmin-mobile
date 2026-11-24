/**
 * Booking hours & rules — when guests can book tables online, set once.
 * Weekly hours (per day, up to 4 ranges), longest booking, how far ahead, notice, price model and
 * date exceptions (closed, different hours, tables off). Saved with the sticky save bar.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { CalendarClock, Clock, PoundSterling, CalendarX2, Plus, Trash2, Copy, Power, X } from 'lucide-react-native';
import { Colors } from '../constants/colors';
import { useToast } from '../context/ToastContext';
import { ScreenHeader } from '../components/ScreenHeader';
import { BottomSheet } from '../components/ui/BottomSheet';
import { DateField } from '../components/ui/DateField';
import { SearchableSelect } from '../components/SearchableSelect';
import {
  FormFrame,
  FormSection,
  ToggleRow,
  Segmented,
  StepperField,
  Field,
  PrimaryButton,
  SaveBar,
  SAVE_BAR_SPACE,
  LoadingState,
  ErrorView,
  Notice,
  useUnsavedChangesGuard,
  isEqualJSON,
  sanitizeDecimal,
} from '../components/settings/FormKit';
import { floorService, type LiveTable } from '../services/floor.service';
import {
  bookingSettingsService,
  WEEKDAYS,
  DAY_LONG,
  hoursSummary,
  priceSummary,
  type BookingSettings,
  type BookingException,
  type HourRange,
  type Weekday,
  type PriceModel,
} from '../services/booking-settings.service';

const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;
const toH = (s: string) => parseInt(s, 10);
const START_OPTIONS = Array.from({ length: 24 }, (_, h) => ({ value: hh(h), label: hh(h) }));
const endOptions = (start: string) => Array.from({ length: 24 - toH(start) }, (_, i) => toH(start) + i + 1).map((h) => ({ value: hh(h), label: h === 24 ? 'Midnight' : hh(h) }));
const PRESETS: { label: string; ranges: HourRange[] }[] = [
  { label: 'Lunch & dinner', ranges: [{ start: '12:00', end: '15:00' }, { start: '18:00', end: '22:00' }] },
  { label: 'Dinner only', ranges: [{ start: '17:00', end: '23:00' }] },
  { label: 'All day', ranges: [{ start: '12:00', end: '22:00' }] },
];

/** Problems with a set of ranges (shown inline, blocks saving). */
export function rangeProblem(ranges: HourRange[]): string | null {
  const sorted = [...ranges].sort((a, b) => toH(a.start) - toH(b.start));
  for (const r of sorted) if (toH(r.end) <= toH(r.start)) return 'Each time range must end after it starts.';
  for (let i = 1; i < sorted.length; i++) if (toH(sorted[i].start) < toH(sorted[i - 1].end)) return 'Time ranges overlap.';
  return null;
}

const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dateLabel = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

export default function BookingSettingsScreen() {
  const { showToast } = useToast();
  const [saved, setSaved] = useState<BookingSettings | null>(null);
  const [draft, setDraft] = useState<BookingSettings | null>(null);
  const [exists, setExists] = useState(false);
  const [tables, setTables] = useState<LiveTable[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [dayEdit, setDayEdit] = useState<Weekday | null>(null);
  const [exceptionEdit, setExceptionEdit] = useState<BookingException | null>(null);

  const load = useCallback(async () => {
    const [s, f] = await Promise.all([bookingSettingsService.getSetup(), floorService.getStatus()]);
    if (!s.success || !s.data) {
      setError(s.message || 'Couldn’t load your booking settings.');
      return;
    }
    setError('');
    const clean = normalise(s.data.settings);
    setSaved(clean);
    setDraft(clean);
    setExists(s.data.exists);
    if (f.success && f.data) setTables(f.data.floors.flatMap((fl) => fl.tables));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const dirty = !!draft && !!saved && (!exists || !isEqualJSON(draft, saved));
  useUnsavedChangesGuard(dirty && exists);

  const problems = useMemo(() => {
    if (!draft) return [];
    const out: string[] = [];
    WEEKDAYS.forEach((d) => {
      const p = rangeProblem(draft.weekly[d]);
      if (p) out.push(`${DAY_LONG[d]}: ${p}`);
    });
    if (draft.priceModel !== 'free' && !(draft.price > 0)) out.push('Enter a price, or choose Free.');
    return out;
  }, [draft]);

  const set = <K extends keyof BookingSettings>(key: K, value: BookingSettings[K]) => setDraft((d) => (d ? { ...d, [key]: value } : d));
  const setDay = (day: Weekday, ranges: HourRange[]) => setDraft((d) => (d ? { ...d, weekly: { ...d.weekly, [day]: ranges } } : d));

  const save = async () => {
    if (!draft) return;
    if (problems.length) return showToast({ title: 'Check your settings', message: problems[0], type: 'error' });
    setSaving(true);
    const { importedLegacyAt: _ignored, ...body } = draft;
    const res = await bookingSettingsService.save(body);
    setSaving(false);
    if (!res.success || !res.data) return showToast({ title: 'Couldn’t save', message: res.message || 'Please try again.', type: 'error' });
    const clean = normalise(res.data);
    setSaved(clean);
    setDraft(clean);
    setExists(true);
    showToast({ title: 'Booking settings saved', message: hoursSummary(clean.weekly), type: 'success' });
  };

  if (error && !draft) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="Booking hours" />
        <ErrorView message={error} onRetry={load} />
      </View>
    );
  }
  if (!draft) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="Booking hours" />
        <LoadingState />
      </View>
    );
  }

  const upcomingExceptions = draft.exceptions.filter((e) => e.date >= isoOf(new Date()));
  const pastExceptions = draft.exceptions.length - upcomingExceptions.length;

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Booking hours" subtitle="When guests can book tables online" />
      <ScrollView contentContainerStyle={{ paddingBottom: SAVE_BAR_SPACE + 20 }} keyboardShouldPersistTaps="handled">
        <FormFrame>
          {!exists ? (
            <Notice tone="info" icon={CalendarClock} title="Set this up once">
              Choose when tables can be booked. Guests then book any table you’ve made bookable — no daily posting. Save to switch it on.
            </Notice>
          ) : null}

          <FormSection title="Online booking" icon={Power}>
            <ToggleRow
              title="Guests can book tables in the app"
              description={draft.enabled ? 'On — bookable tables show in the Krifoo app' : 'Off — existing bookings stay, no new ones'}
              value={draft.enabled}
              onChange={(v) => set('enabled', v)}
              last
            />
          </FormSection>

          <FormSection title="Weekly booking hours" description={hoursSummary(draft.weekly)} icon={Clock}>
            {WEEKDAYS.map((d) => {
              const ranges = draft.weekly[d];
              const problem = rangeProblem(ranges);
              return (
                <TouchableOpacity key={d} style={styles.dayRow} onPress={() => setDayEdit(d)} accessibilityRole="button" accessibilityLabel={`${DAY_LONG[d]}: ${ranges.length ? ranges.map((r) => `${r.start} to ${r.end}`).join(', ') : 'closed'}. Edit`}>
                  <Text style={styles.dayName}>{DAY_LONG[d]}</Text>
                  <View style={styles.dayRanges}>
                    {ranges.length ? (
                      ranges.map((r, i) => (
                        <View key={i} style={styles.rangePill}>
                          <Text style={styles.rangeText}>{r.start}–{r.end === '24:00' ? '00:00' : r.end}</Text>
                        </View>
                      ))
                    ) : (
                      <Text style={styles.closed}>Closed</Text>
                    )}
                  </View>
                  {problem ? <Text style={styles.problem}>!</Text> : <Text style={styles.edit}>Edit</Text>}
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              style={styles.copyRow}
              onPress={() => {
                const mon = draft.weekly.mon;
                setDraft((dd) => (dd ? { ...dd, weekly: Object.fromEntries(WEEKDAYS.map((w) => [w, mon.map((r) => ({ ...r }))])) as BookingSettings['weekly'] } : dd));
              }}
              accessibilityRole="button"
            >
              <Copy size={14} color={Colors.primary} />
              <Text style={styles.copyText}>Copy Monday to every day</Text>
            </TouchableOpacity>
          </FormSection>

          <FormSection title="Booking rules" icon={CalendarClock}>
            <StepperField label="Longest booking" hint="Guests pick consecutive hours up to this. A table can have its own limit." value={String(draft.maxBookingHours)} onChange={(v) => set('maxBookingHours', Math.max(1, Math.min(12, Number(v) || 1)))} step={1} min={1} max={12} suffix="h" />
            <Text style={styles.label}>Guests can book up to</Text>
            <Segmented
              options={[7, 14, 30, 60, 90].map((n) => ({ value: String(n), label: `${n} days` }))}
              value={String(draft.maxDaysAhead)}
              onChange={(v) => set('maxDaysAhead', Number(v))}
            />
            <Text style={styles.label}>Free cancellation (full refund) up to</Text>
            <Segmented
              options={[
                { value: '0', label: 'Start' },
                { value: '2', label: '2 h' },
                { value: '12', label: '12 h' },
                { value: '24', label: '24 h' },
                { value: '48', label: '48 h' },
              ]}
              value={String(draft.freeCancelHours)}
              onChange={(v) => set('freeCancelHours', Number(v))}
            />
            <Text style={styles.hint}>
              {draft.freeCancelHours ? `Guests who cancel later than ${draft.freeCancelHours} h before can still cancel, but any deposit is kept.` : 'Guests get a full refund any time before the booking starts.'}
            </Text>
            <Text style={styles.label}>Minimum notice</Text>
            <Segmented
              options={[
                { value: '0', label: 'None' },
                { value: '30', label: '30 min' },
                { value: '60', label: '1 h' },
                { value: '120', label: '2 h' },
                { value: '1440', label: '1 day' },
              ]}
              value={String(draft.minNoticeMinutes)}
              onChange={(v) => set('minNoticeMinutes', Number(v))}
            />
          </FormSection>

          <FormSection title="Price" description={priceSummary(draft.priceModel, draft.price)} icon={PoundSterling}>
            <Segmented<PriceModel>
              options={[
                { value: 'free', label: 'Free' },
                { value: 'per_booking', label: 'Deposit' },
                { value: 'per_hour', label: 'Per hour' },
              ]}
              value={draft.priceModel}
              onChange={(v) => set('priceModel', v)}
            />
            {draft.priceModel !== 'free' ? (
              <Field
                label={draft.priceModel === 'per_booking' ? 'Deposit per booking' : 'Price per hour'}
                prefix="£"
                value={draft.price ? String(draft.price) : ''}
                onChangeText={(v) => set('price', Number(sanitizeDecimal(v)) || 0)}
                keyboardType="decimal-pad"
                placeholder="0.00"
                hint={draft.priceModel === 'per_booking' ? 'Paid once when booking, whatever the length. Refunded if you cancel.' : 'Charged for each hour booked.'}
                containerStyle={styles.top}
              />
            ) : (
              <Text style={styles.hint}>No card needed — guests confirm instantly.</Text>
            )}
          </FormSection>

          <FormSection
            title="Special dates"
            description="Holidays, private events, different hours"
            icon={CalendarX2}
            right={<PrimaryButton label="Add date" icon={Plus} tone="secondary" onPress={() => setExceptionEdit({ date: isoOf(new Date(Date.now() + 86400e3)), closed: true, hours: [], blockedTableIds: [], note: '' })} />}
          >
            {upcomingExceptions.length === 0 ? <Text style={styles.hint}>No special dates coming up.</Text> : null}
            {upcomingExceptions.map((e) => (
              <View key={e.date} style={styles.excRow}>
                <TouchableOpacity style={styles.flex} onPress={() => setExceptionEdit(e)} accessibilityRole="button" accessibilityLabel={`Edit ${dateLabel(e.date)}`}>
                  <Text style={styles.excDate}>{dateLabel(e.date)}</Text>
                  <Text style={styles.excWhat}>
                    {e.closed ? 'Closed for bookings' : e.hours.length ? e.hours.map((r) => `${r.start}–${r.end}`).join(', ') : 'Normal hours'}
                    {e.blockedTableIds.length ? ` · ${e.blockedTableIds.length} table${e.blockedTableIds.length === 1 ? '' : 's'} off` : ''}
                    {e.note ? ` · ${e.note}` : ''}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => set('exceptions', draft.exceptions.filter((x) => x.date !== e.date))} style={styles.iconBtn} accessibilityLabel={`Remove ${dateLabel(e.date)}`}>
                  <Trash2 size={16} color={Colors.danger} />
                </TouchableOpacity>
              </View>
            ))}
            {pastExceptions ? (
              <TouchableOpacity onPress={() => set('exceptions', upcomingExceptions)} accessibilityRole="button">
                <Text style={styles.copyText}>Clear {pastExceptions} past date{pastExceptions === 1 ? '' : 's'}</Text>
              </TouchableOpacity>
            ) : null}
          </FormSection>

          {problems.length ? (
            <Notice tone="warning" title="Fix before saving">
              {problems.join('\n')}
            </Notice>
          ) : null}
        </FormFrame>
      </ScrollView>

      <SaveBar visible={dirty} saving={saving} onSave={save} onDiscard={() => setDraft(saved)} errorCount={problems.length} saveLabel={exists ? 'Save changes' : 'Save & switch on'} />

      {dayEdit ? (
        <DaySheet
          day={dayEdit}
          ranges={draft.weekly[dayEdit]}
          onClose={() => setDayEdit(null)}
          onApply={(ranges, to) => {
            const days: Weekday[] = to === 'day' ? [dayEdit] : to === 'weekdays' ? ['mon', 'tue', 'wed', 'thu', 'fri'] : to === 'weekend' ? ['sat', 'sun'] : [...WEEKDAYS];
            days.forEach((d) => setDay(d, ranges.map((r) => ({ ...r }))));
            setDayEdit(null);
          }}
        />
      ) : null}

      {exceptionEdit ? (
        <ExceptionSheet
          initial={exceptionEdit}
          tables={tables}
          taken={draft.exceptions.map((e) => e.date).filter((d) => d !== exceptionEdit.date)}
          onClose={() => setExceptionEdit(null)}
          onSave={(e, previousDate) => {
            set('exceptions', [...draft.exceptions.filter((x) => x.date !== previousDate && x.date !== e.date), e].sort((a, b) => a.date.localeCompare(b.date)));
            setExceptionEdit(null);
          }}
        />
      ) : null}
    </View>
  );
}

/** Settings from the server with every weekday present. */
function normalise(s: BookingSettings): BookingSettings {
  return {
    enabled: s.enabled !== false,
    weekly: Object.fromEntries(WEEKDAYS.map((d) => [d, (s.weekly?.[d] || []).map((r) => ({ start: r.start, end: r.end }))])) as BookingSettings['weekly'],
    maxBookingHours: s.maxBookingHours ?? 2,
    maxDaysAhead: s.maxDaysAhead ?? 30,
    minNoticeMinutes: s.minNoticeMinutes ?? 60,
    freeCancelHours: s.freeCancelHours ?? 24,
    priceModel: s.priceModel || 'free',
    price: s.price ?? 0,
    exceptions: (s.exceptions || []).map((e) => ({ date: e.date, closed: !!e.closed, hours: (e.hours || []).map((r) => ({ start: r.start, end: r.end })), blockedTableIds: (e.blockedTableIds || []).map(String), note: e.note || '' })),
  };
}

/* ── Hours editor (used for a weekday and for special dates) ─────────── */

function RangesEditor({ ranges, onChange }: { ranges: HourRange[]; onChange: (r: HourRange[]) => void }) {
  const problem = rangeProblem(ranges);
  return (
    <View>
      {ranges.map((r, i) => (
        <View key={i} style={styles.rangeEdit}>
          <View style={styles.flex}>
            <SearchableSelect
              title="From"
              searchPlaceholder="Search times"
              value={r.start}
              onChange={(v) => onChange(ranges.map((x, idx) => (idx === i ? { start: v, end: toH(x.end) > toH(v) ? x.end : hh(Math.min(24, toH(v) + 1)) } : x)))}
              options={START_OPTIONS}
            />
          </View>
          <Text style={styles.to}>to</Text>
          <View style={styles.flex}>
            <SearchableSelect title="Until" searchPlaceholder="Search times" value={r.end} onChange={(v) => onChange(ranges.map((x, idx) => (idx === i ? { ...x, end: v } : x)))} options={endOptions(r.start)} />
          </View>
          <TouchableOpacity onPress={() => onChange(ranges.filter((_, idx) => idx !== i))} style={styles.iconBtn} accessibilityLabel={`Remove ${r.start} to ${r.end}`}>
            <X size={16} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>
      ))}
      {ranges.length < 4 ? (
        <TouchableOpacity
          style={styles.copyRow}
          onPress={() => {
            const last = ranges[ranges.length - 1];
            const start = last ? Math.min(23, toH(last.end) + 1) : 12;
            onChange([...ranges, { start: hh(start), end: hh(Math.min(24, start + 3)) }]);
          }}
          accessibilityRole="button"
        >
          <Plus size={14} color={Colors.primary} />
          <Text style={styles.copyText}>{ranges.length ? 'Add more hours' : 'Add hours'}</Text>
        </TouchableOpacity>
      ) : null}
      <View style={styles.presets}>
        {PRESETS.map((p) => (
          <TouchableOpacity key={p.label} style={styles.preset} onPress={() => onChange(p.ranges.map((r) => ({ ...r })))} accessibilityRole="button">
            <Text style={styles.presetText}>{p.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {problem ? <Text style={styles.problemText}>{problem}</Text> : null}
    </View>
  );
}

function DaySheet({ day, ranges, onClose, onApply }: { day: Weekday; ranges: HourRange[]; onClose: () => void; onApply: (r: HourRange[], to: 'day' | 'weekdays' | 'weekend' | 'all') => void }) {
  const [draft, setDraft] = useState<HourRange[]>(ranges.map((r) => ({ ...r })));
  const [open, setOpen] = useState(ranges.length > 0);
  const value = open ? draft : [];
  const bad = open && (!draft.length || !!rangeProblem(draft));
  return (
    <BottomSheet
      visible
      title={DAY_LONG[day]}
      subtitle="Hours guests can book"
      onClose={onClose}
      footer={<PrimaryButton label={`Save ${DAY_LONG[day]}`} disabled={bad} onPress={() => onApply(value, 'day')} style={styles.flex} />}
    >
      <ToggleRow title={open ? 'Open for bookings' : 'Closed for bookings'} value={open} onChange={(v) => { setOpen(v); if (v && !draft.length) setDraft(PRESETS[0].ranges.map((r) => ({ ...r }))); }} last />
      {open ? <RangesEditor ranges={draft} onChange={setDraft} /> : null}
      <Text style={styles.label}>Use these hours for</Text>
      <View style={styles.presets}>
        {(['weekdays', 'weekend', 'all'] as const).map((to) => (
          <TouchableOpacity key={to} style={[styles.preset, bad && styles.dim]} disabled={bad} onPress={() => onApply(value, to)} accessibilityRole="button">
            <Text style={styles.presetText}>{to === 'weekdays' ? 'Mon–Fri' : to === 'weekend' ? 'Sat & Sun' : 'Every day'}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </BottomSheet>
  );
}

/* ── Special date editor ─────────────────────────────────────────────── */

function ExceptionSheet({
  initial,
  tables,
  taken,
  onClose,
  onSave,
}: {
  initial: BookingException;
  tables: LiveTable[];
  taken: string[];
  onClose: () => void;
  onSave: (e: BookingException, previousDate: string) => void;
}) {
  const [date, setDate] = useState(initial.date);
  const [kind, setKind] = useState<'closed' | 'hours' | 'tables'>(initial.closed ? 'closed' : initial.hours.length ? 'hours' : initial.blockedTableIds.length ? 'tables' : 'closed');
  const [hours, setHours] = useState<HourRange[]>(initial.hours.length ? initial.hours : [{ start: '18:00', end: '22:00' }]);
  const [blocked, setBlocked] = useState<string[]>(initial.blockedTableIds);
  const [note, setNote] = useState(initial.note || '');
  const clash = taken.includes(date);
  const problem = clash
    ? 'That date already has a special entry.'
    : kind === 'hours' && (!hours.length || rangeProblem(hours))
    ? rangeProblem(hours) || 'Add the hours for that day.'
    : kind === 'tables' && !blocked.length
    ? 'Choose the tables that are off.'
    : null;

  const save = () => {
    if (problem) return Alert.alert('Check the date', problem);
    onSave(
      { date, closed: kind === 'closed', hours: kind === 'hours' ? hours : [], blockedTableIds: kind === 'tables' ? blocked : [], note: note.trim() },
      initial.date
    );
  };
  const bookable = tables.filter((t) => t.bookable);

  return (
    <BottomSheet visible title="Special date" subtitle="Overrides the weekly hours for one day" onClose={onClose} footer={<PrimaryButton label="Done" onPress={save} style={styles.flex} />}>
      <DateField label="Date" value={new Date(`${date}T12:00:00`)} onChange={(d) => setDate(isoOf(d))} minimumDate={new Date()} />
      <Text style={styles.label}>What changes</Text>
      <Segmented
        options={[
          { value: 'closed', label: 'Closed' },
          { value: 'hours', label: 'Other hours' },
          { value: 'tables', label: 'Tables off' },
        ]}
        value={kind}
        onChange={setKind}
      />
      {kind === 'hours' ? (
        <View style={styles.top}>
          <RangesEditor ranges={hours} onChange={setHours} />
        </View>
      ) : null}
      {kind === 'tables' ? (
        bookable.length ? (
          <View style={[styles.presets, styles.top]}>
            {bookable.map((t) => {
              const on = blocked.includes(t._id);
              return (
                <TouchableOpacity
                  key={t._id}
                  style={[styles.preset, on && styles.presetOn]}
                  onPress={() => setBlocked((b) => (on ? b.filter((x) => x !== t._id) : [...b, t._id]))}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${t.label}${on ? ', off that day' : ''}`}
                >
                  <Text style={[styles.presetText, on && styles.presetTextOn]}>{t.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          <Text style={styles.hint}>No tables are bookable online yet.</Text>
        )
      ) : null}
      <Field label="Note (for you)" value={note} onChangeText={setNote} placeholder="e.g. Christmas, private party" maxLength={80} containerStyle={styles.top} />
      {problem ? <Text style={styles.problemText}>{problem}</Text> : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.backgroundSecondary },
  flex: { flex: 1 },
  top: { marginTop: 12 },
  label: { fontSize: 13, fontWeight: '700', color: Colors.text, marginTop: 14, marginBottom: 8 },
  hint: { fontSize: 13, color: Colors.textMuted, marginTop: 8 },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.cardBorder },
  dayName: { width: 92, fontSize: 14, fontWeight: '700', color: Colors.text },
  dayRanges: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  rangePill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: Colors.primaryLight },
  rangeText: { fontSize: 12, fontWeight: '700', color: Colors.primaryDark },
  closed: { fontSize: 13, color: Colors.textMuted },
  edit: { fontSize: 13, fontWeight: '700', color: Colors.primary },
  problem: { fontSize: 15, fontWeight: '900', color: Colors.danger, paddingHorizontal: 6 },
  copyRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10 },
  copyText: { fontSize: 13, fontWeight: '700', color: Colors.primary },
  rangeEdit: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  to: { fontSize: 13, color: Colors.textMuted },
  iconBtn: { padding: 8 },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  preset: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 1, borderColor: Colors.cardBorder, backgroundColor: Colors.background },
  presetOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  presetText: { fontSize: 13, fontWeight: '600', color: Colors.text },
  presetTextOn: { color: '#FFFFFF' },
  dim: { opacity: 0.5 },
  problemText: { fontSize: 13, fontWeight: '600', color: Colors.danger, marginTop: 10 },
  excRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.cardBorder },
  excDate: { fontSize: 14, fontWeight: '700', color: Colors.text },
  excWhat: { fontSize: 13, color: Colors.textMuted, marginTop: 2 },
});

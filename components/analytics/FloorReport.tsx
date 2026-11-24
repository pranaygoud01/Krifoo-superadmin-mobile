/**
 * Tables & floor report (Analytics → Tables & floor): how tables were used — visits, guests,
 * turn time, spend per guest, busiest hours, floors and tables. Built from closed table visits.
 * Content only: the Analytics screen provides the header and scrolling.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { BarChart3 } from 'lucide-react-native';
import { Colors } from '../../constants/colors';
import { LoadingState, Segmented, Notice, useFormLayout } from '../settings/FormKit';
import { Card, EmptyState, LoadError, formatGBP } from '../ui/ListKit';
import { floorService, type FloorReport as FloorReportData } from '../../services/floor.service';

const RANGES = [
  { value: '1', label: 'Today' },
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
];
const BAR = '#3B6FD8'; // one hue for magnitude
const hourLabel = (h: number) => `${String(h).padStart(2, '0')}:00`;
const mins = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`);

/** `refreshKey`: bump it to reload (the Analytics refresh button / pull-to-refresh). `onLoaded` ends the parent's spinner. */
export function FloorReport({ refreshKey = 0, onLoaded }: { refreshKey?: number; onLoaded?: () => void }) {
  const { isTablet } = useFormLayout();
  const [days, setDays] = useState('7');
  const [report, setReport] = useState<FloorReportData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const onLoadedRef = useRef(onLoaded);
  onLoadedRef.current = onLoaded;

  const load = useCallback(async (d: string) => {
    setLoading(true);
    const res = await floorService.getReport(Number(d));
    setLoading(false);
    onLoadedRef.current?.();
    if (!res.success || !res.data) {
      setError(res.message || 'Could not load the report.');
      return;
    }
    setError('');
    setReport(res.data);
  }, []);

  useEffect(() => {
    load(days);
  }, [load, days, refreshKey]);

  const t = report?.totals;
  const kpis = t
    ? [
        { label: 'Visits', value: `${t.visits}` },
        { label: 'Guests', value: `${t.guests}`, sub: `${t.avgPartySize} per table` },
        { label: 'Takings', value: formatGBP(t.revenue) },
        { label: 'Spend per guest', value: formatGBP(t.spendPerGuest), sub: `${formatGBP(t.spendPerVisit)} per table` },
        { label: 'Avg time at table', value: mins(t.avgTurnMins), sub: `median ${mins(t.medianTurnMins)}` },
        { label: 'Order → served', value: t.avgServeMins ? mins(t.avgServeMins) : '—' },
      ]
    : [];

  // Opening hours only: trim empty hours at both ends
  const hours = report?.byHour || [];
  const firstHour = hours.findIndex((h) => h.visits > 0);
  const lastHour = hours.length - 1 - [...hours].reverse().findIndex((h) => h.visits > 0);
  const shownHours = firstHour >= 0 ? hours.slice(firstHour, lastHour + 1) : [];

  return (
    <View style={styles.content}>
      <Text style={styles.intro}>From closed table visits on the Floor screen</Text>
      <Segmented options={RANGES} value={days} onChange={setDays} />

      {loading && !report ? (
        <LoadingState label="Working out the numbers…" />
      ) : error && !report ? (
        <LoadError message={error} onRetry={() => load(days)} />
      ) : !t || t.visits === 0 ? (
        <EmptyState icon={BarChart3} title="No closed tables yet" message="Reports fill in as you seat guests and close their bills on the Floor screen." />
      ) : (
        <>
          {report?.truncated ? <Notice tone="warning">Showing the most recent 20,000 visits in this period.</Notice> : null}

          <View style={styles.kpis}>
            {kpis.map((k) => (
              <Card key={k.label} style={[styles.kpi, { width: isTablet ? '32%' : '48.5%' }]}>
                <Text style={styles.kpiLabel}>{k.label}</Text>
                <Text style={styles.kpiValue}>{k.value}</Text>
                {k.sub ? <Text style={styles.kpiSub}>{k.sub}</Text> : null}
              </Card>
            ))}
          </View>

          <Card style={styles.block}>
            <Text style={styles.blockTitle}>Guests seated by hour</Text>
            <Text style={styles.blockSub}>
              {t.peakHour !== null ? `Busiest: ${hourLabel(t.peakHour)}–${hourLabel((t.peakHour + 1) % 24)} (UK time)` : 'UK time'}
            </Text>
            <Bars
              items={shownHours.map((h) => ({ key: String(h.hour), label: String(h.hour).padStart(2, '0'), value: h.guests, a11y: `${hourLabel(h.hour)}: ${h.guests} guests, ${h.visits} tables` }))}
              highlight={t.peakHour !== null ? String(t.peakHour) : undefined}
            />
          </Card>

          <Card style={styles.block}>
            <Text style={styles.blockTitle}>Guests by day of week</Text>
            <Bars
              items={(report?.byWeekday || []).map((d) => ({ key: d.day, label: d.day, value: d.guests, a11y: `${d.day}: ${d.guests} guests, ${formatGBP(d.revenue)}` }))}
              highlight={(report?.byWeekday || []).reduce((b, d) => (d.guests > b.guests ? d : b), { day: '', guests: 0 } as any).day || undefined}
            />
          </Card>

          <Card style={styles.block}>
            <Text style={styles.blockTitle}>How guests paid</Text>
            {(['card', 'cash', 'other', 'online'] as const).map((m) => {
              const v = report?.paymentMix[m] || 0;
              const share = t.revenue ? Math.round((v / t.revenue) * 100) : 0;
              return (
                <View key={m} style={styles.tableRow}>
                  <Text style={[styles.cellMain, styles.flex]}>{m === 'card' ? 'Card at table' : m === 'cash' ? 'Cash' : m === 'online' ? 'Paid in app (QR)' : 'Other'}</Text>
                  <Text style={styles.cellNum}>{formatGBP(v)}</Text>
                  <Text style={[styles.cellNum, styles.cellMuted]}>{share}%</Text>
                </View>
              );
            })}
            <Text style={styles.blockSub}>
              {t.qrVisits} table{t.qrVisits === 1 ? '' : 's'} started by QR · {t.reservationVisits} from reservations
            </Text>
          </Card>

          <RankTable
            title="Floors"
            rows={(report?.byFloor || []).map((f) => ({ ...f, key: String(f.floorId) }))}
          />
          <RankTable
            title="Tables (by takings)"
            rows={(report?.byTable || []).slice(0, 15).map((r) => ({ key: String(r.tableId), name: r.floorName ? `${r.label} · ${r.floorName}` : r.label, ...r }))}
          />
        </>
      )}
    </View>
  );
}

/** Single-series vertical bars; only the highlighted (peak) bar carries its value. */
function Bars({ items, highlight }: { items: { key: string; label: string; value: number; a11y: string }[]; highlight?: string }) {
  const [active, setActive] = useState<string | null>(null);
  const max = Math.max(1, ...items.map((i) => i.value));
  const shownKey = active ?? highlight;
  const shown = items.find((i) => i.key === shownKey);
  return (
    <View>
      <Text style={styles.barReadout}>{shown ? shown.a11y : ' '}</Text>
      <View style={styles.bars} accessibilityRole="summary">
        {items.map((i) => (
          <TouchableOpacity
            key={i.key}
            style={styles.barCol}
            onPress={() => setActive((a) => (a === i.key ? null : i.key))}
            accessibilityRole="button"
            accessibilityLabel={i.a11y}
          >
            <View style={styles.barTrack}>
              <View style={[styles.bar, { height: `${Math.max(2, (i.value / max) * 100)}%`, opacity: shownKey && shownKey !== i.key ? 0.55 : 1 }]} />
            </View>
            <Text style={styles.barLabel} numberOfLines={1}>{i.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function RankTable({ title, rows }: { title: string; rows: { key: string; name: string; visits: number; guests: number; revenue: number; avgTurnMins: number; spendPerGuest: number }[] }) {
  if (!rows.length) return null;
  return (
    <Card style={styles.block}>
      <Text style={styles.blockTitle}>{title}</Text>
      <View style={[styles.tableRow, styles.tableHead]}>
        <Text style={[styles.headCell, styles.flex]}>Name</Text>
        <Text style={styles.headNum}>Visits</Text>
        <Text style={styles.headNum}>Guests</Text>
        <Text style={styles.headNum}>Time</Text>
        <Text style={styles.headNum}>£/guest</Text>
        <Text style={styles.headNum}>Takings</Text>
      </View>
      {rows.map((r) => (
        <View key={r.key} style={styles.tableRow}>
          <Text style={[styles.cellMain, styles.flex]} numberOfLines={1}>{r.name}</Text>
          <Text style={styles.cellNum}>{r.visits}</Text>
          <Text style={styles.cellNum}>{r.guests}</Text>
          <Text style={styles.cellNum}>{mins(r.avgTurnMins)}</Text>
          <Text style={styles.cellNum}>{formatGBP(r.spendPerGuest)}</Text>
          <Text style={[styles.cellNum, styles.cellStrong]}>{formatGBP(r.revenue)}</Text>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12, width: '100%' },
  intro: { fontSize: 13, color: Colors.textMuted },
  flex: { flex: 1 },
  kpis: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 },
  kpi: { padding: 12, gap: 2 },
  kpiLabel: { fontSize: 12, color: Colors.textMuted },
  kpiValue: { fontSize: 22, fontWeight: '800', color: Colors.text },
  kpiSub: { fontSize: 12, color: Colors.textMuted },
  block: { padding: 14, gap: 6 },
  blockTitle: { fontSize: 15, fontWeight: '800', color: Colors.text },
  blockSub: { fontSize: 12, color: Colors.textMuted },
  barReadout: { fontSize: 12, color: Colors.text, marginTop: 4 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', height: 150, gap: 2, marginTop: 6 },
  barCol: { flex: 1, height: '100%', alignItems: 'center' },
  barTrack: { flex: 1, width: '100%', justifyContent: 'flex-end', borderBottomWidth: 1, borderBottomColor: Colors.cardBorder },
  bar: { width: '100%', maxWidth: 28, alignSelf: 'center', backgroundColor: BAR, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  barLabel: { fontSize: 10, color: Colors.textMuted, marginTop: 4 },
  tableHead: { borderBottomWidth: 1, borderBottomColor: Colors.cardBorder },
  tableRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.cardBorder },
  headCell: { fontSize: 11, fontWeight: '700', color: Colors.textMuted },
  headNum: { width: 56, textAlign: 'right', fontSize: 11, fontWeight: '700', color: Colors.textMuted },
  cellMain: { fontSize: 13, color: Colors.text },
  cellNum: { width: 56, textAlign: 'right', fontSize: 13, color: Colors.text, fontVariant: ['tabular-nums'] },
  cellMuted: { color: Colors.textMuted },
  cellStrong: { fontWeight: '700' },
});

/**
 * Live floor — every table on every floor, who's sitting there, what they ordered and when.
 * Tap a table to seat a party (or a reservation), add orders, serve them, move or join tables,
 * ask for the bill and close it with one or more payments.
 * Updates live over the websocket (RESTAURANT_FLOOR_UPDATE), every 30 s and on focus.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  DeviceEventEmitter,
  useWindowDimensions,
  BackHandler,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  Settings2,
  Users,
  Armchair,
  LayoutGrid,
  List,
  Clock,
  Plus,
  Receipt,
  CheckCircle2,
  Ban,
  Sparkles,
  Layers,
  ArrowRightLeft,
  Combine,
  X,
  CalendarClock,
  AlertTriangle,
  QrCode,
} from 'lucide-react-native';
import { Colors } from '../constants/colors';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ModeTopBar } from '../components/ModeTopBar';
import { useKeepAwake } from 'expo-keep-awake';
import { BottomSheet } from '../components/ui/BottomSheet';
import { CreateOrderModal } from '../components/CreateOrderModal';
import { Field, StepperField, PrimaryButton, Notice, LoadingState, useFormLayout, sanitizeDecimal } from '../components/settings/FormKit';
import { FilterChips, Card, EmptyState, LoadError, TextAction, formatGBP } from '../components/ui/ListKit';
import {
  floorService,
  TABLE_STATUS_META,
  sinceLabel,
  clockLabel,
  tableAlert,
  type FloorStatus,
  type FloorSummary,
  type LiveTable,
  type PaymentMethod,
  type Reservation,
  type Visit,
  type VisitOrder,
} from '../services/floor.service';

const REFRESH_MS = 30000;
const LEGEND = ['free', 'seated', 'ordered', 'served', 'bill_requested', 'cleaning'] as const;
const PAYMENT_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'other', label: 'Other' },
];

const ORDER_STEP: Record<string, string> = {
  awaiting_payment: 'Awaiting payment',
  placed: 'Ordered',
  preparing: 'Preparing',
  ready_for_pickup: 'Ready',
  out_for_delivery: 'On the way',
  delivered: 'Served',
  cancelled: 'Cancelled',
};

type PayLine = { method: PaymentMethod; amount: string };
/** What the table picker is choosing a table for */
type Picker = { kind: 'move' | 'join' } | { kind: 'reservation'; reservation: Reservation } | null;

const money = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

export default function FloorScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { showToast } = useToast();
  const restaurantLabel = user?.restaurantName || (user as any)?.name || '';
  const { gutter } = useFormLayout();
  // Full-screen floor mode (like the POS): screen stays on; leaving takes a press-and-hold
  useKeepAwake();
  const exitHint = useCallback(() => {
    showToast({ type: 'info', title: 'Floor', message: 'Press and hold “Exit” to leave the floor.' });
  }, [showToast]);
  const exitFloor = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }, [router]);
  // Android back only asks for the press-and-hold while the Floor itself is on screen
  // (Reports / Setup opened from here still go back normally).
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        exitHint();
        return true;
      });
      return () => sub.remove();
    }, [exitHint])
  );
  const { width, height } = useWindowDimensions();
  // Landscape tablets: floor on the left, a docked panel on the right (Today, or the open table)
  const landscape = width >= 900 && width > height;
  const panelWidth = Math.max(340, Math.min(420, Math.round(width * 0.32)));
  const [mainWidth, setMainWidth] = useState(0);
  const floorAreaWidth = landscape ? (mainWidth || width - panelWidth) : Math.min(width, 1200);

  const [data, setData] = useState<FloorStatus | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [floorId, setFloorId] = useState('');
  const [mode, setMode] = useState<'plan' | 'list'>(width >= 600 ? 'plan' : 'list');
  const [now, setNow] = useState(Date.now());
  const [reservations, setReservations] = useState<Reservation[]>([]);

  const [tableId, setTableId] = useState<string | null>(null);
  const [visit, setVisit] = useState<Visit | null>(null);
  const [visitLoading, setVisitLoading] = useState(false);
  const [partySize, setPartySize] = useState('2');
  const [busy, setBusy] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [payLines, setPayLines] = useState<PayLine[]>([{ method: 'cash', amount: '' }]);
  const [posOpen, setPosOpen] = useState(false);
  const [picker, setPicker] = useState<Picker>(null);

  /* ── Data ───────────────────────────────────────────────────────────── */
  const loadReservations = useCallback(async () => {
    const res = await floorService.listReservations();
    if (res.success && Array.isArray(res.data)) setReservations(res.data);
  }, []);

  const load = useCallback(async () => {
    const res = await floorService.getStatus();
    setRefreshing(false);
    setNow(Date.now());
    if (!res.success || !res.data) {
      setError(res.message || 'Could not load the floor.');
      return;
    }
    setError('');
    setData(res.data);
    setFloorId((cur) => (res.data!.floors.some((f) => f._id === cur) ? cur : res.data!.floors[0]?._id || ''));
  }, []);

  const loadAll = useCallback(() => {
    load();
    loadReservations();
  }, [load, loadReservations]);

  useFocusEffect(
    useCallback(() => {
      loadAll();
    }, [loadAll])
  );

  const allTables = useMemo(() => (data?.floors || []).flatMap((f) => f.tables.map((t) => ({ ...t, floorName: f.name }))), [data]);
  const table = useMemo(() => allTables.find((t) => t._id === tableId), [allTables, tableId]);
  const sessionId = table?.session?._id || null;
  const freeTables = useMemo(() => allTables.filter((t) => t.status === 'free'), [allTables]);
  const waitingReservations = useMemo(
    () => reservations.filter((r) => !r.seating && ['pending', 'confirmed'].includes(r.status)),
    [reservations]
  );

  const loadVisit = useCallback(async (id: string) => {
    setVisitLoading(true);
    const res = await floorService.getVisit(id);
    setVisitLoading(false);
    if (res.success && res.data) setVisit(res.data);
  }, []);

  useEffect(() => {
    const interval = setInterval(loadAll, REFRESH_MS);
    const sub = DeviceEventEmitter.addListener('websocket_message', (msg: any) => {
      if (msg?.type === 'RESTAURANT_FLOOR_UPDATE') load();
      if (msg?.type === 'RESTAURANT_BOOKING_UPDATE') loadReservations();
    });
    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, [load, loadAll, loadReservations]);

  // Keep the open table's visit in step with the floor (orders served in the kitchen, etc.)
  useEffect(() => {
    if (!tableId) return;
    if (sessionId) loadVisit(sessionId);
    else setVisit(null);
  }, [tableId, sessionId, data?.generatedAt, loadVisit]);

  /* ── Actions ────────────────────────────────────────────────────────── */
  const openTable = (t: LiveTable) => {
    // A joined table opens its party's main table
    const main = t.joinedTo && t.session ? allTables.find((x) => x.session?._id === t.session!._id && !x.joinedTo) : null;
    const target = main || t;
    setTableId(target._id);
    setVisit(null);
    setClosing(false);
    setPartySize(String(target.session?.partySize || target.seats));
  };
  const closeSheet = () => {
    setTableId(null);
    setVisit(null);
    setClosing(false);
  };

  const run = async (key: string, fn: () => Promise<{ success: boolean; message?: string }>, done?: string) => {
    setBusy(key);
    const res = await fn();
    setBusy(null);
    if (!res.success) {
      showToast({ type: 'error', message: res.message || 'Something went wrong.' });
      return false;
    }
    if (done) showToast({ type: 'success', message: done });
    load();
    return true;
  };

  const seat = () => {
    if (!table) return;
    const n = Number(partySize);
    const go = () => run('seat', () => floorService.seat(table._id, n), `${table.label} seated · ${n} guest${n === 1 ? '' : 's'}`);
    const res = table.nextReservation;
    const minsUntil = res ? (new Date(res.startsAt).getTime() - Date.now()) / 60000 : Infinity;
    if (res && minsUntil < 90) {
      Alert.alert(
        `${table.label} is reserved at ${res.time}`,
        `${res.name} (${res.guests}) is booked ${minsUntil <= 0 ? 'now' : `in ${Math.round(minsUntil)} min`}. Seat walk-ins here anyway?`,
        [
          { text: 'Choose another table', style: 'cancel' },
          { text: 'Seat anyway', style: 'destructive', onPress: go },
        ]
      );
      return;
    }
    go();
  };

  const seatReservation = async (r: Reservation, target: LiveTable) => {
    const okRes = await run('reservation', () => floorService.seat(target._id, undefined, { bookingId: r._id }), `${r.customerName} seated at ${target.label}`);
    if (okRes) {
      loadReservations();
      setPicker(null);
    }
  };

  const saveGuests = () => {
    if (!sessionId) return;
    run('guests', () => floorService.updateVisit(sessionId, { partySize: Number(partySize) }), 'Guests updated');
  };

  const serve = (o: VisitOrder) => {
    if (!sessionId) return;
    run(`serve-${o._id}`, () => floorService.serveOrder(sessionId, o._id), `#${o.orderNumber} served`).then((okServe) => {
      if (okServe) loadVisit(sessionId);
    });
  };

  const pickTable = async (target: LiveTable) => {
    if (!picker) return;
    if (picker.kind === 'reservation') return seatReservation(picker.reservation, target);
    if (!sessionId || !table) return;
    const label = table.label;
    const okPick =
      picker.kind === 'move'
        ? await run('pick', () => floorService.moveVisit(sessionId, target._id), `Party moved from ${label} to ${target.label}`)
        : await run('pick', () => floorService.joinTable(sessionId, target._id), `${target.label} joined to ${label}`);
    if (!okPick) return;
    setPicker(null);
    if (picker.kind === 'move') setTableId(target._id);
  };

  const release = (extra: { tableId: string; label: string }) => {
    if (!sessionId) return;
    run(`release-${extra.tableId}`, () => floorService.releaseTable(sessionId, extra.tableId), `${extra.label} released for cleaning`);
  };

  const billTotal = visit?.total ?? table?.session?.total ?? 0;
  const paidOnline = visit?.paidOnline ?? table?.session?.paidOnline ?? 0;
  const depositCredit = visit?.depositCredit ?? table?.session?.depositCredit ?? 0;
  /** Left to pay at the table (QR card orders and reservation deposits were paid in the app) */
  const dueTotal = visit?.due ?? table?.session?.due ?? Math.max(0, billTotal - paidOnline - depositCredit);
  const paidTotal = payLines.reduce((s, l) => s + (Number(l.amount) || 0), 0);

  const startClose = () => {
    setPayLines([{ method: 'cash', amount: money(dueTotal) }]);
    setClosing(true);
  };
  const setLine = (i: number, patch: Partial<PayLine>) => setPayLines((lines) => lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const closeVisit = async (force = false, confirmedShort = false) => {
    if (!sessionId || !table) return;
    const payments = payLines.map((l) => ({ method: l.method, amount: Number(l.amount) }));
    if (payLines.some((l) => l.amount.trim() === '') || payments.some((p) => !Number.isFinite(p.amount) || p.amount < 0)) {
      showToast({ type: 'error', message: 'Enter the amount for each payment.' });
      return;
    }
    const short = Math.round((dueTotal - payments.reduce((s, p) => s + p.amount, 0)) * 100) / 100;
    if (short > 0 && !force && !confirmedShort) {
      Alert.alert(`${formatGBP(short)} still to pay`, `The payments come to less than what’s due on ${table.label}. Close the table anyway?`, [
        { text: 'Go back', style: 'cancel' },
        { text: 'Close anyway', style: 'destructive', onPress: () => closeVisit(false, true) },
      ]);
      return;
    }
    setBusy('close');
    const res = await floorService.closeVisit(sessionId, payments, force);
    setBusy(null);
    if (!res.success) {
      if (res.statusCode === 409 && !force && /not served/i.test(res.message || '')) {
        Alert.alert('Orders still open', `${res.message}\n\nClose the table anyway?`, [
          { text: 'Go back', style: 'cancel' },
          { text: 'Close anyway', style: 'destructive', onPress: () => closeVisit(true, true) },
        ]);
        return;
      }
      showToast({ type: 'error', message: res.message || 'Could not close the table.' });
      return;
    }
    const how = payments[0].method;
    showToast({ type: 'success', message: `${table.label} closed · ${formatGBP(res.data?.payment?.amount ?? paidTotal)} ${how}` });
    setClosing(false);
    load();
  };

  /* ── Render helpers ─────────────────────────────────────────────────── */
  const floor = data?.floors.find((f) => f._id === floorId);

  const tileSub = (t: LiveTable) => {
    if (t.joinedTo) return `with ${t.joinedTo}`;
    if (t.session) return `${t.session.partySize}/${t.session.groupSeats || t.seats} · ${sinceLabel(t.session.seatedAt, now)}`;
    if (t.status === 'cleaning') return `${t.seats} seats · ${sinceLabel(t.statusChangedAt, now)}`;
    if (t.nextReservation) return `${t.seats} seats · Res ${t.nextReservation.time}`;
    return `${t.seats} seats`;
  };

  const renderTile = (t: LiveTable, style?: any) => {
    const meta = TABLE_STATUS_META[t.status];
    const alert = tableAlert(t, now);
    return (
      <TouchableOpacity
        key={t._id}
        onPress={() => openTable(t)}
        activeOpacity={0.8}
        style={[styles.tile, { backgroundColor: meta.bg, borderColor: alert ? Colors.danger : meta.border }, t.joinedTo && styles.tileJoined, style]}
        accessibilityRole="button"
        accessibilityLabel={`${t.label}, ${meta.label}, ${tileSub(t)}${alert ? `, ${alert}` : ''}`}
      >
        <View style={styles.tileTop}>
          <Text style={[styles.tileLabel, { color: meta.color }]} numberOfLines={1}>{t.label}</Text>
          {t.session?.source === 'qr' && !t.joinedTo ? <QrCode size={12} color={meta.color} /> : null}
        </View>
        <Text style={styles.tileSub} numberOfLines={1}>{tileSub(t)}</Text>
        {alert ? (
          <View style={styles.alertPill}>
            <AlertTriangle size={10} color="#FFFFFF" />
            <Text style={styles.alertText} numberOfLines={1}>{alert}</Text>
          </View>
        ) : (
          <Text style={[styles.tileStatus, { color: meta.color }]} numberOfLines={1}>
            {meta.label}
            {t.session && !t.joinedTo && t.session.pendingCount > 0 ? ` · ${t.session.pendingCount}` : ''}
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  const renderPlan = () => {
    if (!floor) return null;
    const cols = Math.max(4, ...floor.tables.map((t) => t.layout.x + t.layout.w));
    const rows = Math.max(1, ...floor.tables.map((t) => t.layout.y + t.layout.h));
    const avail = floorAreaWidth - gutter * 2;
    const cell = Math.max(64, Math.min(120, Math.floor(avail / cols)));
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ width: cols * cell, height: rows * cell }}>
          {floor.tables.map((t) =>
            renderTile(t, {
              position: 'absolute',
              left: t.layout.x * cell + 4,
              top: t.layout.y * cell + 4,
              width: t.layout.w * cell - 8,
              height: t.layout.h * cell - 8,
              ...(t.shape === 'round' ? { borderRadius: (Math.min(t.layout.w, t.layout.h) * cell) / 2 } : null),
            })
          )}
        </View>
      </ScrollView>
    );
  };

  const renderList = () => {
    if (!floor) return null;
    const area = floorAreaWidth - gutter * 2;
    const perRow = area >= 860 ? 6 : area >= 700 ? 5 : area >= 540 ? 4 : area >= 340 ? 3 : 2;
    const tileW = (area - (perRow - 1) * 10) / perRow;
    return <View style={styles.grid}>{floor.tables.map((t) => renderTile(t, { width: tileW, minHeight: 92 }))}</View>;
  };

  const renderReservations = (vertical: boolean) => {
    if (!waitingReservations.length) return null;
    const cards = waitingReservations.map((r) => (
      <TouchableOpacity
        key={r._id}
        style={[styles.resCard, vertical && styles.resCardWide]}
        onPress={() => setPicker({ kind: 'reservation', reservation: r })}
        accessibilityRole="button"
        accessibilityLabel={`Seat reservation for ${r.customerName}, ${r.guests} guests at ${r.slots[0] || ''}`}
      >
        <View style={styles.resTop}>
          <CalendarClock size={14} color={Colors.primary} />
          <Text style={styles.resTime}>{r.slots[0] || '—'}</Text>
          <Text style={styles.resGuests}>{r.guests} guests</Text>
        </View>
        <Text style={styles.resName} numberOfLines={1}>{r.customerName}</Text>
        <Text style={styles.resSeat}>Tap to seat</Text>
      </TouchableOpacity>
    ));
    return (
      <View>
        <Text style={styles.sectionLabel}>Reservations today · {waitingReservations.length} to seat</Text>
        {vertical ? (
          <View style={styles.resList}>{cards}</View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.resRow}>
            {cards}
          </ScrollView>
        )}
      </View>
    );
  };

  /** Each floor's capacity right now: tables in use, guests, and how full its seats are. Tap to view it. */
  const renderFloorCapacity = () => {
    const floors = data?.floors || [];
    if (!floors.length) return null;
    return (
      <View>
        <Text style={styles.sectionLabel}>Floors</Text>
        <View style={styles.capList}>
          {floors.map((f) => {
            const s = f.summary;
            const usable = Math.max(0, s.tables - s.tablesBlocked);
            const pct = s.seats > 0 ? Math.round((s.seatsOccupied / s.seats) * 100) : 0;
            const level = pct >= 90 ? 'Full' : pct >= 60 ? 'Busy' : pct > 0 ? 'Open' : 'Empty';
            const tone = pct >= 90 ? Colors.danger : pct >= 60 ? '#B45309' : Colors.success;
            const on = f._id === floorId;
            return (
              <TouchableOpacity
                key={f._id}
                style={[styles.capCard, on && styles.capCardOn]}
                onPress={() => setFloorId(f._id)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${f.name}: ${s.tablesOccupied} of ${usable} tables in use, ${s.guests} guests, ${s.seatsOccupied} of ${s.seats} seats taken, ${level}`}
              >
                <View style={styles.capTop}>
                  <Text style={styles.capName} numberOfLines={1}>{f.name}</Text>
                  <Text style={[styles.capLevel, { color: tone }]}>{level}</Text>
                </View>
                <View style={styles.capBar}>
                  <View style={[styles.capFill, { width: `${pct}%`, backgroundColor: tone }]} />
                </View>
                <View style={styles.capStats}>
                  <Text style={styles.capStat}>
                    <Text style={styles.capStatValue}>{s.tablesOccupied}/{usable}</Text> tables
                  </Text>
                  <Text style={styles.capStat}>
                    <Text style={styles.capStatValue}>{s.seatsOccupied}/{s.seats}</Text> seats
                  </Text>
                  <Text style={styles.capStat}>
                    <Text style={styles.capStatValue}>{s.guests}</Text> guests
                  </Text>
                  {s.tablesBlocked ? <Text style={styles.capStat}>{s.tablesBlocked} blocked</Text> : null}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };

  /** Landscape side panel with nothing open: what needs doing now. */
  const renderTodayPanel = () => {
    const attention = allTables
      .map((t) => ({ t, alert: tableAlert(t, now) }))
      .filter((x): x is { t: (typeof allTables)[number]; alert: string } => Boolean(x.alert));
    return (
      <ScrollView contentContainerStyle={styles.panelBody}>
        <Text style={styles.panelTitle} accessibilityRole="header">Today</Text>
        {renderFloorCapacity()}
        {attention.length ? (
          <View>
            <Text style={styles.sectionLabel}>Needs attention · {attention.length}</Text>
            {attention.map(({ t, alert }) => (
              <TouchableOpacity
                key={t._id}
                style={styles.attnRow}
                onPress={() => openTable(t)}
                accessibilityRole="button"
                accessibilityLabel={`${t.label}, ${alert}`}
              >
                <AlertTriangle size={16} color={Colors.danger} />
                <Text style={styles.attnLabel}>{t.label}</Text>
                <Text style={styles.attnText} numberOfLines={1}>{alert}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
        {renderReservations(true)}
        {!attention.length && !waitingReservations.length ? (
          <Notice icon={CheckCircle2} title="All calm">No tables need attention and no reservations are waiting.</Notice>
        ) : null}
        <View style={styles.panelHint}>
          <Armchair size={18} color={Colors.textMuted} />
          <Text style={styles.panelHintText}>Tap a table to see its orders, seat guests or take payment.</Text>
        </View>
      </ScrollView>
    );
  };

  /** Landscape side panel with a table open: the same content as the bottom sheet, docked. */
  const renderTablePanel = () => {
    if (!table) return null;
    const footer = sheetFooter();
    return (
      <>
        <View style={styles.panelHead}>
          <View style={styles.flex}>
            <Text style={styles.panelTitle} numberOfLines={1}>{`${table.label} · ${TABLE_STATUS_META[table.status].label}`}</Text>
            <Text style={styles.panelSub} numberOfLines={2}>{sheetSubtitle(table)}</Text>
          </View>
          <TouchableOpacity onPress={closeSheet} style={styles.panelClose} accessibilityRole="button" accessibilityLabel="Close table">
            <X size={18} color={Colors.text} />
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.panelBody} keyboardShouldPersistTaps="handled">
          {sheetBody()}
        </ScrollView>
        {footer ? <View style={styles.panelFoot}>{footer}</View> : null}
      </>
    );
  };

  /* ── Screen ─────────────────────────────────────────────────────────── */
  if (!data && !error) {
    return (
      <View style={styles.screen}>
        <ModeTopBar title="FLOOR" subtitle={restaurantLabel} icon={Armchair} onExitHint={exitHint} onExit={exitFloor} exitLabel="Exit floor" />
        <LoadingState label="Loading floor…" />
      </View>
    );
  }

  const pickerTables =
    picker?.kind === 'reservation'
      ? [...freeTables].sort((a, b) => {
          const booked = picker.reservation.bookedTableId;
          if (booked && (a._id === booked) !== (b._id === booked)) return a._id === booked ? -1 : 1;
          return fitScore(a.seats, picker.reservation.guests) - fitScore(b.seats, picker.reservation.guests);
        })
      : freeTables;

  return (
    <View style={styles.screen}>
      <ModeTopBar
        title="FLOOR"
        subtitle={[restaurantLabel, data?.summary.tables ? `${data.summary.tablesOccupied} of ${data.summary.tables - data.summary.tablesBlocked} tables in use` : ''].filter(Boolean).join(' · ')}
        icon={Armchair}
        onExitHint={exitHint}
        onExit={exitFloor}
        exitLabel="Exit floor"
        actions={
          <View style={styles.headerActions}>
            <TextAction label="Setup" icon={Settings2} onPress={() => router.push('/floor-setup')} />
          </View>
        }
      />
      {error && !data ? (
        <LoadError message={error} onRetry={loadAll} />
      ) : !data?.floors.length || !data.summary.tables ? (
        <EmptyState
          icon={Layers}
          title="No tables yet"
          message="Set up your floors and tables once — then seat guests, take orders per table and close bills from here."
          actionLabel="Set up floor plan"
          onAction={() => router.push('/floor-setup')}
        />
      ) : (
        <View style={landscape ? styles.lsBody : styles.flex}>
        <View style={landscape ? styles.lsMain : styles.flex} onLayout={landscape ? (e) => setMainWidth(e.nativeEvent.layout.width) : undefined}>
        <ScrollView
          contentContainerStyle={[styles.content, landscape && styles.contentLandscape, { paddingHorizontal: gutter }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadAll(); }} />}
        >
          <SummaryBar summary={data.summary} compact={landscape} />

          {!landscape ? renderReservations(false) : null}

          <View style={styles.toolbar}>
            <View style={styles.flex}>
              <FilterChips
                options={data.floors.map((f) => ({ value: f._id, label: f.name, count: f.summary.tablesOccupied }))}
                value={floorId}
                onChange={setFloorId}
              />
            </View>
            <View style={styles.modeToggle}>
              {(['plan', 'list'] as const).map((m) => {
                const Icon = m === 'plan' ? LayoutGrid : List;
                const active = mode === m;
                return (
                  <TouchableOpacity
                    key={m}
                    onPress={() => setMode(m)}
                    style={[styles.modeBtn, active && styles.modeBtnActive]}
                    accessibilityLabel={m === 'plan' ? 'Floor plan view' : 'Grid view'}
                    accessibilityState={{ selected: active }}
                  >
                    <Icon size={16} color={active ? '#FFFFFF' : Colors.textMuted} />
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {floor ? (
            <>
              <Text style={styles.floorMeta}>
                {floor.name}: {floor.summary.tablesFree} free · {floor.summary.guests} guests · {floor.summary.seatsEmpty} empty seats
              </Text>
              {floor.tables.length === 0 ? (
                <Notice icon={Armchair} title="No tables on this floor">Add them in Setup.</Notice>
              ) : mode === 'plan' ? (
                renderPlan()
              ) : (
                renderList()
              )}
            </>
          ) : null}

          <View style={styles.legend}>
            {LEGEND.map((s) => (
              <View key={s} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: TABLE_STATUS_META[s].color }]} />
                <Text style={styles.legendText}>{TABLE_STATUS_META[s].label}</Text>
              </View>
            ))}
            <View style={styles.legendItem}>
              <AlertTriangle size={11} color={Colors.danger} />
              <Text style={styles.legendText}>Needs attention</Text>
            </View>
          </View>
        </ScrollView>
        </View>
        {landscape ? (
          <View style={[styles.lsPanel, { width: panelWidth }]} testID="floor-side-panel">
            {table ? renderTablePanel() : renderTodayPanel()}
          </View>
        ) : null}
        </View>
      )}

      {/* Table sheet */}
      <BottomSheet
        visible={!landscape && !!table && !posOpen && !picker}
        title={table ? `${table.label} · ${TABLE_STATUS_META[table.status].label}` : ''}
        subtitle={table ? sheetSubtitle(table) : undefined}
        onClose={closeSheet}
        footer={table ? sheetFooter() : undefined}
      >
        {table ? sheetBody() : null}
      </BottomSheet>

      {/* Table picker: move / join / seat a reservation */}
      <BottomSheet
        visible={!!picker}
        title={
          picker?.kind === 'move'
            ? `Move ${table?.label} to…`
            : picker?.kind === 'join'
            ? `Join a table to ${table?.label}`
            : picker?.kind === 'reservation'
            ? `Seat ${picker.reservation.customerName}`
            : ''
        }
        subtitle={
          picker?.kind === 'reservation'
            ? `${picker.reservation.guests} guests · ${picker.reservation.slots.join(', ')}${picker.reservation.specialRequests ? ` · “${picker.reservation.specialRequests}”` : ''}`
            : 'Free tables'
        }
        onClose={() => setPicker(null)}
      >
        {pickerTables.length === 0 ? (
          <Notice icon={Armchair} title="No free tables">Mark a table clean or close a bill first.</Notice>
        ) : (
          <View style={styles.pickGrid}>
            {pickerTables.map((t) => {
              const tooSmall = picker?.kind === 'reservation' && t.seats < picker.reservation.guests;
              const isBooked = picker?.kind === 'reservation' && picker.reservation.bookedTableId === t._id;
              return (
                <TouchableOpacity
                  key={t._id}
                  style={[styles.pickItem, tooSmall && styles.pickItemWarn, isBooked && styles.pickItemBooked]}
                  onPress={() => pickTable(t)}
                  disabled={!!busy}
                  accessibilityRole="button"
                  accessibilityLabel={`${t.label}, ${t.seats} seats, ${t.floorName}${isBooked ? ', the booked table' : ''}`}
                >
                  <Text style={styles.pickLabel}>{t.label}</Text>
                  <Text style={styles.pickMeta}>{t.seats} seats</Text>
                  <Text style={styles.pickFloor} numberOfLines={1}>{isBooked ? 'Booked table' : t.floorName}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
        {busy === 'pick' || busy === 'reservation' ? <ActivityIndicator color={Colors.primary} style={{ marginTop: 12 }} /> : null}
      </BottomSheet>

      <CreateOrderModal
        visible={posOpen}
        onClose={() => setPosOpen(false)}
        onOrderCreated={() => {
          showToast({ type: 'success', message: `Order sent to the kitchen for ${table?.label || 'the table'}` });
          load();
        }}
        initialChannel="dine_in"
        tableContext={table && sessionId ? { sessionId, label: table.label, floorName: table.floorName } : null}
        restaurantId={user?.restaurantId || user?._id || (user as any)?.id}
        restaurantName={user?.restaurantName || (user as any)?.name || 'Restaurant'}
        restaurantPhone={user?.phoneNumber || (typeof user?.restaurantId === 'object' ? (user?.restaurantId as any)?.phoneNumber : undefined)}
      />
    </View>
  );

  /* ── Sheet content per status ───────────────────────────────────────── */
  function sheetSubtitle(t: LiveTable & { floorName: string }) {
    const parts = [t.floorName, `${t.session?.groupSeats || t.seats} seats`];
    if (t.session) parts.push(`seated ${clockLabel(t.session.seatedAt)} (${sinceLabel(t.session.seatedAt, now)})`);
    if (t.session?.source === 'qr') parts.push('started by QR');
    return parts.join(' · ');
  }

  function sheetBody() {
    if (!table) return null;
    if (table.status === 'free') {
      return (
        <>
          <StepperField
            label="Party size"
            hint={Number(partySize) > table.seats ? `More guests than seats (${table.seats}) — join a table or bring chairs` : 'How many guests are sitting down'}
            value={partySize}
            onChange={setPartySize}
            step={1}
            min={1}
            max={60}
            presets={[1, 2, 3, 4, 6].filter((n) => n <= Math.max(table.seats, 4))}
          />
          {table.nextReservation ? (
            <View style={[styles.resHere, table.nextReservation.late && styles.resHereLate]}>
              <CalendarClock size={18} color={table.nextReservation.late ? Colors.danger : Colors.primary} />
              <View style={styles.flex}>
                <Text style={styles.resHereTitle}>
                  {table.nextReservation.late ? 'Running late: ' : 'Reserved '}
                  {table.nextReservation.time} · {table.nextReservation.name} ({table.nextReservation.guests})
                </Text>
                <Text style={styles.muted}>Booked for this table</Text>
              </View>
              <TextAction
                label="Seat now"
                tone="primary"
                busy={busy === 'reservation'}
                onPress={() => {
                  const r = reservations.find((x) => x._id === table.nextReservation!.bookingId);
                  if (r) seatReservation(r, table);
                  else run('reservation', () => floorService.seat(table._id, undefined, { bookingId: table.nextReservation!.bookingId }), `${table.nextReservation!.name} seated`).then(() => loadReservations());
                }}
              />
            </View>
          ) : null}
          {waitingReservations.length ? (
            <View style={styles.resPick}>
              <Text style={styles.fieldLabel}>Or seat a reservation here</Text>
              {waitingReservations.map((r) => (
                <TouchableOpacity
                  key={r._id}
                  style={styles.resLine}
                  onPress={() => seatReservation(r, table)}
                  disabled={!!busy}
                  accessibilityRole="button"
                  accessibilityLabel={`Seat ${r.customerName} here`}
                >
                  <CalendarClock size={16} color={Colors.primary} />
                  <Text style={styles.resLineText} numberOfLines={1}>
                    {r.slots[0] || '—'} · {r.customerName} · {r.guests} guests
                  </Text>
                  {r.guests > table.seats ? <Text style={styles.resWarn}>too big</Text> : null}
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
        </>
      );
    }
    if (table.status === 'cleaning') {
      return <Notice icon={Sparkles} title="Being cleared">Mark it clean when it’s ready for the next guests.</Notice>;
    }
    if (table.status === 'blocked') {
      return <Notice icon={Ban} title="Blocked">This table is out of use and not counted in free seats.</Notice>;
    }

    // Occupied
    if (closing) {
      const diff = Math.round((paidTotal - dueTotal) * 100) / 100;
      const progress = dueTotal > 0 ? Math.min(1, paidTotal / dueTotal) : 1;
      const statusTone = diff < 0 ? Colors.danger : Colors.success;
      const statusText = diff < 0 ? `${formatGBP(-diff)} still to pay` : diff > 0 ? `Fully paid · ${formatGBP(diff)} tip` : 'Fully paid';
      return (
        <>
          {/* What's left to pay */}
          <View style={styles.paySummary} accessible accessibilityLabel={`Left to pay ${formatGBP(dueTotal)}`}>
            <Text style={styles.paySummaryLabel}>Left to pay</Text>
            <Text style={styles.paySummaryAmount}>{formatGBP(dueTotal)}</Text>
            <View style={styles.payBreak}>
              <View style={styles.payBreakRow}>
                <Text style={styles.payBreakLabel}>Bill{visit?.orders?.length ? ` · ${visit.orders.length} order${visit.orders.length === 1 ? '' : 's'}` : ''}</Text>
                <Text style={styles.payBreakValue}>{formatGBP(billTotal)}</Text>
              </View>
              {paidOnline > 0 ? (
                <View style={styles.payBreakRow}>
                  <Text style={styles.payBreakLabel}>{formatGBP(paidOnline)} paid in the Krifoo app</Text>
                  <Text style={styles.payBreakValue}>−{formatGBP(paidOnline)}</Text>
                </View>
              ) : null}
              {depositCredit > 0 ? (
                <View style={styles.payBreakRow}>
                  <Text style={styles.payBreakLabel}>{formatGBP(depositCredit)} reservation deposit</Text>
                  <Text style={styles.payBreakValue}>−{formatGBP(depositCredit)}</Text>
                </View>
              ) : null}
            </View>
          </View>

          <Text style={styles.payHeading}>Paid by</Text>
          <View style={styles.radioRow} accessibilityRole="radiogroup">
            {PAYMENT_OPTIONS.map((o) => {
              const on = payLines[0]?.method === o.value;
              return (
                <TouchableOpacity
                  key={o.value}
                  style={styles.radioOption}
                  onPress={() => setLine(0, { method: o.value })}
                  hitSlop={6}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={o.label}
                >
                  <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
                  <Text style={[styles.radioText, on && styles.radioTextOn]}>{o.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Field
            label="Amount paid"
            prefix="£"
            value={payLines[0]?.amount ?? ''}
            onChangeText={(v) => setLine(0, { amount: sanitizeDecimal(v) })}
            keyboardType="decimal-pad"
            containerStyle={styles.payAmountFull}
          />
          <View style={styles.quickRow}>
            {[
              { label: `Exact ${formatGBP(dueTotal)}`, amount: dueTotal },
              { label: '+10% tip', amount: dueTotal * 1.1 },
              { label: '+12.5% tip', amount: dueTotal * 1.125 },
            ].map((q) => {
              const on = Number(payLines[0]?.amount) === Number(money(q.amount));
              return (
                <TouchableOpacity key={q.label} style={[styles.quickChip, on && styles.quickChipOn]} onPress={() => setLine(0, { amount: money(q.amount) })} accessibilityRole="button">
                  <Text style={[styles.quickText, on && styles.quickTextOn]}>{q.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Paid so far */}
          <View style={styles.payProgress} accessibilityLiveRegion="polite">
            <View style={styles.payProgressTop}>
              <View style={styles.payStatus}>
                {diff >= 0 ? <CheckCircle2 size={18} color={Colors.success} /> : <AlertTriangle size={18} color={Colors.danger} />}
                <Text style={[styles.payStatusText, { color: statusTone }]}>{statusText}</Text>
              </View>
              <Text style={styles.payOf}>
                {formatGBP(paidTotal)} of {formatGBP(dueTotal)}
              </Text>
            </View>
            <View style={styles.payBar}>
              <View style={[styles.payBarFill, { width: `${Math.round(progress * 100)}%`, backgroundColor: statusTone }]} />
            </View>
          </View>
        </>
      );
    }
    const extras = table.session?.extraTables || [];
    return (
      <>
        <StepperField label="Guests" value={partySize} onChange={setPartySize} step={1} min={1} max={60} />
        {table.session && Number(partySize) !== table.session.partySize ? (
          <TextAction label="Save guests" tone="primary" busy={busy === 'guests'} onPress={saveGuests} style={styles.saveGuests} />
        ) : null}

        <View style={styles.tableActions}>
          <TextAction label="Move" icon={ArrowRightLeft} onPress={() => setPicker({ kind: 'move' })} />
          <TextAction label="Join table" icon={Combine} onPress={() => setPicker({ kind: 'join' })} />
        </View>
        {extras.length ? (
          <View style={styles.extraRow}>
            <Text style={styles.extraLabel}>Joined:</Text>
            {extras.map((x) => (
              <TouchableOpacity key={x.tableId} style={styles.extraChip} onPress={() => release(x)} disabled={!!busy} accessibilityLabel={`Release ${x.label}`}>
                <Text style={styles.extraChipText}>{x.label}</Text>
                <X size={12} color={Colors.textMuted} />
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
        {visit?.moves?.length ? <Text style={styles.muted}>Moved {visit.moves.map((m) => `${m.fromLabel} → ${m.toLabel} at ${clockLabel(m.at)}`).join(', ')}</Text> : null}

        <View style={styles.ordersHead}>
          <Text style={styles.sectionTitle}>Orders</Text>
          <Text style={styles.totalSmall}>{paidOnline > 0 ? `${formatGBP(billTotal)} (${formatGBP(paidOnline)} paid)` : formatGBP(billTotal)}</Text>
        </View>
        {visitLoading && !visit ? (
          <ActivityIndicator color={Colors.primary} style={{ marginVertical: 16 }} />
        ) : !visit?.orders.length ? (
          <Text style={styles.muted}>Nothing ordered yet.</Text>
        ) : (
          visit.orders.map((o) => <OrderRow key={o._id} order={o} onServe={() => serve(o)} serving={busy === `serve-${o._id}`} />)
        )}
      </>
    );
  }

  function sheetFooter() {
    if (!table) return null;
    if (table.status === 'free') {
      return (
        <>
          <PrimaryButton label="Block" tone="secondary" icon={Ban} loading={busy === 'block'} onPress={() => run('block', () => floorService.setTableStatus(table._id, 'blocked'), `${table.label} blocked`)} />
          <PrimaryButton label="Seat guests" icon={Users} loading={busy === 'seat'} onPress={seat} style={styles.flex} />
        </>
      );
    }
    if (table.status === 'cleaning' || table.status === 'blocked') {
      const label = table.status === 'cleaning' ? 'Mark clean' : 'Unblock';
      return <PrimaryButton label={label} icon={CheckCircle2} loading={busy === 'free'} onPress={() => run('free', () => floorService.setTableStatus(table._id, 'free'), `${table.label} is free`)} style={styles.flex} />;
    }
    if (!sessionId) return null;
    if (closing) {
      return (
        <>
          <PrimaryButton label="Back" tone="secondary" onPress={() => setClosing(false)} />
          <PrimaryButton label="Close table" icon={CheckCircle2} loading={busy === 'close'} onPress={() => closeVisit(false)} style={styles.flex} />
        </>
      );
    }
    return (
      <>
        <PrimaryButton label="Add order" icon={Plus} tone="secondary" onPress={() => setPosOpen(true)} style={styles.flex} />
        {table.status !== 'bill_requested' ? (
          <PrimaryButton label="Bill" icon={Receipt} tone="secondary" loading={busy === 'bill'} onPress={() => run('bill', () => floorService.requestBill(sessionId), 'Bill requested')} />
        ) : null}
        <PrimaryButton label="Pay & close" icon={CheckCircle2} onPress={startClose} style={styles.flex} />
      </>
    );
  }
}

/** Lower is a better table for a party: smallest table that fits, too-small tables last. */
function fitScore(seats: number, guests: number) {
  return seats >= guests ? seats - guests : 100 + (guests - seats);
}

function SummaryBar({ summary, compact }: { summary: FloorSummary; compact?: boolean }) {
  const items = [
    { icon: Armchair, label: 'Free tables', value: `${summary.tablesFree}` },
    { icon: Users, label: 'Guests', value: `${summary.guests}` },
    { icon: LayoutGrid, label: 'Seats in use', value: `${summary.seatsOccupied}/${summary.seats}` },
    { icon: Clock, label: 'Empty seats', value: `${summary.seatsEmpty}` },
  ];
  if (compact) {
    // One slim strip so the floor plan gets the height
    return (
      <View style={styles.summaryStrip}>
        {items.map(({ icon: Icon, label, value }) => (
          <View key={label} style={styles.stripItem} accessible accessibilityLabel={`${label}: ${value}`}>
            <Icon size={15} color={Colors.textMuted} />
            <Text style={styles.stripValue}>{value}</Text>
            <Text style={styles.stripLabel} numberOfLines={1}>{label}</Text>
          </View>
        ))}
      </View>
    );
  }
  return (
    <View style={styles.summary}>
      {items.map(({ icon: Icon, label, value }) => (
        <Card key={label} style={styles.summaryItem}>
          <Icon size={16} color={Colors.textMuted} />
          <Text style={styles.summaryValue}>{value}</Text>
          <Text style={styles.summaryLabel} numberOfLines={1}>{label}</Text>
        </Card>
      ))}
    </View>
  );
}

function OrderRow({ order, onServe, serving }: { order: VisitOrder; onServe: () => void; serving: boolean }) {
  const cancelled = order.status === 'cancelled';
  const canServe = ['preparing', 'ready_for_pickup'].includes(order.status) && order.acceptanceStatus !== 'pending';
  const steps = [
    { label: 'Ordered', at: order.createdAt },
    { label: 'Accepted', at: order.acceptedAt },
    { label: 'Ready', at: order.readyAt },
    { label: 'Served', at: order.servedAt },
  ].filter((s) => s.at);
  const items = (order.orderedItems || []).map((i) => `${i.quantity || 1}× ${i.itemName || 'Item'}`).join(', ');
  return (
    <Card style={[styles.orderCard, cancelled && styles.orderCancelled]} muted={cancelled}>
      <View style={styles.orderTop}>
        <Text style={styles.orderNo}>#{order.orderNumber}</Text>
        <Text style={[styles.orderStatus, order.status === 'delivered' && { color: Colors.success }, cancelled && { color: Colors.danger }]}>
          {ORDER_STEP[order.status] || order.status}
        </Text>
        <Text style={styles.orderTotal}>{formatGBP(order.pricing?.totalAmount ?? 0)}</Text>
      </View>
      {items ? <Text style={styles.orderItems} numberOfLines={3}>{items}</Text> : null}
      <View style={styles.orderBottom}>
        <View style={[styles.timeline, styles.flex]}>
          {steps.map((s) => (
            <Text key={s.label} style={styles.timelineStep}>
              {s.label} <Text style={styles.timelineTime}>{clockLabel(s.at)}</Text>
            </Text>
          ))}
        </View>
        {canServe ? <TextAction label="Serve" icon={CheckCircle2} tone="primary" busy={serving} onPress={onServe} /> : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.backgroundSecondary },
  content: { paddingTop: 12, paddingBottom: 40, gap: 12, width: '100%', maxWidth: 1200, alignSelf: 'center' },
  flex: { flex: 1 },
  lsBody: { flex: 1, flexDirection: 'row' },
  lsMain: { flex: 1, minWidth: 0 },
  contentLandscape: { maxWidth: undefined, alignSelf: 'stretch' },
  lsPanel: { flex: 0, flexBasis: 'auto', backgroundColor: Colors.background, borderLeftWidth: 1, borderLeftColor: Colors.cardBorder },
  panelHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: Colors.cardBorder },
  panelTitle: { fontSize: 20, fontWeight: '800', color: Colors.text },
  panelSub: { fontSize: 13, color: Colors.textMuted, marginTop: 2 },
  panelClose: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.cardSurface, alignItems: 'center', justifyContent: 'center' },
  panelBody: { padding: 18, gap: 14 },
  panelFoot: { flexDirection: 'row', gap: 8, padding: 14, borderTopWidth: 1, borderTopColor: Colors.cardBorder },
  panelHint: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12, backgroundColor: Colors.cardSurface },
  panelHintText: { flex: 1, fontSize: 13, color: Colors.textMuted },
  attnRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 6, borderRadius: 12, backgroundColor: Colors.statusRejected.bg },
  attnLabel: { fontSize: 15, fontWeight: '800', color: Colors.text },
  attnText: { flex: 1, fontSize: 13, color: Colors.danger, fontWeight: '600' },
  resList: { gap: 8 },
  capList: { gap: 8 },
  capCard: { padding: 12, borderRadius: 12, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.cardBorder, gap: 8 },
  capCardOn: { borderColor: Colors.primary, borderWidth: 2 },
  capTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  capName: { flex: 1, fontSize: 15, fontWeight: '800', color: Colors.text },
  capLevel: { fontSize: 12, fontWeight: '800' },
  capBar: { height: 6, borderRadius: 3, backgroundColor: Colors.cardBorder, overflow: 'hidden' },
  capFill: { height: 6, borderRadius: 3 },
  capStats: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 2 },
  capStat: { fontSize: 12, color: Colors.textMuted },
  capStatValue: { fontWeight: '800', color: Colors.text },
  resCardWide: { width: '100%' },
  summaryStrip: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stripItem: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.cardBorder },
  stripValue: { fontSize: 15, fontWeight: '800', color: Colors.text },
  stripLabel: { fontSize: 12, color: Colors.textMuted },
  headerActions: { flexDirection: 'row', gap: 6 },
  summary: { flexDirection: 'row', gap: 8 },
  summaryItem: { flex: 1, padding: 10, gap: 2, alignItems: 'flex-start' },
  summaryValue: { fontSize: 20, fontWeight: '800', color: Colors.text, marginTop: 4 },
  summaryLabel: { fontSize: 11, color: Colors.textMuted },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: Colors.text, marginBottom: 8 },
  resRow: { gap: 8 },
  resCard: { width: 168, padding: 10, borderRadius: 12, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.cardBorder, gap: 3 },
  resTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  resTime: { fontSize: 14, fontWeight: '800', color: Colors.text },
  resGuests: { marginLeft: 'auto', fontSize: 12, color: Colors.textMuted },
  resName: { fontSize: 13, color: Colors.text },
  resSeat: { fontSize: 12, fontWeight: '700', color: Colors.primary },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  modeToggle: { flexDirection: 'row', backgroundColor: Colors.background, borderRadius: 10, borderWidth: 1, borderColor: Colors.cardBorder, padding: 2 },
  modeBtn: { width: 36, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  modeBtnActive: { backgroundColor: Colors.text },
  floorMeta: { fontSize: 13, color: Colors.textMuted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { borderWidth: 2, borderRadius: 14, padding: 8, justifyContent: 'center', alignItems: 'center', gap: 2 },
  tileJoined: { borderStyle: 'dashed' },
  tileTop: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tileLabel: { fontSize: 17, fontWeight: '800' },
  tileSub: { fontSize: 12, color: Colors.text },
  tileStatus: { fontSize: 11, fontWeight: '700' },
  alertPill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.danger, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, maxWidth: '100%' },
  alertText: { fontSize: 10, fontWeight: '800', color: '#FFFFFF' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 12, color: Colors.textMuted },
  saveGuests: { alignSelf: 'flex-start', marginTop: 6 },
  tableActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  extraRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 8 },
  extraLabel: { fontSize: 13, color: Colors.textMuted },
  extraChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, backgroundColor: Colors.cardSurface, borderWidth: 1, borderColor: Colors.cardBorder },
  extraChipText: { fontSize: 13, fontWeight: '700', color: Colors.text },
  ordersHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, marginBottom: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: Colors.text },
  totalSmall: { fontSize: 16, fontWeight: '800', color: Colors.text },
  totalLine: { fontSize: 20, fontWeight: '800', color: Colors.text, marginBottom: 12 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: Colors.text, marginBottom: 8 },
  muted: { fontSize: 13, color: Colors.textMuted, marginTop: 6 },
  resPick: { marginTop: 16 },
  resLine: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.cardBorder },
  resLineText: { flex: 1, fontSize: 14, color: Colors.text },
  resWarn: { fontSize: 11, fontWeight: '700', color: Colors.danger },
  payAmount: { width: 110, marginBottom: 0 },
  paySummary: { padding: 16, borderRadius: 16, backgroundColor: Colors.primaryLight },
  paySummaryLabel: { fontSize: 13, fontWeight: '700', color: Colors.textMuted },
  paySummaryAmount: { fontSize: 32, fontWeight: '800', color: Colors.text, marginTop: 2 },
  payBreak: { marginTop: 10, gap: 4 },
  payBreakRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  payBreakLabel: { flex: 1, fontSize: 13, color: Colors.textMuted },
  payBreakValue: { fontSize: 13, fontWeight: '700', color: Colors.text },
  payHeading: { fontSize: 15, fontWeight: '800', color: Colors.text, marginTop: 16, marginBottom: 8 },
  payAmountFull: { marginBottom: 8 },
  radioRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 20, marginBottom: 14 },
  radioOption: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: Colors.cardBorder, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: Colors.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.primary },
  radioText: { fontSize: 15, fontWeight: '600', color: Colors.text },
  radioTextOn: { color: Colors.primary, fontWeight: '700' },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  quickChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: Colors.cardBorder, backgroundColor: Colors.cardSurface },
  quickChipOn: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  quickText: { fontSize: 13, fontWeight: '700', color: Colors.text },
  quickTextOn: { color: Colors.primary },
  payProgress: { marginTop: 16, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: Colors.cardBorder },
  payProgressTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  payStatus: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  payStatusText: { fontSize: 15, fontWeight: '800', flexShrink: 1 },
  payOf: { fontSize: 13, color: Colors.textMuted, fontWeight: '600' },
  payBar: { height: 8, borderRadius: 4, backgroundColor: Colors.cardBorder, marginTop: 10, overflow: 'hidden' },
  payBarFill: { height: 8, borderRadius: 4 },
  pickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  pickItem: { width: 96, padding: 10, borderRadius: 12, borderWidth: 2, borderColor: TABLE_STATUS_META.free.border, backgroundColor: TABLE_STATUS_META.free.bg, alignItems: 'center', gap: 2 },
  pickItemWarn: { borderColor: '#FDE68A', backgroundColor: '#FFFBEB' },
  pickItemBooked: { borderColor: Colors.primary, borderWidth: 3 },
  resHere: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, backgroundColor: Colors.primaryLight, marginTop: 14 },
  resHereLate: { backgroundColor: Colors.statusRejected.bg },
  resHereTitle: { fontSize: 14, fontWeight: '800', color: Colors.text },
  pickLabel: { fontSize: 16, fontWeight: '800', color: Colors.text },
  pickMeta: { fontSize: 12, color: Colors.text },
  pickFloor: { fontSize: 11, color: Colors.textMuted },
  orderCard: { padding: 12, marginBottom: 8, gap: 6 },
  orderCancelled: { opacity: 0.6 },
  orderTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  orderNo: { fontSize: 14, fontWeight: '700', color: Colors.text },
  orderStatus: { flex: 1, fontSize: 13, fontWeight: '700', color: '#B45309' },
  orderTotal: { fontSize: 14, fontWeight: '700', color: Colors.text },
  orderItems: { fontSize: 13, color: Colors.textMuted },
  orderBottom: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  timeline: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  timelineStep: { fontSize: 12, color: Colors.textMuted },
  timelineTime: { fontWeight: '700', color: Colors.text },
});

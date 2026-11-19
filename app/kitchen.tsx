import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  BackHandler,
  DeviceEventEmitter,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AlertTriangle, CalendarClock, ChefHat, LogOut, Moon, Sun } from 'lucide-react-native';

import type { Order } from '../types';
import { orderService } from '../services/order.service';
import { useToast } from '../context/ToastContext';
import { stopOrderBuzzSound } from '../services/sound.service';
import { isAutoPrintEnabled, printThermalReceipt } from '../services/thermal-print.service';
import { getOrderScheduleInfo } from '../services/printer/receipt-document';
import { useNow, getOrderTiming } from '../utils/order-timing';
import {
  buildKitchenBoard,
  getKitchenItems,
  getKitchenStage,
  type KitchenAction,
  type KitchenStage,
} from '../utils/kitchen-board';
import { KitchenColumn, STAGE_TITLES } from '../components/kitchen/KitchenColumn';
import {
  PALETTES,
  STAGE_COLORS,
  TEXT_SCALE,
  type KitchenTextSize,
  type KitchenThemeName,
} from '../components/kitchen/theme';

const PREFS_KEY = '@krifoo_kitchen_prefs';
const STATE_KEY = '@krifoo_kitchen_state';
const UNDO_MS = 5000;
const REFRESH_MS = 30_000;
const BOARD_TICK_MS = 15_000;
const WIDE_BREAKPOINT = 768;
const STAGES: KitchenStage[] = ['new', 'cooking', 'ready'];

type KitchenState = {
  /** orderId → indexes of items ticked off on this device */
  ticks: Record<string, number[]>;
  /** Delivery orders cooked and waiting for a rider (server status stays `preparing`). */
  readyDelivery: string[];
};

type Override = Partial<Order> & { __localReady?: boolean };

function HeaderClock({ color }: { color: string }) {
  const now = useNow();
  const d = new Date(now);
  const text = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return <Text style={[styles.clock, { color }]}>{text}</Text>;
}

export default function KitchenScreen() {
  useKeepAwake();
  const router = useRouter();
  const { showToast } = useToast();
  const { width } = useWindowDimensions();
  const wide = width >= WIDE_BREAKPOINT;

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [theme, setTheme] = useState<KitchenThemeName>('dark');
  const [textSize, setTextSize] = useState<KitchenTextSize>('M');
  const [kState, setKState] = useState<KitchenState>({ ticks: {}, readyDelivery: [] });
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [phoneStage, setPhoneStage] = useState<KitchenStage>('new');
  const [boardNow, setBoardNow] = useState(Date.now());
  const hydrated = useRef(false);
  const pendingRef = useRef(new Map<string, { timer: ReturnType<typeof setTimeout>; commit: () => void }>());

  const palette = PALETTES[theme];
  const scale = TEXT_SCALE[textSize];

  /* ── Persisted per-device preferences & ticks ───────────────────────── */

  useEffect(() => {
    (async () => {
      try {
        const [prefsRaw, stateRaw] = await Promise.all([AsyncStorage.getItem(PREFS_KEY), AsyncStorage.getItem(STATE_KEY)]);
        if (prefsRaw) {
          const p = JSON.parse(prefsRaw);
          if (p.theme === 'dark' || p.theme === 'light') setTheme(p.theme);
          if (p.textSize === 'S' || p.textSize === 'M' || p.textSize === 'L') setTextSize(p.textSize);
        }
        if (stateRaw) {
          const s = JSON.parse(stateRaw);
          setKState({ ticks: s.ticks || {}, readyDelivery: Array.isArray(s.readyDelivery) ? s.readyDelivery : [] });
        }
      } catch {
        // Corrupt or unavailable storage: fall back to defaults.
      } finally {
        hydrated.current = true;
      }
    })();
  }, []);

  useEffect(() => {
    if (hydrated.current) AsyncStorage.setItem(PREFS_KEY, JSON.stringify({ theme, textSize })).catch(() => {});
  }, [theme, textSize]);

  useEffect(() => {
    if (hydrated.current) AsyncStorage.setItem(STATE_KEY, JSON.stringify(kState)).catch(() => {});
  }, [kState]);

  /* ── Data ───────────────────────────────────────────────────────────── */

  const loadOrders = useCallback(async () => {
    try {
      const res = await orderService.fetchAllOrders();
      if (!res.success) return;
      const list = res.data || [];
      setOrders(list);
      // Forget ticks / ready marks for orders that have left the kitchen.
      setKState((prev) => {
        const stillCooking = new Set(list.filter((o) => o.status === 'confirmed' || o.status === 'preparing').map((o) => o._id));
        const onBoard = new Set(list.filter((o) => getKitchenStage(o, new Set()) !== null).map((o) => o._id));
        const ticks = Object.fromEntries(Object.entries(prev.ticks).filter(([id]) => onBoard.has(id)));
        const readyDelivery = prev.readyDelivery.filter((id) => stillCooking.has(id));
        if (readyDelivery.length === prev.readyDelivery.length && Object.keys(ticks).length === Object.keys(prev.ticks).length) {
          return prev;
        }
        return { ticks, readyDelivery };
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
    const interval = setInterval(loadOrders, REFRESH_MS);
    const tick = setInterval(() => setBoardNow(Date.now()), BOARD_TICK_MS);
    const sub = DeviceEventEmitter.addListener('websocket_message', (data: any) => {
      if (data?.type === 'RESTAURANT_ORDER_UPDATE' || data?.type === 'SUPERADMIN_ORDER_UPDATE') loadOrders();
    });
    return () => {
      clearInterval(interval);
      clearInterval(tick);
      sub.remove();
    };
  }, [loadOrders]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadOrders();
  }, [loadOrders]);

  /* ── Actions (with 5-second undo) ───────────────────────────────────── */

  const clearOverride = useCallback((id: string) => {
    setOverrides((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const commitAction = useCallback(
    async (order: Order, action: KitchenAction) => {
      if (action.kind === 'local_ready') {
        setKState((prev) => ({ ...prev, readyDelivery: [...new Set([...prev.readyDelivery, order._id])] }));
        clearOverride(order._id);
        return;
      }

      setBusyIds((prev) => new Set(prev).add(order._id));
      try {
        const res = await orderService.updateOrderStatus(order._id, action.status);
        if (res.success) {
          const merged = { ...order, status: action.status, ...(res.data || {}) } as Order;
          setOrders((prev) => prev.map((o) => (o._id === order._id ? merged : o)));
          if (action.status === 'preparing') {
            // Same behaviour as accepting on the Orders board: print the kitchen ticket if enabled.
            (async () => {
              try {
                if (await isAutoPrintEnabled()) await printThermalReceipt(merged, false, undefined, undefined, 'accepted');
              } catch (e) {
                console.error('[Kitchen] Auto-print failed:', e);
              }
            })();
          }
        } else {
          showToast({ title: 'Update failed', message: res.message || `Order #${order.orderNumber || ''} was not updated.`, type: 'error' });
        }
      } catch (e: any) {
        showToast({ title: 'Update failed', message: e?.message || 'Network error — order was not updated.', type: 'error' });
      } finally {
        clearOverride(order._id);
        setBusyIds((prev) => {
          const next = new Set(prev);
          next.delete(order._id);
          return next;
        });
      }
    },
    [clearOverride, showToast]
  );

  const undo = useCallback(
    (id: string) => {
      const pending = pendingRef.current.get(id);
      if (!pending) return;
      clearTimeout(pending.timer);
      pendingRef.current.delete(id);
      clearOverride(id);
    },
    [clearOverride]
  );

  const handleAction = useCallback(
    (order: Order, action: KitchenAction) => {
      if (pendingRef.current.has(order._id)) return;
      if (action.kind === 'status' && action.status === 'preparing') stopOrderBuzzSound().catch(() => {});

      // Move the ticket straight away; the server is only told once the undo window passes.
      const override: Override =
        action.kind === 'local_ready'
          ? { __localReady: true }
          : action.status === 'preparing'
            ? { status: 'preparing', acceptanceStatus: 'accepted', acceptedAt: order.acceptedAt || new Date().toISOString() }
            : { status: action.status };
      setOverrides((prev) => ({ ...prev, [order._id]: override }));

      const commit = () => commitAction(order, action);
      const timer = setTimeout(() => {
        pendingRef.current.delete(order._id);
        commit();
      }, UNDO_MS);
      pendingRef.current.set(order._id, { timer, commit });

      showToast({
        title: `#${order.orderNumber || order._id.substring(0, 6).toUpperCase()} → ${action.label}`,
        message: 'Tapped by mistake? Undo within 5 seconds.',
        type: 'success',
        duration: UNDO_MS,
        action: { label: 'Undo', onPress: () => undo(order._id) },
      });
    },
    [commitAction, showToast, undo]
  );

  // Leaving Kitchen Mode never loses an action: send anything still in its undo window.
  useEffect(() => {
    const pending = pendingRef.current;
    return () => {
      pending.forEach(({ timer, commit }) => {
        clearTimeout(timer);
        commit();
      });
      pending.clear();
    };
  }, []);

  const toggleItem = useCallback((orderId: string, index: number) => {
    setKState((prev) => {
      const current = prev.ticks[orderId] || [];
      const next = current.includes(index) ? current.filter((i) => i !== index) : [...current, index];
      return { ...prev, ticks: { ...prev.ticks, [orderId]: next } };
    });
  }, []);

  /* ── Exit protection ────────────────────────────────────────────────── */

  const exitHint = useCallback(() => {
    showToast({ title: 'Kitchen Mode', message: 'Press and hold "Exit" to leave Kitchen Mode.', type: 'info' });
  }, [showToast]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      exitHint();
      return true;
    });
    return () => sub.remove();
  }, [exitHint]);

  const exit = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/orders');
  }, [router]);

  /* ── Board ──────────────────────────────────────────────────────────── */

  const board = useMemo(() => {
    const display = orders.map((o) => (overrides[o._id] ? ({ ...o, ...overrides[o._id] } as Order) : o));
    const ready = new Set(kState.readyDelivery);
    Object.entries(overrides).forEach(([id, ov]) => ov.__localReady && ready.add(id));
    return buildKitchenBoard(display, boardNow, ready);
    // `busyIds` is not needed here; overrides keep tickets in place while saving.
  }, [orders, overrides, kState.readyDelivery, boardNow]);

  // Tickets past their expected time (shown in the top bar so the pass sees problems at once).
  const lateCount = useMemo(
    () =>
      [...board.new, ...board.cooking].filter((o) => {
        const t = getOrderTiming(o, boardNow);
        return (t.kind === 'countdown' && t.tone === 'overdue') || (t.kind === 'scheduled' && t.overdue);
      }).length,
    [board, boardNow]
  );

  const columnProps = {
    palette,
    scale,
    busyIds,
    ticks: kState.ticks,
    refreshing,
    onRefresh,
    onToggleItem: toggleItem,
    onAction: handleAction,
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: palette.bg }]} edges={['top', 'bottom', 'left', 'right']}>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />

      {/* Top bar */}
      <View style={[styles.topBar, { backgroundColor: palette.surface, borderBottomColor: palette.divider }]}>
        <View style={styles.brand}>
          <View style={[styles.brandTile, { backgroundColor: palette.stage.new.bg, borderColor: palette.stage.new.border }]}>
            <ChefHat size={22} color={STAGE_COLORS.new} />
          </View>
          <View>
            <Text style={[styles.brandText, { color: palette.text }]}>Kitchen</Text>
            <HeaderClock color={palette.muted} />
          </View>
          {wide && !loading && (
            <View style={styles.summary}>
              {STAGES.map((stage) => (
                <View key={stage} style={[styles.summaryChip, { backgroundColor: palette.card, borderColor: palette.cardBorder }]}>
                  <View style={[styles.summaryDot, { backgroundColor: STAGE_COLORS[stage] }]} />
                  <Text style={[styles.summaryText, { color: palette.text }]}>
                    {board[stage].length} {STAGE_TITLES[stage].toLowerCase()}
                  </Text>
                </View>
              ))}
            </View>
          )}
          {lateCount > 0 && (
            <View style={[styles.summaryChip, styles.lateChip, { backgroundColor: palette.overdueBg, borderColor: palette.overdue }]}>
              <AlertTriangle size={15} color={palette.overdue} />
              <Text style={[styles.summaryText, { color: palette.overdue }]}>{lateCount} late</Text>
            </View>
          )}
        </View>

        <View style={styles.controls}>
          <View style={[styles.segment, { borderColor: palette.cardBorder }]} accessibilityRole="radiogroup" accessibilityLabel="Text size">
            {(['S', 'M', 'L'] as KitchenTextSize[]).map((size) => {
              const active = size === textSize;
              return (
                <Pressable
                  key={size}
                  onPress={() => setTextSize(size)}
                  style={[styles.segmentBtn, active && { backgroundColor: palette.text }]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`Text size ${size === 'S' ? 'small' : size === 'M' ? 'medium' : 'large'}`}
                >
                  <Text style={[styles.segmentText, { color: active ? palette.bg : palette.text, fontSize: size === 'S' ? 13 : size === 'M' ? 16 : 19 }]}>
                    A
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            onPress={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            style={[styles.iconBtn, { borderColor: palette.cardBorder }]}
            accessibilityRole="button"
            accessibilityLabel={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {theme === 'dark' ? <Sun size={22} color={palette.text} /> : <Moon size={22} color={palette.text} />}
          </Pressable>

          <Pressable
            onPress={exitHint}
            onLongPress={exit}
            delayLongPress={700}
            style={({ pressed }) => [styles.exitBtn, { borderColor: palette.cardBorder, opacity: pressed ? 0.6 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel="Exit Kitchen Mode"
            accessibilityHint="Press and hold to exit"
          >
            <LogOut size={20} color={palette.text} />
            {wide && <Text style={[styles.exitText, { color: palette.text }]}>Hold to exit</Text>}
          </Pressable>
        </View>
      </View>

      {/* Upcoming scheduled orders */}
      {board.upcoming.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={[styles.upcomingBar, { borderBottomColor: palette.divider }]}
          contentContainerStyle={styles.upcomingContent}
        >
          <View style={styles.upcomingLabel}>
            <CalendarClock size={16 * scale} color={palette.warning} />
            <Text style={[styles.upcomingLabelText, { color: palette.warning, fontSize: 13 * scale }]}>UPCOMING</Text>
          </View>
          {board.upcoming.map((o) => (
            <View key={o._id} style={[styles.upcomingChip, { backgroundColor: palette.card, borderColor: palette.cardBorder }]}>
              <Text style={[styles.upcomingChipText, { color: palette.text, fontSize: 14 * scale }]}>
                #{o.orderNumber || o._id.substring(0, 6).toUpperCase()} · {getOrderScheduleInfo(o).scheduleTimeText} ·{' '}
                {getKitchenItems(o).length} items
              </Text>
            </View>
          ))}
        </ScrollView>
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={STAGE_COLORS.cooking} />
        </View>
      ) : wide ? (
        <View style={styles.columns}>
          {STAGES.map((stage, i) => (
            <View key={stage} style={[styles.columnWrap, i > 0 && { borderLeftWidth: 1, borderLeftColor: palette.divider }]}>
              <KitchenColumn stage={stage} orders={board[stage]} showHeader {...columnProps} />
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.columns}>
          <View style={styles.flex}>
            <View style={[styles.phoneTabsWrap, { backgroundColor: palette.surface, borderBottomColor: palette.divider }]}>
            <View style={[styles.phoneTabs, { backgroundColor: palette.bg, borderColor: palette.cardBorder }]} accessibilityRole="tablist">
              {STAGES.map((stage) => {
                const active = stage === phoneStage;
                return (
                  <Pressable
                    key={stage}
                    onPress={() => setPhoneStage(stage)}
                    style={[styles.phoneTab, active && { backgroundColor: palette.card, borderColor: STAGE_COLORS[stage] }]}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`${STAGE_TITLES[stage]}, ${board[stage].length} orders`}
                  >
                    <Text style={[styles.phoneTabText, { color: active ? palette.text : palette.muted }]}>{STAGE_TITLES[stage]}</Text>
                    <View style={[styles.phoneTabBadge, { backgroundColor: STAGE_COLORS[stage] }]}>
                      <Text style={styles.phoneTabBadgeText}>{board[stage].length}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
            </View>
            <KitchenColumn stage={phoneStage} orders={board[phoneStage]} showHeader={false} {...columnProps} />
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 10,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, flexWrap: 'wrap' },
  brandTile: { width: 42, height: 42, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  brandText: { fontSize: 18, fontWeight: '900', letterSpacing: -0.2 },
  clock: { fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'], marginTop: 1 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 8 },
  summaryChip: { flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, height: 36 },
  lateChip: { marginLeft: 4 },
  summaryDot: { width: 9, height: 9, borderRadius: 5 },
  summaryText: { fontSize: 14, fontWeight: '800', fontVariant: ['tabular-nums'] },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  segment: { flexDirection: 'row', borderWidth: 1, borderRadius: 8, overflow: 'hidden' },
  segmentBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  segmentText: { fontWeight: '900' },
  iconBtn: { width: 44, height: 44, borderWidth: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  exitBtn: {
    height: 44,
    minWidth: 44,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  exitText: { fontSize: 14, fontWeight: '700' },
  upcomingBar: { flexGrow: 0, borderBottomWidth: 1 },
  upcomingContent: { paddingHorizontal: 14, paddingVertical: 8, gap: 8, alignItems: 'center' },
  upcomingLabel: { flexDirection: 'row', alignItems: 'center', gap: 6, marginRight: 4 },
  upcomingLabelText: { fontWeight: '900', letterSpacing: 1 },
  upcomingChip: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 },
  upcomingChipText: { fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  columns: { flex: 1, flexDirection: 'row' },
  columnWrap: { flex: 1 },
  phoneTabsWrap: { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1 },
  phoneTabs: { flexDirection: 'row', borderWidth: 1, borderRadius: 14, padding: 4, gap: 4 },
  phoneTab: {
    flex: 1,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  phoneTabText: { fontSize: 15, fontWeight: '900' },
  phoneTabBadge: { minWidth: 24, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  phoneTabBadgeText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
});

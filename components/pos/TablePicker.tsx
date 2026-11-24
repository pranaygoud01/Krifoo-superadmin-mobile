/**
 * POS: pick the real table for a dine-in order from the live floor.
 * Floors as tabs, tables as tiles coloured by status. Free tables get seated when the order is placed;
 * tables with guests take the order onto their visit. "Type a table instead" for anything off-plan.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { X, Users, RefreshCw, Keyboard } from 'lucide-react-native';
import { floorService, TABLE_STATUS_META, type LiveFloor } from '../../services/floor.service';
import { floorCounts, posTableOption, toPick, type PosTablePick } from '../../utils/pos-tables';

interface Props {
  visible: boolean;
  selectedTableId?: string | null;
  onPick: (pick: PosTablePick) => void;
  onTypeInstead: () => void;
  onClose: () => void;
}

export function TablePicker({ visible, selectedTableId, onPick, onTypeInstead, onClose }: Props) {
  const { width } = useWindowDimensions();
  const [floors, setFloors] = useState<LiveFloor[] | null>(null);
  const [floorId, setFloorId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await floorService.getStatus();
      if (!res.success || !res.data) throw new Error(res.message || 'Couldn’t load your tables.');
      const list = [...res.data.floors].sort((a, b) => a.sortOrder - b.sortOrder);
      setFloors(list);
      setFloorId((cur) => (cur && list.some((f) => f._id === cur) ? cur : list.find((f) => f.tables.length)?._id || list[0]?._id || null));
    } catch (e: any) {
      setError(e?.message || 'Couldn’t load your tables.');
    } finally {
      setLoading(false);
    }
  };

  // Live status every time it opens
  useEffect(() => {
    if (visible) load();
  }, [visible]);

  const floor = floors?.find((f) => f._id === floorId) || null;
  const counts = useMemo(() => floorCounts(floors || []), [floors]);
  const cols = width >= 1024 ? 6 : width >= 768 ? 5 : 3;
  const GAP = 10;
  // Tile size from the window (sheet = 86% / max 980 on tablets, full width less margins on phones,
  // minus the 18px side padding). No measuring pass, so the tiles always render.
  const sheetW = width >= 768 ? Math.min(width * 0.86, 980) : width - 32;
  const tileW = Math.floor((sheetW - 36 - GAP * (cols - 1)) / cols);
  const noTables = floors !== null && counts.total === 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, width >= 768 && styles.sheetWide]}>
          {/* Header */}
          <View style={styles.head}>
            <View style={styles.flex}>
              <Text style={styles.title} accessibilityRole="header">
                Choose a table
              </Text>
              <Text style={styles.sub}>{floors && !noTables ? `${counts.free} free · ${counts.occupied} with guests` : 'Dine-in order'}</Text>
            </View>
            <TouchableOpacity style={styles.iconBtn} onPress={load} disabled={loading} accessibilityRole="button" accessibilityLabel="Refresh tables">
              <RefreshCw size={18} color="#334155" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
              <X size={20} color="#334155" />
            </TouchableOpacity>
          </View>

          {/* Floors */}
          {floors && floors.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
              {floors.map((f) => {
                const on = f._id === floorId;
                return (
                  <TouchableOpacity key={f._id} style={[styles.tab, on && styles.tabOn]} onPress={() => setFloorId(f._id)} accessibilityRole="tab" accessibilityState={{ selected: on }}>
                    <Text style={[styles.tabText, on && styles.tabTextOn]}>{f.name}</Text>
                    <Text style={[styles.tabCount, on && styles.tabTextOn]}>{f.summary?.tablesFree ?? 0} free</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          ) : null}

          {/* Tables */}
          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            {loading && !floors ? (
              <View style={styles.center}>
                <ActivityIndicator color="#6D28D9" />
                <Text style={styles.muted}>Loading tables…</Text>
              </View>
            ) : error ? (
              <View style={styles.center}>
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity style={styles.retry} onPress={load} accessibilityRole="button">
                  <Text style={styles.retryText}>Try again</Text>
                </TouchableOpacity>
              </View>
            ) : noTables ? (
              <View style={styles.center}>
                <Text style={styles.emptyTitle}>No tables set up yet</Text>
                <Text style={styles.muted}>Add your tables in Floor setup to pick them here. For now, type the table.</Text>
              </View>
            ) : floor && floor.tables.length === 0 ? (
              <View style={styles.center}>
                <Text style={styles.muted}>No tables on {floor.name}.</Text>
              </View>
            ) : (
              <View testID="pos-table-grid" style={styles.grid}>
                {[...(floor?.tables || [])]
                  .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))
                  .map((t) => {
                    const opt = posTableOption(t);
                    const meta = TABLE_STATUS_META[t.status] || TABLE_STATUS_META.free;
                    const on = t._id === selectedTableId;
                    return (
                      <TouchableOpacity
                        key={t._id}
                        disabled={!opt.selectable}
                        onPress={() => floor && onPick(toPick(t, floor))}
                        style={[styles.tile, { width: tileW, backgroundColor: meta.bg, borderColor: on ? '#6D28D9' : meta.border }, on && styles.tileOn, !opt.selectable && styles.tileOff]}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on, disabled: !opt.selectable }}
                        accessibilityLabel={`Table ${t.label}, ${meta.label}, ${opt.hint}`}
                      >
                        <Text style={styles.tileLabel} numberOfLines={1}>
                          {t.label}
                        </Text>
                        <View style={[styles.statusChip, { borderColor: meta.border }]}>
                          <View style={[styles.statusDot, { backgroundColor: meta.color }]} />
                          <Text style={[styles.statusText, { color: meta.color }]}>{meta.label}</Text>
                        </View>
                        <View style={styles.tileHintRow}>
                          {opt.kind === 'occupied' ? <Users size={12} color="#475569" /> : null}
                          <Text style={styles.tileHint} numberOfLines={2}>
                            {opt.hint}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
              </View>
            )}
          </ScrollView>

          {/* Footer */}
          <View style={styles.foot}>
            <Text style={styles.footNote} numberOfLines={2}>
              Free table: it’s seated when you place the order. Table with guests: the order goes on their bill.
            </Text>
            <TouchableOpacity style={styles.typeBtn} onPress={onTypeInstead} accessibilityRole="button">
              <Keyboard size={16} color="#334155" />
              <Text style={styles.typeText}>Type a table instead</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', padding: 16 },
  sheet: { maxHeight: '90%', borderRadius: 18, backgroundColor: '#FFFFFF', overflow: 'hidden' },
  sheetWide: { alignSelf: 'center', width: '86%', maxWidth: 980 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 10 },
  title: { fontSize: 19, fontWeight: '800', color: '#0F172A' },
  sub: { fontSize: 13, color: '#64748B', marginTop: 2 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  tabs: { gap: 8, paddingHorizontal: 18, paddingBottom: 10 },
  tab: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF', flexDirection: 'row', gap: 6, alignItems: 'center' },
  tabOn: { backgroundColor: '#6D28D9', borderColor: '#6D28D9' },
  tabText: { fontSize: 14, fontWeight: '700', color: '#334155' },
  tabCount: { fontSize: 12, color: '#64748B' },
  tabTextOn: { color: '#FFFFFF' },
  body: { flexGrow: 0 },
  bodyContent: { paddingHorizontal: 18, paddingBottom: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { minHeight: 96, padding: 10, borderRadius: 14, borderWidth: 1.5, gap: 6 },
  tileOn: { borderWidth: 3 },
  tileOff: { opacity: 0.5 },
  tileLabel: { fontSize: 20, fontWeight: '800', color: '#0F172A' },
  statusChip: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 5, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, borderWidth: 1, backgroundColor: '#FFFFFF' },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 11, fontWeight: '700' },
  tileHintRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tileHint: { flexShrink: 1, fontSize: 12, color: '#475569', fontWeight: '600' },
  center: { alignItems: 'center', paddingVertical: 36, gap: 10 },
  muted: { fontSize: 13, color: '#64748B', textAlign: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  errorText: { fontSize: 14, color: '#B91C1C', textAlign: 'center' },
  retry: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: '#6D28D9' },
  retryText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  foot: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#E2E8F0', backgroundColor: '#F8FAFC' },
  footNote: { flex: 1, fontSize: 12, color: '#64748B' },
  typeBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF' },
  typeText: { fontSize: 13, fontWeight: '700', color: '#334155' },
});

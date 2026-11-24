/**
 * Floor setup — floors, physical tables (name, seats, shape) and where they sit on the plan.
 * Drag a table to a new square (or tap it, then tap a square); "Save layout" stores the new plan.
 * Each table has a QR code guests scan with the Krifoo app to order to that table.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Alert, useWindowDimensions } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as Print from 'expo-print';
import { Plus, Pencil, Trash2, Layers, Armchair, Move, Save, QrCode, Printer, RefreshCw, X } from 'lucide-react-native';
import { Colors } from '../constants/colors';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { DraggableTable } from '../components/floor/DraggableTable';
import { TableQr, qrSheetHtml } from '../components/floor/TableQr';
import { ScreenHeader } from '../components/ScreenHeader';
import { BottomSheet } from '../components/ui/BottomSheet';
import { Field, Segmented, StepperField, PrimaryButton, Notice, LoadingState, useFormLayout } from '../components/settings/FormKit';
import { FilterChips, Card, Badge, IconAction, EmptyState, LoadError, TextAction } from '../components/ui/ListKit';
import {
  floorService,
  findFreeSpot,
  SHAPE_SIZE,
  tableQrLink,
  type FloorStatus,
  type LiveFloor,
  type LiveTable,
  type TableLayout,
  type TableShape,
} from '../services/floor.service';

const SHAPES: { value: TableShape; label: string }[] = [
  { value: 'square', label: 'Square' },
  { value: 'round', label: 'Round' },
  { value: 'rectangle', label: 'Long' },
  { value: 'booth', label: 'Booth' },
];

type TableForm = { id?: string; label: string; seats: string; shape: TableShape };

export default function FloorSetupScreen() {
  const { showToast } = useToast();
  const { user } = useAuth();
  const restaurantName = user?.restaurantName || (user as any)?.name || 'Krifoo';
  const { gutter } = useFormLayout();
  const { width, height } = useWindowDimensions();
  // Landscape tablets: plan on the left, tables + the selected table in a side panel
  const wide = width >= 900 && width > height;
  const panelWidth = Math.max(320, Math.min(400, Math.round(width * 0.3)));
  const [mainWidth, setMainWidth] = useState(0);

  const [data, setData] = useState<FloorStatus | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [floorId, setFloorId] = useState<string>('');

  // Floor sheet
  const [floorSheet, setFloorSheet] = useState<{ id?: string; name: string } | null>(null);
  // Table sheet
  const [tableSheet, setTableSheet] = useState<TableForm | null>(null);
  const [saving, setSaving] = useState(false);

  // Plan editing (local until saved)
  const [moved, setMoved] = useState<Record<string, TableLayout>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  // QR sheet
  const [qrTableId, setQrTableId] = useState<string | null>(null);
  const [qrBusy, setQrBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await floorService.getStatus();
    setRefreshing(false);
    if (!res.success || !res.data) {
      setError(res.message || 'Could not load your floors.');
      return;
    }
    setError('');
    setData(res.data);
    setFloorId((cur) => (res.data!.floors.some((f) => f._id === cur) ? cur : res.data!.floors[0]?._id || ''));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const floor: LiveFloor | undefined = data?.floors.find((f) => f._id === floorId);
  const layoutOf = useCallback((t: LiveTable) => moved[t._id] || t.layout, [moved]);
  const dirty = Object.keys(moved).length > 0;

  const switchFloor = (id: string) => {
    if (dirty) {
      Alert.alert('Unsaved layout', 'Save or discard the table moves on this floor first.');
      return;
    }
    setSelected(null);
    setFloorId(id);
  };

  /* ── Floors ─────────────────────────────────────────────────────────── */
  const saveFloor = async () => {
    if (!floorSheet) return;
    const name = floorSheet.name.trim();
    if (!name) return showToast({ type: 'error', message: 'Give the floor a name.' });
    setSaving(true);
    const res = floorSheet.id ? await floorService.updateFloor(floorSheet.id, { name }) : await floorService.createFloor(name);
    setSaving(false);
    if (!res.success) return showToast({ type: 'error', message: res.message || 'Could not save the floor.' });
    if (!floorSheet.id && res.data?._id) setFloorId(res.data._id);
    setFloorSheet(null);
    showToast({ type: 'success', message: floorSheet.id ? 'Floor renamed' : `${name} added` });
    load();
  };

  const deleteFloor = (f: LiveFloor) => {
    Alert.alert(`Delete ${f.name}?`, `Its ${f.tables.length} table${f.tables.length === 1 ? '' : 's'} will be removed too. Past visits stay in your records.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const res = await floorService.deleteFloor(f._id);
          if (!res.success) return showToast({ type: 'error', message: res.message || 'Could not delete the floor.' });
          setMoved({});
          showToast({ type: 'success', message: `${f.name} deleted` });
          load();
        },
      },
    ]);
  };

  /* ── Tables ─────────────────────────────────────────────────────────── */
  const nextLabel = () => {
    const used = new Set((data?.floors || []).flatMap((f) => f.tables.map((t) => t.label.toLowerCase())));
    for (let i = 1; i < 500; i++) if (!used.has(`t${i}`)) return `T${i}`;
    return '';
  };

  const saveTable = async () => {
    if (!tableSheet || !floor) return;
    const label = tableSheet.label.trim();
    const seats = Number(tableSheet.seats);
    if (!label) return showToast({ type: 'error', message: 'Give the table a name, like T4.' });
    if (!Number.isInteger(seats) || seats < 1 || seats > 30) return showToast({ type: 'error', message: 'Seats must be between 1 and 30.' });
    setSaving(true);
    let res;
    if (tableSheet.id) {
      res = await floorService.updateTable(tableSheet.id, { label, seats, shape: tableSheet.shape });
    } else {
      const size = SHAPE_SIZE[tableSheet.shape];
      const spot = findFreeSpot(floor.tables.map(layoutOf), size.w, size.h);
      res = await floorService.createTable(floor._id, { label, seats, shape: tableSheet.shape, layout: { ...spot, ...size } });
    }
    setSaving(false);
    if (!res.success) return showToast({ type: 'error', message: res.message || 'Could not save the table.' });
    setTableSheet(null);
    showToast({ type: 'success', message: tableSheet.id ? `${label} updated` : `${label} added` });
    load();
  };

  const deleteTable = (t: LiveTable) => {
    Alert.alert(`Delete ${t.label}?`, 'Past visits at this table stay in your records.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const res = await floorService.deleteTable(t._id);
          if (!res.success) return showToast({ type: 'error', message: res.message || 'Could not delete the table.' });
          setMoved((m) => {
            const { [t._id]: _gone, ...rest } = m;
            return rest;
          });
          showToast({ type: 'success', message: `${t.label} deleted` });
          load();
        },
      },
    ]);
  };

  /* ── Plan ───────────────────────────────────────────────────────────── */
  const cols = useMemo(() => Math.max(8, ...(floor?.tables || []).map((t) => layoutOf(t).x + layoutOf(t).w + 1)), [floor, layoutOf]);
  const rows = useMemo(() => Math.max(6, ...(floor?.tables || []).map((t) => layoutOf(t).y + layoutOf(t).h + 1)), [floor, layoutOf]);
  // Portrait content is capped at 900 wide; landscape uses the whole left pane
  const areaWidth = (wide ? mainWidth || width - panelWidth : Math.min(mainWidth || width, 900)) - gutter * 2;
  const planWidth = areaWidth - 24;
  const cell = Math.max(40, Math.min(wide ? 84 : 72, Math.floor(planWidth / cols)));
  // Fill the card's width with squares (more room to arrange) rather than leaving a blank strip
  const gridCols = Math.max(cols, Math.floor(planWidth / cell));
  // Table cards: 2–3 per row under the plan (portrait)
  const cardsPerRow = areaWidth >= 640 ? 3 : areaWidth >= 380 ? 2 : 1;
  const tableCardWidth = Math.floor((areaWidth - 10 * (cardsPerRow - 1)) / cardsPerRow);

  /** Put a table at (x, y) unless it would overlap another. Used by drag and by tap-to-move. */
  const placeTable = (tableId: string, x: number, y: number): boolean => {
    const t = floor?.tables.find((tt) => tt._id === tableId);
    if (!t || !floor) return false;
    const cur = layoutOf(t);
    const nx = Math.max(0, Math.min(x, 50 - cur.w));
    const ny = Math.max(0, Math.min(y, 50 - cur.h));
    const others = floor.tables.filter((o) => o._id !== t._id).map(layoutOf);
    const overlaps = others.some((l) => nx < l.x + l.w && nx + cur.w > l.x && ny < l.y + l.h && ny + cur.h > l.y);
    if (overlaps) {
      showToast({ type: 'warning', message: 'That spot overlaps another table.' });
      return false;
    }
    setMoved((m) => ({ ...m, [t._id]: { ...cur, x: nx, y: ny } }));
    setSelected(null);
    return true;
  };

  const tapCell = (x: number, y: number) => {
    if (selected) placeTable(selected, x, y);
  };

  /* ── QR codes ───────────────────────────────────────────────────────── */
  const qrTable = data?.floors.flatMap((f) => f.tables.map((tb) => ({ ...tb, floorName: f.name }))).find((tb) => tb._id === qrTableId);

  const printQrCodes = async (only?: string) => {
    const all = (data?.floors || []).flatMap((f) => f.tables.map((tb) => ({ ...tb, floorName: f.name })));
    const list = all.filter((tb) => tb.qrToken && (!only || tb._id === only));
    if (!list.length) return showToast({ type: 'warning', message: 'Add tables first.' });
    try {
      await Print.printAsync({ html: qrSheetHtml(restaurantName, list.map((tb) => ({ label: tb.label, floorName: tb.floorName, link: tableQrLink(tb.qrToken!) }))) });
    } catch {
      showToast({ type: 'error', message: 'Could not open printing on this device.' });
    }
  };

  const rotateQr = (tableId: string, label: string) => {
    Alert.alert(`New QR code for ${label}?`, 'The printed code on the table will stop working — print and replace it.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Make new code',
        style: 'destructive',
        onPress: async () => {
          setQrBusy(true);
          const res = await floorService.rotateQr(tableId);
          setQrBusy(false);
          if (!res.success) return showToast({ type: 'error', message: res.message || 'Could not change the QR code.' });
          showToast({ type: 'success', message: `New QR code for ${label}` });
          load();
        },
      },
    ]);
  };

  const saveLayout = async () => {
    if (!floor) return;
    setSaving(true);
    const res = await floorService.saveLayout(
      floor._id,
      Object.entries(moved).map(([_id, layout]) => ({ _id, layout }))
    );
    setSaving(false);
    if (!res.success) return showToast({ type: 'error', message: res.message || 'Could not save the layout.' });
    setMoved({});
    showToast({ type: 'success', message: 'Layout saved' });
    load();
  };

  /* ── Render ─────────────────────────────────────────────────────────── */
  if (!data && !error) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="Floor setup" />
        <LoadingState label="Loading floors…" />
      </View>
    );
  }

  const selectedTable = floor?.tables.find((t) => t._id === selected) || null;
  const movedCount = Object.keys(moved).length;
  const floorSeats = (floor?.tables || []).reduce((s, t) => s + t.seats, 0);
  const shapeLabel = (s: TableShape) => SHAPES.find((x) => x.value === s)?.label || s;
  const openAddTable = () => setTableSheet({ label: nextLabel(), seats: '4', shape: 'square' });
  const openEditTable = (t: LiveTable) => setTableSheet({ id: t._id, label: t.label, seats: String(t.seats), shape: t.shape });

  /** The table tapped on the plan: what it is, and everything you can do with it. */
  const renderSelectedBar = () =>
    selectedTable ? (
      <View style={styles.selBar} accessibilityLiveRegion="polite">
        <View style={styles.selInfo}>
          <Text style={styles.selTitle}>{selectedTable.label}</Text>
          <Text style={styles.selMeta} numberOfLines={1}>
            {selectedTable.seats} seat{selectedTable.seats === 1 ? '' : 's'} · {shapeLabel(selectedTable.shape)} · tap a square to move it
          </Text>
        </View>
        <View style={styles.selActions}>
          <TextAction label="Edit" icon={Pencil} onPress={() => openEditTable(selectedTable)} />
          <TextAction label="QR code" icon={QrCode} onPress={() => setQrTableId(selectedTable._id)} />
          <IconAction icon={Trash2} label={`Delete ${selectedTable.label}`} tone="danger" onPress={() => deleteTable(selectedTable)} />
          <IconAction icon={X} label="Cancel" onPress={() => setSelected(null)} />
        </View>
      </View>
    ) : null;

  const renderPlan = () => {
    if (!floor) return null;
    return (
      <Card style={styles.planCard}>
        <View style={styles.planHead}>
          <Move size={16} color={Colors.textMuted} />
          <Text style={styles.planHint} numberOfLines={2}>
            {floor.tables.length ? 'Drag a table to move it, or tap it to edit, print its QR code or move it.' : 'Tables you add appear here.'}
          </Text>
          {!wide ? <TextAction label="Add table" icon={Plus} tone="primary" onPress={openAddTable} /> : null}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} scrollEnabled={!dragging}>
          <View style={{ width: gridCols * cell, height: rows * cell }}>
            {Array.from({ length: rows * gridCols }, (_, i) => {
              const x = i % gridCols;
              const y = Math.floor(i / gridCols);
              return (
                <TouchableOpacity
                  key={i}
                  activeOpacity={selected ? 0.5 : 1}
                  onPress={() => tapCell(x, y)}
                  style={[styles.cell, { left: x * cell, top: y * cell, width: cell, height: cell }, selected && styles.cellTarget]}
                  accessibilityLabel={selected ? `Move here, column ${x + 1} row ${y + 1}` : undefined}
                />
              );
            })}
            {floor.tables.map((t) => (
              <DraggableTable
                key={t._id}
                table={t}
                layout={layoutOf(t)}
                cell={cell}
                selected={selected === t._id}
                moved={!!moved[t._id]}
                onTap={() => setSelected((s) => (s === t._id ? null : t._id))}
                onDrop={(x, y) => placeTable(t._id, x, y)}
                onDragStateChange={setDragging}
              />
            ))}
          </View>
        </ScrollView>
      </Card>
    );
  };

  const renderTables = (oneColumn: boolean) => {
    if (!floor) return null;
    return (
      <>
        {oneColumn ? (
          <View style={styles.panelHead}>
            <Text style={styles.sectionTitle}>Tables · {floor.tables.length}</Text>
            <View style={styles.panelHeadActions}>
              {floor.tables.length ? <TextAction label="Print QR codes" icon={Printer} onPress={() => printQrCodes()} style={styles.flex} /> : null}
              <TextAction label="Add table" icon={Plus} tone="primary" onPress={openAddTable} style={styles.flex} />
            </View>
          </View>
        ) : (
          <View style={styles.listHead}>
            <Text style={[styles.sectionTitle, styles.flex]} numberOfLines={1}>Tables · {floor.tables.length}</Text>
            {floor.tables.length ? <TextAction label="Print QR codes" icon={Printer} onPress={() => printQrCodes()} /> : null}
          </View>
        )}
        {floor.tables.length === 0 ? (
          <Notice icon={Armchair} title="No tables on this floor yet">
            Add each physical table with how many people it seats.
          </Notice>
        ) : (
          <View style={styles.tableGrid}>
            {[...floor.tables]
              .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))
              .map((t) => {
                const on = selected === t._id;
                return (
                  <TouchableOpacity
                    key={t._id}
                    style={[styles.tableCard, oneColumn ? styles.tableCardFull : { width: tableCardWidth }, on && styles.tableCardOn]}
                    onPress={() => setSelected((s) => (s === t._id ? null : t._id))}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`${t.label}, ${t.seats} seats, ${shapeLabel(t.shape)}${t.session ? ', in use' : ''}`}
                  >
                    <View style={styles.tableCardTop}>
                      <View style={styles.tableIcon}>
                        <Armchair size={18} color={Colors.primary} />
                      </View>
                      <View style={styles.flex}>
                        <View style={styles.titleRow}>
                          <Text style={styles.rowTitle} numberOfLines={1}>{t.label}</Text>
                          {t.session ? <Badge label="In use" tone="info" /> : null}
                        </View>
                        <Text style={styles.rowMeta} numberOfLines={1}>
                          {t.seats} seat{t.seats === 1 ? '' : 's'} · {shapeLabel(t.shape)}
                        </Text>
                      </View>
                      {oneColumn ? (
                        <View style={styles.tableCardActionsInline}>
                          <IconAction icon={QrCode} label={`QR code for ${t.label}`} onPress={() => setQrTableId(t._id)} />
                          <IconAction icon={Pencil} label={`Edit ${t.label}`} onPress={() => openEditTable(t)} />
                          <IconAction icon={Trash2} label={`Delete ${t.label}`} tone="danger" onPress={() => deleteTable(t)} />
                        </View>
                      ) : null}
                    </View>
                    {!oneColumn ? (
                    <View style={styles.tableCardActions}>
                      <IconAction icon={QrCode} label={`QR code for ${t.label}`} onPress={() => setQrTableId(t._id)} />
                      <IconAction icon={Pencil} label={`Edit ${t.label}`} onPress={() => openEditTable(t)} />
                      <IconAction icon={Trash2} label={`Delete ${t.label}`} tone="danger" onPress={() => deleteTable(t)} />
                    </View>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
          </View>
        )}
      </>
    );
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="Floor setup"
        subtitle={data ? `${data.floors.length} floor${data.floors.length === 1 ? '' : 's'} · ${data.summary.tables} tables · ${data.summary.seats} seats` : undefined}
        rightElement={<TextAction label="Add floor" icon={Plus} tone="primary" onPress={() => setFloorSheet({ name: '' })} />}
      />
      {error && !data ? (
        <LoadError message={error} onRetry={load} />
      ) : !data?.floors.length ? (
        <ScrollView contentContainerStyle={[styles.content, { paddingHorizontal: gutter }]}>
          <EmptyState
            icon={Layers}
            title="Set up your floor plan"
            message="Add a floor (e.g. Ground floor, Terrace), then its tables and seats. You'll see them live on the Floor screen."
            actionLabel="Add first floor"
            onAction={() => setFloorSheet({ name: 'Ground floor' })}
          />
        </ScrollView>
      ) : (
        <View style={wide ? styles.wideBody : styles.flex}>
          <View style={wide ? styles.wideMain : styles.flex} onLayout={(e) => setMainWidth(e.nativeEvent.layout.width)}>
            <ScrollView
              scrollEnabled={!dragging}
              contentContainerStyle={[styles.content, wide && styles.contentWide, { paddingHorizontal: gutter }, dirty && styles.contentWithBar]}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
            >
              <FilterChips
                options={data.floors.map((f) => ({ value: f._id, label: f.name, count: f.tables.length }))}
                value={floorId}
                onChange={switchFloor}
              />

              {floor ? (
                <>
                  <View style={styles.floorBar}>
                    <View style={styles.flex}>
                      <Text style={styles.floorTitle}>{floor.name}</Text>
                      <Text style={styles.floorMeta}>
                        {floor.tables.length} table{floor.tables.length === 1 ? '' : 's'} · {floorSeats} seat{floorSeats === 1 ? '' : 's'}
                      </Text>
                    </View>
                    <IconAction icon={Pencil} label="Rename floor" onPress={() => setFloorSheet({ id: floor._id, name: floor.name })} />
                    <IconAction icon={Trash2} label="Delete floor" tone="danger" onPress={() => deleteFloor(floor)} />
                  </View>

                  {!wide ? renderSelectedBar() : null}
                  {renderPlan()}
                  {!wide ? renderTables(false) : null}
                </>
              ) : null}
            </ScrollView>
          </View>

          {wide && floor ? (
            <View style={[styles.widePanel, { width: panelWidth }]} testID="setup-side-panel">
              <ScrollView contentContainerStyle={styles.panelBody}>
                {renderSelectedBar()}
                {renderTables(true)}
              </ScrollView>
            </View>
          ) : null}

          {/* Unsaved moves: always in reach */}
          {dirty ? (
            <View style={[styles.saveBar, wide && { right: panelWidth }]}>
              <Text style={styles.saveText} numberOfLines={1}>
                {movedCount} table{movedCount === 1 ? '' : 's'} moved
              </Text>
              <TextAction label="Discard" onPress={() => { setMoved({}); setSelected(null); }} />
              <PrimaryButton label="Save layout" icon={Save} loading={saving} onPress={saveLayout} />
            </View>
          ) : null}
        </View>
      )}

      <BottomSheet
        visible={!!qrTable}
        title={qrTable ? `${qrTable.label} QR code` : ''}
        subtitle={qrTable ? `${qrTable.floorName} · guests scan it with the Krifoo app to order to this table` : undefined}
        onClose={() => setQrTableId(null)}
        footer={
          qrTable ? (
            <>
              <PrimaryButton label="New code" icon={RefreshCw} tone="secondary" loading={qrBusy} onPress={() => rotateQr(qrTable._id, qrTable.label)} />
              <PrimaryButton label="Print" icon={Printer} onPress={() => printQrCodes(qrTable._id)} style={styles.flex} />
            </>
          ) : undefined
        }
      >
        {qrTable?.qrToken ? (
          <View style={styles.qrWrap}>
            <TableQr value={tableQrLink(qrTable.qrToken)} size={220} />
            <Text style={styles.qrHint}>Orders placed from this code join {qrTable.label}’s bill and show on the Floor screen. If {qrTable.label} is free, scanning and ordering seats it.</Text>
          </View>
        ) : (
          <Notice title="QR code not ready">Pull to refresh the setup screen.</Notice>
        )}
      </BottomSheet>

      <BottomSheet
        visible={!!floorSheet}
        title={floorSheet?.id ? 'Rename floor' : 'Add floor'}
        onClose={() => setFloorSheet(null)}
        footer={<PrimaryButton label={floorSheet?.id ? 'Save' : 'Add floor'} loading={saving} onPress={saveFloor} style={styles.flex} />}
      >
        <Field
          label="Floor name"
          value={floorSheet?.name || ''}
          onChangeText={(name) => setFloorSheet((s) => (s ? { ...s, name } : s))}
          placeholder="Ground floor, Terrace, Garden…"
          maxLength={40}
          autoFocus
        />
      </BottomSheet>

      <BottomSheet
        visible={!!tableSheet}
        title={tableSheet?.id ? `Edit ${tableSheet.label || 'table'}` : 'Add table'}
        subtitle={floor ? floor.name : undefined}
        onClose={() => setTableSheet(null)}
        footer={<PrimaryButton label={tableSheet?.id ? 'Save' : 'Add table'} loading={saving} onPress={saveTable} style={styles.flex} />}
      >
        <Field
          label="Table name"
          value={tableSheet?.label || ''}
          onChangeText={(label) => setTableSheet((s) => (s ? { ...s, label } : s))}
          placeholder="T1, 12, Window 3…"
          maxLength={12}
          autoCapitalize="characters"
        />
        <StepperField
          label="Seats"
          hint="Chairs at this table"
          value={tableSheet?.seats || '4'}
          onChange={(seats) => setTableSheet((s) => (s ? { ...s, seats } : s))}
          step={1}
          min={1}
          max={30}
          presets={[2, 4, 6, 8]}
        />
        <Text style={styles.fieldLabel}>Shape</Text>
        <Segmented options={SHAPES} value={tableSheet?.shape || 'square'} onChange={(shape) => setTableSheet((s) => (s ? { ...s, shape } : s))} />
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.backgroundSecondary },
  content: { paddingTop: 12, paddingBottom: 40, gap: 12, width: '100%', maxWidth: 900, alignSelf: 'center' },
  contentWide: { maxWidth: undefined, alignSelf: 'stretch' },
  contentWithBar: { paddingBottom: 110 },
  flex: { flex: 1 },
  wideBody: { flex: 1, flexDirection: 'row' },
  wideMain: { flex: 1, minWidth: 0 },
  widePanel: { flex: 0, flexBasis: 'auto', backgroundColor: Colors.background, borderLeftWidth: 1, borderLeftColor: Colors.cardBorder },
  panelBody: { padding: 16, gap: 12 },
  floorBar: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  floorTitle: { fontSize: 20, fontWeight: '800', color: Colors.text },
  floorMeta: { fontSize: 13, color: Colors.textMuted, marginTop: 1 },
  selBar: { padding: 12, borderRadius: 14, backgroundColor: Colors.primaryLight, borderWidth: 1, borderColor: Colors.primary, gap: 8 },
  selInfo: { gap: 2 },
  selTitle: { fontSize: 17, fontWeight: '800', color: Colors.text },
  selMeta: { fontSize: 13, color: Colors.textMuted },
  selActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  planCard: { padding: 12, gap: 10 },
  planHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  planHint: { fontSize: 13, color: Colors.textMuted, flex: 1 },
  cell: { position: 'absolute', borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.cardBorder },
  cellTarget: { backgroundColor: '#FFF7F4' },
  qrWrap: { alignItems: 'center', gap: 14 },
  qrHint: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', lineHeight: 19 },
  listHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: Colors.text },
  tableGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tableCard: { padding: 12, borderRadius: 14, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.cardBorder, gap: 8 },
  tableCardFull: { width: '100%' },
  tableCardOn: { borderColor: Colors.primary, borderWidth: 2 },
  tableCardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tableIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  tableCardActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 4 },
  tableCardActionsInline: { flexDirection: 'row', gap: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  panelHead: { gap: 10 },
  panelHeadActions: { flexDirection: 'row', gap: 8 },
  rowTitle: { fontSize: 16, fontWeight: '800', color: Colors.text },
  rowMeta: { fontSize: 13, color: Colors.textMuted, marginTop: 1 },
  saveBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 18,
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderTopColor: Colors.cardBorder,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -2 },
    elevation: 6,
  },
  saveText: { flex: 1, fontSize: 14, fontWeight: '700', color: Colors.text },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: Colors.text, marginTop: 12, marginBottom: 8 },
});

/**
 * A table on the floor-setup plan: drag it to a new square, or tap to select it (then tap a square).
 * Snaps to the grid on release; the screen decides whether the drop spot is allowed.
 */
import React, { useMemo, useRef } from 'react';
import { Animated, PanResponder, Text, StyleSheet } from 'react-native';
import { Colors } from '../../constants/colors';
import type { LiveTable, TableLayout } from '../../services/floor.service';

const TAP_SLOP = 6;

export function DraggableTable({
  table,
  layout,
  cell,
  selected,
  moved,
  onTap,
  onDrop,
  onDragStateChange,
}: {
  table: LiveTable;
  layout: TableLayout;
  cell: number;
  selected: boolean;
  moved: boolean;
  onTap: () => void;
  /** Return false to send the table back (e.g. it would overlap another) */
  onDrop: (x: number, y: number) => boolean;
  onDragStateChange?: (dragging: boolean) => void;
}) {
  const pan = useRef(new Animated.ValueXY()).current;
  // Latest props for the responder (it's created once)
  const latest = useRef({ layout, cell, onTap, onDrop, onDragStateChange });
  latest.current = { layout, cell, onTap, onDrop, onDragStateChange };

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => latest.current.onDragStateChange?.(true),
        onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
        onPanResponderRelease: (_e, g) => {
          const { layout: l, cell: c, onTap: tap, onDrop: drop, onDragStateChange: drag } = latest.current;
          drag?.(false);
          pan.setValue({ x: 0, y: 0 });
          if (Math.abs(g.dx) < TAP_SLOP && Math.abs(g.dy) < TAP_SLOP) {
            tap();
            return;
          }
          const x = Math.max(0, Math.min(50 - l.w, Math.round(l.x + g.dx / c)));
          const y = Math.max(0, Math.min(50 - l.h, Math.round(l.y + g.dy / c)));
          if (x !== l.x || y !== l.y) drop(x, y);
        },
        onPanResponderTerminate: () => {
          latest.current.onDragStateChange?.(false);
          pan.setValue({ x: 0, y: 0 });
        },
      }),
    [pan]
  );

  return (
    <Animated.View
      {...responder.panHandlers}
      style={[
        styles.table,
        table.shape === 'round' && { borderRadius: (Math.min(layout.w, layout.h) * cell) / 2 },
        { left: layout.x * cell + 3, top: layout.y * cell + 3, width: layout.w * cell - 6, height: layout.h * cell - 6 },
        selected && styles.selected,
        moved && styles.moved,
        { transform: pan.getTranslateTransform() },
      ]}
      accessible
      accessibilityRole="button"
      accessibilityLabel={`${table.label}, ${table.seats} seats${selected ? ', selected' : ''}. Drag to move.`}
      accessibilityActions={[{ name: 'activate' }]}
      onAccessibilityAction={() => onTap()}
    >
      <Text style={styles.label} numberOfLines={1}>{table.label}</Text>
      <Text style={styles.seats}>{table.seats}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  table: {
    position: 'absolute',
    borderRadius: 10,
    backgroundColor: Colors.background,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  selected: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  moved: { borderStyle: 'dashed' },
  label: { fontSize: 13, fontWeight: '800', color: Colors.text },
  seats: { fontSize: 11, color: Colors.textMuted },
});

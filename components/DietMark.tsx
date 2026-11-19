import React from 'react';
import { View } from 'react-native';

/**
 * Standard menu food-type symbol: a bordered square with
 *   veg → green dot · non-veg → red triangle · egg → amber dot.
 * Used on the menu editor, POS and anywhere a dish's food type is shown.
 */
export type DietType = 'veg' | 'non-veg' | 'egg';

export const DIET_META: Record<DietType, { label: string; color: string; tint: string; border: string; description: string }> = {
  veg: { label: 'Veg', color: '#16A34A', tint: '#F0FDF4', border: '#86EFAC', description: 'No meat, fish or egg' },
  'non-veg': { label: 'Non-veg', color: '#DC2626', tint: '#FEF2F2', border: '#FCA5A5', description: 'Contains meat, poultry or fish' },
  egg: { label: 'Contains egg', color: '#D97706', tint: '#FFFBEB', border: '#FCD34D', description: 'Has egg, no meat or fish' },
};

/** Normalises stored values ('veg', 'non-veg', 'non_veg', 'egg') to a DietType, or null. */
export function toDietType(value: unknown): DietType | null {
  const v = String(value || '').toLowerCase().replace('_', '-');
  return v === 'veg' || v === 'non-veg' || v === 'egg' ? v : null;
}

export function DietMark({ type, size = 16 }: { type: DietType; size?: number }) {
  const { color, label } = DIET_META[type];
  const inner = Math.round(size * 0.5);
  return (
    <View
      accessibilityLabel={label}
      style={{
        width: size,
        height: size,
        borderRadius: Math.max(2, size * 0.18),
        borderWidth: Math.max(1.5, size * 0.1),
        borderColor: color,
        backgroundColor: '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {type === 'non-veg' ? (
        // Upward triangle drawn with borders
        <View
          style={{
            width: 0,
            height: 0,
            borderLeftWidth: inner / 2 + 1,
            borderRightWidth: inner / 2 + 1,
            borderBottomWidth: inner,
            borderLeftColor: 'transparent',
            borderRightColor: 'transparent',
            borderBottomColor: color,
            marginBottom: 1,
          }}
        />
      ) : (
        <View style={{ width: inner, height: inner, borderRadius: inner, backgroundColor: color }} />
      )}
    </View>
  );
}

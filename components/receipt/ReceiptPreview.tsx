/**
 * Exact on-screen receipt preview.
 * Renders the SAME document the printer receives (shared receipt builder + line renderer),
 * character for character, scaled to fit the available width.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Platform, LayoutChangeEvent } from 'react-native';
import { Image } from 'expo-image';
import { QrCode } from 'lucide-react-native';
import { buildCustomizedReceiptDocument } from '../../services/printer/receipt-document';
import { renderReceiptLines } from '../../services/printer/encoders/receipt-lines';
import type { ReceiptTemplate } from '../../services/receipt-customization.service';

const MONO = Platform.select({ ios: 'Courier', android: 'monospace', default: 'monospace' });
/** Width of one monospace glyph relative to its font size. */
const GLYPH_RATIO = 0.6;

export function ReceiptPreview({
  order,
  template,
  paperWidth,
  maxWidth = 380,
}: {
  order: any;
  template: ReceiptTemplate;
  paperWidth: '58mm' | '80mm';
  maxWidth?: number;
}) {
  const [innerWidth, setInnerWidth] = useState(0);

  const lines = useMemo(
    () => renderReceiptLines(buildCustomizedReceiptDocument(order, { paperWidth, autoCut: true }, template), paperWidth),
    [order, template, paperWidth]
  );

  const baseColumns = paperWidth === '58mm' ? 32 : 48;
  // Font size so the widest line (32 or 48 characters) exactly fills the paper
  const baseFont = innerWidth > 0 ? innerWidth / (baseColumns * GLYPH_RATIO) : 0;
  // A 58mm roll is drawn narrower than an 80mm roll
  const paperMax = paperWidth === '58mm' ? Math.round(maxWidth * 0.76) : maxWidth;

  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.floor(e.nativeEvent.layout.width);
    if (w > 0 && w !== innerWidth) setInnerWidth(w);
  };

  return (
    <View style={[styles.paper, { maxWidth: paperMax }]} accessibilityLabel="Receipt preview">
      <View style={styles.tearEdge} />
      <View style={styles.inner} onLayout={onLayout}>
        {baseFont > 0 &&
          lines.map((l, i) => {
            if (l.kind === 'text') {
              // Fewer columns (double width) → bigger glyphs; more columns (condensed font) → smaller
              const fontSize = baseFont * (baseColumns / l.columns);
              const doubleHeight = l.size === 'double' || l.size === 'tall';
              return (
                <Text
                  key={i}
                  numberOfLines={1}
                  allowFontScaling={false}
                  style={{
                    fontFamily: MONO,
                    fontSize,
                    lineHeight: fontSize * (doubleHeight ? 2.1 : 1.3),
                    fontWeight: l.bold ? '700' : '400',
                    fontStyle: l.italic ? 'italic' : 'normal',
                    color: '#111',
                    transform: l.size === 'tall' ? [{ scaleY: 1.7 }] : undefined,
                  }}
                >
                  {l.text || ' '}
                </Text>
              );
            }
            if (l.kind === 'image') {
              return (
                <View key={i} style={[styles.block, { alignItems: l.align === 'left' ? 'flex-start' : l.align === 'right' ? 'flex-end' : 'center' }]}>
                  <Image source={{ uri: l.data }} style={{ width: baseFont * 9, height: baseFont * 9 }} contentFit="contain" />
                </View>
              );
            }
            if (l.kind === 'qr') {
              return (
                <View key={i} style={[styles.block, { alignItems: 'center' }]}>
                  <QrCode size={baseFont * 9} color="#111" />
                </View>
              );
            }
            if (l.kind === 'feed') return <View key={i} style={{ height: baseFont * 1.3 * Math.min(l.lines, 3) }} />;
            if (l.kind === 'cut') {
              return (
                <View key={i} style={styles.cutRow}>
                  <View style={styles.cutLine} />
                  <Text style={styles.cutText}>cut</Text>
                  <View style={styles.cutLine} />
                </View>
              );
            }
            return null;
          })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  paper: {
    width: '100%',
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    shadowColor: '#0F172A',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
    overflow: 'hidden',
  },
  tearEdge: { height: 6, backgroundColor: '#F1F5F9', borderBottomWidth: 1, borderBottomColor: '#E2E8F0', borderStyle: 'dashed' },
  inner: { paddingHorizontal: 12, paddingVertical: 14 },
  block: { marginVertical: 4 },
  cutRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  cutLine: { flex: 1, height: 1, borderTopWidth: 1, borderColor: '#CBD5E1', borderStyle: 'dashed' },
  cutText: { fontSize: 10, color: '#94A3B8', fontWeight: '600' },
});

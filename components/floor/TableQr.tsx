/**
 * Table QR codes: drawn on screen with react-native-svg, and as SVG markup for printing.
 * The code holds the customer app link for the table (see tableQrLink).
 */
import React, { useMemo } from 'react';
import Svg, { Path, Rect } from 'react-native-svg';
import QRCode from 'qrcode';

/** One path covering every dark module, with a 4-module quiet zone. */
export function qrPath(text: string): { d: string; size: number } {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const n = modules.size;
  const quiet = 4;
  let d = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (modules.get(r, c)) d += `M${c + quiet} ${r + quiet}h1v1h-1z`;
    }
  }
  return { d, size: n + quiet * 2 };
}

export function TableQr({ value, size = 200 }: { value: string; size?: number }) {
  const { d, size: vb } = useMemo(() => qrPath(value), [value]);
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${vb} ${vb}`} accessibilityLabel="Table QR code">
      <Rect x={0} y={0} width={vb} height={vb} fill="#FFFFFF" />
      <Path d={d} fill="#000000" />
    </Svg>
  );
}

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] as string);

/** Printable A4 sheet: one card per table (name, floor, QR, how-to line). */
export function qrSheetHtml(restaurantName: string, tables: { label: string; floorName: string; link: string }[]): string {
  const cards = tables
    .map((t) => {
      const { d, size } = qrPath(t.link);
      return `<div class="card">
  <div class="name">${esc(t.label)}</div>
  <div class="floor">${esc(t.floorName)}</div>
  <svg viewBox="0 0 ${size} ${size}" width="180" height="180" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#000"/></svg>
  <div class="how">Scan with the Krifoo app to order</div>
  <div class="brand">${esc(restaurantName)}</div>
</div>`;
    })
    .join('\n');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@page { size: A4; margin: 12mm; }
body { font-family: -apple-system, Helvetica, Arial, sans-serif; margin: 0; }
.grid { display: flex; flex-wrap: wrap; gap: 8mm; }
.card { width: 56mm; border: 1px dashed #999; border-radius: 4mm; padding: 5mm; text-align: center; page-break-inside: avoid; }
.name { font-size: 22pt; font-weight: 800; }
.floor { font-size: 10pt; color: #555; margin-bottom: 2mm; }
.how { font-size: 9pt; margin-top: 2mm; }
.brand { font-size: 8pt; color: #777; margin-top: 1mm; }
</style></head><body><div class="grid">${cards}</div></body></html>`;
}

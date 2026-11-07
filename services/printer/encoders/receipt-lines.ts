import { CommandEncoder } from './encoder.types';
import { ReceiptCommand, ReceiptTextSize } from '../receipt-document';
import { PosPrinterConfig } from '../../pos-config.service';
import { alignInColumns, capacityFor, wrapText } from './text-utils';

/**
 * A receipt rendered to exact printer character lines.
 * Uses the same wrapping / alignment rules as the ESC/POS and ePOS encoders, so it is a true
 * "what you see is what prints" representation (used by the on-screen preview and the
 * system-print fallback).
 */
export type ReceiptLine =
  | { kind: 'text'; text: string; bold: boolean; italic: boolean; size: ReceiptTextSize; font: 'fontA' | 'fontB'; columns: number }
  | { kind: 'image'; data: string; align: 'left' | 'center' | 'right' }
  | { kind: 'qr'; data: string }
  | { kind: 'feed'; lines: number }
  | { kind: 'cut' };

export function renderReceiptLines(doc: ReceiptCommand[], paperWidth: '58mm' | '80mm' = '80mm'): ReceiptLine[] {
  const out: ReceiptLine[] = [];
  for (const cmd of doc) {
    switch (cmd.type) {
      case 'text': {
        const font = cmd.size === 'small' ? 'fontB' : cmd.font || 'fontA';
        const size = cmd.size || 'normal';
        const columns = capacityFor(paperWidth, font, size);
        const lines = wrapText(cmd.value, columns);
        for (const l of lines.length ? lines : ['']) {
          out.push({
            kind: 'text',
            text: alignInColumns(l, columns, cmd.align),
            bold: Boolean(cmd.bold),
            italic: Boolean(cmd.italic),
            size,
            font,
            columns,
          });
        }
        break;
      }
      case 'line': {
        const font = cmd.font || 'fontA';
        const columns = capacityFor(paperWidth, font, 'normal');
        out.push({ kind: 'text', text: (cmd.char || '-').charAt(0).repeat(columns), bold: false, italic: false, size: 'normal', font, columns });
        break;
      }
      case 'image':
        out.push({ kind: 'image', data: cmd.data, align: cmd.align || 'center' });
        break;
      case 'qr':
        out.push({ kind: 'qr', data: cmd.data });
        break;
      case 'feed':
        out.push({ kind: 'feed', lines: Math.max(1, cmd.lines || 1) });
        break;
      case 'cut':
        out.push({ kind: 'cut' });
        break;
      default:
        break;
    }
  }
  return out;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Renders the receipt document as monospace HTML for the OS print spooler (AirPrint / Android),
 * used when no pre-built HTML is supplied to the system transport. Never emits raw printer XML.
 */
export function renderReceiptHtml(doc: ReceiptCommand[], paperWidth: '58mm' | '80mm' = '80mm'): string {
  const rows = renderReceiptLines(doc, paperWidth)
    .map((l) => {
      if (l.kind === 'text') {
        const scale = l.size === 'double' ? 'font-size:2em;' : l.size === 'tall' ? 'transform:scaleY(1.6);transform-origin:left;line-height:1.7;' : '';
        const font = l.font === 'fontB' ? 'font-size:0.85em;' : '';
        const style = `${l.bold ? 'font-weight:700;' : ''}${l.italic ? 'font-style:italic;' : ''}${scale}${font}`;
        return `<div style="${style}">${escapeHtml(l.text) || '&nbsp;'}</div>`;
      }
      if (l.kind === 'image') return `<div style="text-align:${l.align}"><img src="${l.data}" style="max-width:40%;max-height:60px"/></div>`;
      if (l.kind === 'qr') return `<div style="text-align:center;font-size:0.8em">[QR] ${escapeHtml(l.data)}</div>`;
      if (l.kind === 'feed') return '<div>&nbsp;</div>'.repeat(Math.min(l.lines, 3));
      return '';
    })
    .join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    @page { size: ${paperWidth} auto; margin: 0; }
    body { margin: 0; padding: 3mm; font-family: "Courier New", Courier, monospace; font-size: ${paperWidth === '58mm' ? '9px' : '11px'}; white-space: pre; color: #000; }
  </style></head><body>${rows}</body></html>`;
}

/** Encoder for the system print spooler: produces printable HTML from the receipt document. */
export const HtmlReceiptEncoder: CommandEncoder<string> = {
  contentType: 'text/html; charset=utf-8',
  encode(doc: ReceiptCommand[], config?: Partial<PosPrinterConfig>): string {
    return renderReceiptHtml(doc, config?.paperWidth === '58mm' ? '58mm' : '80mm');
  },
};

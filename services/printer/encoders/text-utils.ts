import { ReceiptTextSize, wrapText, getLineWidth } from '../receipt-document';

export { wrapText, getLineWidth };

/**
 * Characters per line for a text command, taking font and size into account.
 * 'double' is 2× wide (half the columns); 'tall' keeps the full width.
 */
export function capacityFor(
  paperWidth: '58mm' | '80mm' | undefined,
  font: 'fontA' | 'fontB' | undefined,
  size: ReceiptTextSize | undefined
): number {
  const effectiveFont = size === 'small' ? 'fontB' : font || 'fontA';
  const cols = getLineWidth(paperWidth, effectiveFont);
  return size === 'double' ? Math.floor(cols / 2) : cols;
}

/**
 * Code page 858 (= CP850 + €). Selected with `ESC t 19`, supported by Epson, Star (ESC/POS mode),
 * Sunmi, Xprinter, Rongta and most generic ESC/POS printers. Printers without it fall back to
 * PC437, where £ (0x9C) and most accented lower-case letters are at the same positions.
 */
const CP858: Record<string, number> = {
  Ç: 0x80, ü: 0x81, é: 0x82, â: 0x83, ä: 0x84, à: 0x85, å: 0x86, ç: 0x87, ê: 0x88, ë: 0x89,
  è: 0x8a, ï: 0x8b, î: 0x8c, ì: 0x8d, Ä: 0x8e, Å: 0x8f, É: 0x90, æ: 0x91, Æ: 0x92, ô: 0x93,
  ö: 0x94, ò: 0x95, û: 0x96, ù: 0x97, ÿ: 0x98, Ö: 0x99, Ü: 0x9a, ø: 0x9b, '£': 0x9c, Ø: 0x9d,
  '×': 0x9e, á: 0xa0, í: 0xa1, ó: 0xa2, ú: 0xa3, ñ: 0xa4, Ñ: 0xa5, 'ª': 0xa6, 'º': 0xa7,
  '¿': 0xa8, '®': 0xa9, '½': 0xab, '¼': 0xac, '¡': 0xad, '«': 0xae, '»': 0xaf, Á: 0xb5,
  Â: 0xb6, À: 0xb7, '©': 0xb8, ã: 0xc6, Ã: 0xc7, Ê: 0xd2, Ë: 0xd3, È: 0xd4, '€': 0xd5,
  Í: 0xd6, Î: 0xd7, Ï: 0xd8, Ì: 0xde, Ó: 0xe0, ß: 0xe1, Ô: 0xe2, Ò: 0xe3, õ: 0xe4, Õ: 0xe5,
  µ: 0xe6, Ú: 0xe9, Û: 0xea, Ù: 0xeb, ý: 0xec, Ý: 0xed, '°': 0xf8, '·': 0xfa,
};

/** Typographic characters that commonly arrive from phones / menus, mapped to ASCII. */
const ASCII_FALLBACK: Record<string, string> = {
  '‘': "'", '’': "'", '‚': "'", '“': '"', '”': '"', '„': '"', '–': '-', '—': '-',
  '…': '...', '•': '*', ' ': ' ', ' ': ' ', '​': '',
};

/** Encodes text for an ESC/POS printer using code page 858. */
export function encodeCp858(text: string): number[] {
  const out: number[] = [];
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code < 0x80) {
      out.push(code);
      continue;
    }
    if (CP858[ch] !== undefined) {
      out.push(CP858[ch]);
      continue;
    }
    const ascii = ASCII_FALLBACK[ch];
    if (ascii !== undefined) {
      for (const a of ascii) out.push(a.charCodeAt(0));
      continue;
    }
    // Strip accents we don't have (e.g. "ł" → "l"); otherwise print '?'
    const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (base && base.charCodeAt(0) < 0x80) out.push(base.charCodeAt(0));
    else out.push(0x3f);
  }
  return out;
}

/** UTF-8 bytes (for QR code payloads, which must not go through the code page). */
export function utf8Bytes(text: string): number[] {
  return Array.from(new TextEncoder().encode(text));
}

/** Pads a line for software alignment inside `capacity` columns. */
export function alignInColumns(line: string, capacity: number, align?: 'left' | 'center' | 'right'): string {
  if (align === 'center') return ' '.repeat(Math.max(0, Math.floor((capacity - line.length) / 2))) + line;
  if (align === 'right') return ' '.repeat(Math.max(0, capacity - line.length)) + line;
  return line;
}

/** CODE128 needs a code-set prefix ({A, {B or {C) or most printers print nothing. */
export function code128Data(data: string): string {
  return /^\{[ABC]/.test(data) ? data : `{B${data}`;
}

/** Logo sizing shared by every encoder so logos print the same size on every printer. */
export function logoMaxDots(paperWidth: '58mm' | '80mm' | undefined): { width: number; height: number } {
  return paperWidth === '80mm' ? { width: 192, height: 110 } : { width: 160, height: 90 };
}

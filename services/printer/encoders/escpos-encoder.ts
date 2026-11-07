import { CommandEncoder } from './encoder.types';
import { ReceiptCommand, ReceiptTextSize } from '../receipt-document';
import { PosPrinterConfig, printOffsetDots } from '../../pos-config.service';
import { rasterizeImage, padRaster } from './image-rasterizer';
import { alignInColumns, capacityFor, code128Data, encodeCp858, logoMaxDots, utf8Bytes, wrapText } from './text-utils';

/**
 * ESC/POS binary encoder (network raw 9100, Bluetooth SPP/BLE, Sunmi raw data).
 *
 * Text alignment is done in software (padding inside the line width) so a 58mm layout stays
 * inside 58mm even on an 80mm print head, and line widths always match the receipt builder.
 *
 * IMPORTANT: this encoder never sends GS L (set left margin). Many printers — especially
 * wide print heads running narrower paper — have a built-in left margin that keeps printing
 * on the paper. GS L replaces that margin with an absolute value, so "resetting" it to 0
 * after centring a logo pushed every following line off the left edge of the paper.
 * Everything is positioned RELATIVE to the printer's own margin instead.
 */
export const EscPosEncoder: CommandEncoder<Uint8Array> = {
  contentType: 'application/octet-stream',

  encode(doc: ReceiptCommand[], config?: Partial<PosPrinterConfig>): Uint8Array {
    const buffer: number[] = [];
    const paperWidth: '58mm' | '80mm' = config?.paperWidth === '80mm' ? '80mm' : '58mm';
    const is58mm = paperWidth === '58mm';

    // ESC @ (initialise) + ESC t 19 (code page 858: £, € and accented letters)
    buffer.push(0x1b, 0x40, 0x1b, 0x74, 19);

    // Print position: an extra indent from the printer's own left margin.
    // Text lines get leading Font-A spaces (12 dots = 1.5 mm each); images get white padding.
    const offsetDots = printOffsetDots(config);
    const indentSpaces = Math.round(offsetDots / 12);

    let currentAlign: 'left' | 'center' | 'right' = 'left';
    let currentBold = false;
    let currentItalic = false;
    let currentFont: 'fontA' | 'fontB' = 'fontA';
    let currentSizeByte = 0x00;

    const setAlign = (align?: 'left' | 'center' | 'right') => {
      const target = align || 'left';
      if (target !== currentAlign) {
        currentAlign = target;
        buffer.push(0x1b, 0x61, target === 'center' ? 1 : target === 'right' ? 2 : 0);
      }
    };
    const setBold = (bold?: boolean) => {
      const target = Boolean(bold);
      if (target !== currentBold) {
        currentBold = target;
        buffer.push(0x1b, 0x45, target ? 1 : 0);
      }
    };
    const setItalic = (italic?: boolean) => {
      const target = Boolean(italic);
      if (target !== currentItalic) {
        currentItalic = target;
        buffer.push(0x1b, 0x34, target ? 1 : 0);
      }
    };
    const setFont = (font?: 'fontA' | 'fontB') => {
      const target = font || 'fontA';
      if (target !== currentFont) {
        currentFont = target;
        buffer.push(0x1b, 0x4d, target === 'fontB' ? 1 : 0);
      }
    };
    const setSize = (size?: ReceiptTextSize) => {
      // GS ! n — high nibble = width multiplier, low nibble = height multiplier
      const byte = size === 'double' ? 0x11 : size === 'tall' ? 0x01 : 0x00;
      if (byte !== currentSizeByte) {
        currentSizeByte = byte;
        buffer.push(0x1d, 0x21, byte);
      }
    };
    const pushText = (text: string) => {
      for (const b of encodeCp858(text)) buffer.push(b);
    };
    /** Leading indent for the print position, always in normal-size Font A so it is the same width on every line. */
    const pushIndent = () => {
      if (!indentSpaces) return;
      buffer.push(0x1d, 0x21, 0x00, 0x1b, 0x4d, 0x00);
      for (let i = 0; i < indentSpaces; i++) buffer.push(0x20);
      buffer.push(0x1d, 0x21, currentSizeByte, 0x1b, 0x4d, currentFont === 'fontB' ? 1 : 0);
    };

    for (const cmd of doc) {
      switch (cmd.type) {
        case 'text': {
          const font = cmd.size === 'small' ? 'fontB' : cmd.font;
          const capacity = capacityFor(paperWidth, font, cmd.size);
          setAlign('left');
          setBold(cmd.bold);
          setItalic(cmd.italic);
          setFont(font);
          setSize(cmd.size);
          const lines = wrapText(cmd.value, capacity);
          for (const l of lines.length ? lines : ['']) {
            pushIndent();
            pushText(alignInColumns(l, capacity, cmd.align));
            buffer.push(0x0a);
          }
          break;
        }

        case 'image': {
          const max = logoMaxDots(paperWidth);
          const raw = rasterizeImage(cmd.data, max.width, max.height);
          if (raw) {
            let img = raw;
            if (is58mm) {
              // Position inside the 32-column (384-dot) text block by padding the image itself,
              // so it lines up with the text and the printer's own margin is left untouched.
              const blockDots = 384;
              const left =
                cmd.align === 'left' ? 0 : cmd.align === 'right' ? blockDots - raw.width : Math.floor((blockDots - raw.width) / 2);
              img = padRaster(raw, offsetDots + Math.max(0, left), offsetDots + blockDots);
              setAlign('left');
            } else {
              setAlign(cmd.align || 'center');
            }
            // GS v 0 m xL xH yL yH d1...dk (raster bit image)
            buffer.push(0x1d, 0x76, 0x30, 0x00, img.widthBytes & 0xff, (img.widthBytes >> 8) & 0xff, img.height & 0xff, (img.height >> 8) & 0xff);
            for (let i = 0; i < img.data.length; i++) buffer.push(img.data[i]);
            buffer.push(0x0a);
            setAlign('left');
          }
          break;
        }

        case 'spacing':
          if (cmd.mode === 'compact') buffer.push(0x1b, 0x33, 18);
          else if (cmd.mode === 'relaxed') buffer.push(0x1b, 0x33, 40);
          else buffer.push(0x1b, 0x32);
          break;

        case 'line': {
          setAlign('left');
          setBold(false);
          setItalic(false);
          setFont(cmd.font);
          setSize('normal');
          const width = capacityFor(paperWidth, cmd.font, 'normal');
          pushIndent();
          pushText((cmd.char || '-').charAt(0).repeat(width));
          buffer.push(0x0a);
          break;
        }

        case 'feed':
          buffer.push(0x1b, 0x64, Math.max(1, Math.min(255, cmd.lines || 1)));
          break;

        case 'cut':
          // GS V 66 0 = feed to cutter and partial cut; GS V 65 0 = feed and full cut
          buffer.push(0x1d, 0x56, cmd.mode === 'full' ? 65 : 66, 0);
          break;

        case 'drawer': {
          // ESC p m t1 t2 — m = 0 (pin 2) or 1 (pin 5)
          buffer.push(0x1b, 0x70, cmd.pin === 2 ? 1 : 0, 25, 250);
          break;
        }

        case 'qr': {
          const data = utf8Bytes(cmd.data);
          const storeLen = data.length + 3;
          // Printer-side centring (ESC a 1) — relative to the printer's own margin, never GS L
          setAlign('center');
          buffer.push(0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00); // model 2
          buffer.push(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, is58mm ? 0x05 : 0x06); // module size
          buffer.push(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31); // error correction M
          buffer.push(0x1d, 0x28, 0x6b, storeLen & 0xff, (storeLen >> 8) & 0xff, 0x31, 0x50, 0x30);
          for (const b of data) buffer.push(b);
          buffer.push(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30); // print
          buffer.push(0x0a);
          setAlign('left');
          break;
        }

        case 'barcode': {
          const bc = code128Data(cmd.data);
          setAlign('center');
          buffer.push(0x1d, 0x68, 64); // height
          buffer.push(0x1d, 0x48, 2); // HRI below
          buffer.push(0x1d, 0x6b, 73, bc.length);
          for (let i = 0; i < bc.length; i++) buffer.push(bc.charCodeAt(i) & 0x7f);
          buffer.push(0x0a);
          setAlign('left');
          break;
        }
      }
    }

    return new Uint8Array(buffer);
  },
};

import { CommandEncoder } from './encoder.types';
import { ReceiptCommand } from '../receipt-document';
import { PosPrinterConfig } from '../../pos-config.service';
import { rasterizeImage } from './image-rasterizer';

export const EscPosEncoder: CommandEncoder<Uint8Array> = {
  contentType: 'application/octet-stream',

  encode(doc: ReceiptCommand[], config?: Partial<PosPrinterConfig>): Uint8Array {
    const buffer: number[] = [];
    const is58mm = config?.paperWidth !== '80mm';
    const cols = is58mm ? 32 : 48;

    // 1. Initialize printer & select Character Code Table CP858 (Supports UK Pound £)
    // ESC @ (Initialize)
    buffer.push(0x1b, 0x40);
    // ESC t 19 (Select character code table: CP858 Euro/Pound)
    buffer.push(0x1b, 0x74, 19);

    let currentAlign: 'left' | 'center' | 'right' = 'left';
    let currentBold = false;
    let currentItalic = false;
    let currentFont: 'fontA' | 'fontB' = 'fontA';
    let currentSize: 'normal' | 'double' | 'small' = 'normal';

    const setAlign = (align?: 'left' | 'center' | 'right') => {
      const target = align || 'left';
      if (target !== currentAlign) {
        currentAlign = target;
        const code = target === 'center' ? 1 : target === 'right' ? 2 : 0;
        buffer.push(0x1b, 0x61, code);
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

    const setSize = (size?: 'normal' | 'double' | 'small') => {
      const target = size || 'normal';
      if (target !== currentSize) {
        currentSize = target;
        // GS ! n (0x00 = normal 1x1, 0x11 = double width & height 2x2)
        buffer.push(0x1d, 0x21, target === 'double' ? 0x11 : 0x00);
      }
    };

    const pushText = (text: string) => {
      for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (char === '£') {
          buffer.push(0x9c); // CP858 / CP437 Pound Symbol
        } else if (char === '€') {
          buffer.push(0xd5); // CP858 Euro Symbol
        } else {
          const code = text.charCodeAt(i);
          if (code < 128) {
            buffer.push(code);
          } else {
            // Replace non-ASCII/unsupported characters with '?'
            buffer.push(0x3f);
          }
        }
      }
    };

    const wrapLine = (text: string, maxWidth: number): string[] => {
      if (!text) return [''];
      if (text.length <= maxWidth) return [text];
      const words = text.split(' ');
      const lines: string[] = [];
      let current = '';

      for (const word of words) {
        if (!current) {
          current = word;
        } else if ((current + ' ' + word).length <= maxWidth) {
          current += ' ' + word;
        } else {
          lines.push(current);
          current = word;
        }
      }
      if (current) {
        lines.push(current);
      }
      return lines;
    };

    for (const cmd of doc) {
      switch (cmd.type) {
        case 'text':
          if (is58mm) {
            // Constrain ALL content within 58mm (32 column) boundary.
            // On 80mm physical paper, hardware alignment (ESC a 1 / ESC a 2) would center/right-align
            // across the 80mm print head (48 columns). To keep the remaining ~22mm blank,
            // we keep hardware alignment strictly LEFT and software-pad within 32 columns.
            setAlign('left');
            setBold(cmd.bold);
            setItalic(cmd.italic);
            setFont(cmd.font);

            // Double size takes 2 columns per character. 58mm width can only hold 16 chars.
            // If the text exceeds 16 chars, downgrade to normal size so it never exceeds 32 columns.
            const wantsDouble = cmd.size === 'double';
            const canBeDouble = wantsDouble && cmd.value.length <= 16;
            const lineCapacity = canBeDouble ? 16 : 32;

            setSize(canBeDouble ? 'double' : (cmd.size === 'small' ? 'small' : 'normal'));

            const rawLines = cmd.value.split('\n');
            for (const rLine of rawLines) {
              const wrapped = wrapLine(rLine, lineCapacity);
              for (const line of wrapped) {
                let formatted = line;
                if (cmd.align === 'center') {
                  const pad = Math.max(0, Math.floor((lineCapacity - line.length) / 2));
                  formatted = ' '.repeat(pad) + line;
                } else if (cmd.align === 'right') {
                  const pad = Math.max(0, lineCapacity - line.length);
                  formatted = ' '.repeat(pad) + line;
                }
                pushText(formatted);
                buffer.push(0x0a); // LF
              }
            }
          } else {
            // 80mm template behavior is 100% UNCHANGED
            setAlign(cmd.align);
            setBold(cmd.bold);
            setItalic(cmd.italic);
            setFont(cmd.font);
            setSize(cmd.size);
            pushText(cmd.value);
            buffer.push(0x0a); // LF
          }
          break;

        case 'image': {
          // Professional receipt logo sizing:
          // 80mm roll: max 192 dots wide (~24mm), max 110 dots high (~14mm)
          // 58mm roll: max 160 dots wide (~20mm), max 90 dots high (~11mm)
          const maxDotsW = is58mm ? 160 : 192;
          const maxDotsH = is58mm ? 90 : 110;
          const img = rasterizeImage(cmd.data, maxDotsW, maxDotsH);
          if (img) {
            const xL = img.widthBytes & 0xff;
            const xH = (img.widthBytes >> 8) & 0xff;
            const yL = img.height & 0xff;
            const yH = (img.height >> 8) & 0xff;

            // Center image
            setAlign(cmd.align || 'center');

            // GS v 0 0 xL xH yL yH d1...dk (Print raster bit image)
            buffer.push(0x1d, 0x76, 0x30, 0x00, xL, xH, yL, yH);
            for (let i = 0; i < img.data.length; i++) {
              buffer.push(img.data[i]);
            }

            // CR + LF + feed line to flush raster buffer and advance paper
            buffer.push(0x0d, 0x0a);
            buffer.push(0x1b, 0x64, 0x01); // ESC d 1

            // Reset alignment for subsequent text elements
            setAlign('left');
          }
          break;
        }

        case 'spacing':
          if (cmd.mode === 'compact') {
            buffer.push(0x1b, 0x33, 18); // ESC 3 18
          } else if (cmd.mode === 'relaxed') {
            buffer.push(0x1b, 0x33, 36); // ESC 3 36
          } else {
            buffer.push(0x1b, 0x32); // ESC 2 default 1/6 inch
          }
          break;

        case 'line':
          setAlign('left');
          setBold(false);
          setItalic(false);
          setSize('normal');
          pushText('-'.repeat(cols));
          buffer.push(0x0a);
          break;

        case 'feed':
          // ESC d n
          buffer.push(0x1b, 0x64, Math.max(1, cmd.lines || 1));
          break;

        case 'cut':
          // GS V 66 0 (feed and partial cut) or GS V 0 (full cut)
          if (cmd.mode === 'full') {
            buffer.push(0x1d, 0x56, 0);
          } else {
            buffer.push(0x1d, 0x56, 66, 0);
          }
          break;

        case 'drawer':
          // ESC p m t1 t2 (Kick cash drawer pulse)
          // m = 0 for pin 2, m = 1 for pin 5 (pin 1 / pin 2 convention)
          const m = cmd.pin === 2 ? 1 : 0;
          buffer.push(0x1b, 0x70, m, 25, 250);
          break;

        case 'qr':
          // Standard ESC/POS 2D QR Code Generation
          const qrData = cmd.data;
          const storeLen = qrData.length + 3;
          const pL = storeLen % 256;
          const pH = Math.floor(storeLen / 256);

          if (is58mm) {
            setAlign('left');
            // Offset slightly to center inside 58mm width (384 dots)
            buffer.push(0x1d, 0x4c, 0x30, 0x00); // GS L 48 0
          } else {
            setAlign('center');
          }
          // Select model
          buffer.push(0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00);
          // Set size (module size 6)
          buffer.push(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x06);
          // Set error correction level M (49)
          buffer.push(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31);
          // Store data in symbol storage
          buffer.push(0x1d, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30);
          for (let i = 0; i < qrData.length; i++) {
            buffer.push(qrData.charCodeAt(i));
          }
          // Print the stored symbol
          buffer.push(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30);
          buffer.push(0x0a);
          if (is58mm) {
            buffer.push(0x1d, 0x4c, 0x00, 0x00); // Reset margin
          }
          break;

        case 'barcode':
          // GS k CODE128
          if (is58mm) {
            setAlign('left');
            buffer.push(0x1d, 0x4c, 0x30, 0x00); // GS L 48 0
          } else {
            setAlign('center');
          }
          const bcData = cmd.data;
          buffer.push(0x1d, 0x6b, 73, bcData.length);
          for (let i = 0; i < bcData.length; i++) {
            buffer.push(bcData.charCodeAt(i));
          }
          buffer.push(0x0a);
          if (is58mm) {
            buffer.push(0x1d, 0x4c, 0x00, 0x00); // Reset margin
          }
          break;
      }
    }

    return new Uint8Array(buffer);
  },
};

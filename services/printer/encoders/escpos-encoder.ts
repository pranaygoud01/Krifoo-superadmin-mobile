import { CommandEncoder } from './encoder.types';
import { ReceiptCommand } from '../receipt-document';
import { PosPrinterConfig } from '../../pos-config.service';

export const EscPosEncoder: CommandEncoder<Uint8Array> = {
  contentType: 'application/octet-stream',

  encode(doc: ReceiptCommand[], config?: Partial<PosPrinterConfig>): Uint8Array {
    const buffer: number[] = [];
    const is58mm = config?.paperWidth === '58mm';
    const cols = is58mm ? 32 : 48;

    // 1. Initialize printer & select Character Code Table CP858 (Supports UK Pound £)
    // ESC @ (Initialize)
    buffer.push(0x1b, 0x40);
    // ESC t 19 (Select character code table: CP858 Euro/Pound)
    buffer.push(0x1b, 0x74, 19);

    let currentAlign: 'left' | 'center' | 'right' = 'left';
    let currentBold = false;
    let currentSize: 'normal' | 'double' = 'normal';

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

    const setSize = (size?: 'normal' | 'double') => {
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

    for (const cmd of doc) {
      switch (cmd.type) {
        case 'text':
          setAlign(cmd.align);
          setBold(cmd.bold);
          setSize(cmd.size);
          pushText(cmd.value);
          buffer.push(0x0a); // LF
          break;

        case 'line':
          setAlign('left');
          setBold(false);
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

          setAlign('center');
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
          break;

        case 'barcode':
          // GS k CODE128
          setAlign('center');
          const bcData = cmd.data;
          buffer.push(0x1d, 0x6b, 73, bcData.length);
          for (let i = 0; i < bcData.length; i++) {
            buffer.push(bcData.charCodeAt(i));
          }
          buffer.push(0x0a);
          break;
      }
    }

    return new Uint8Array(buffer);
  },
};

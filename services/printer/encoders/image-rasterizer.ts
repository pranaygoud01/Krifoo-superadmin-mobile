import { Buffer } from 'buffer';

const pngjs = require('pngjs/browser.js');
const jpeg = require('jpeg-js');

export interface RasterizedImage {
  width: number;
  height: number;
  widthBytes: number;
  data: Uint8Array;
}

/**
 * Converts a base64 encoded image (PNG, JPEG, etc.) into ESC/POS monochrome 1-bit raster data.
 * Used for thermal receipt printers (ESC/POS GS v 0 command and ePOS XML <image>).
 *
 * @param base64Data Raw base64 string or data:image/...;base64 Data URI
 * @param maxPixelWidth Maximum width in dots (typically 384 for 58mm, 512-576 for 80mm)
 */
export function rasterizeImage(
  base64Data: string,
  maxPixelWidth: number = 200,
  maxPixelHeight: number = 120
): RasterizedImage | null {
  try {
    if (!base64Data || typeof base64Data !== 'string') return null;
    let clean = base64Data.trim();
    if (clean.includes(',')) {
      clean = clean.split(',')[1];
    }
    const buf = Buffer.from(clean, 'base64');
    if (!buf || buf.length < 8) return null;

    let width = 0;
    let height = 0;
    let rgba: Uint8Array | null = null;

    // Check PNG signature: 89 50 4E 47 0D 0A 1A 0A
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
      const p = pngjs.PNG.sync.read(buf);
      width = p.width;
      height = p.height;
      rgba = p.data;
    }
    // Check JPEG signature: FF D8
    else if (buf[0] === 0xff && buf[1] === 0xd8) {
      const j = jpeg.decode(buf, { useTArray: true });
      width = j.width;
      height = j.height;
      rgba = j.data;
    } else {
      // Fallback try PNG, then JPEG
      try {
        const p = pngjs.PNG.sync.read(buf);
        width = p.width;
        height = p.height;
        rgba = p.data;
      } catch {
        const j = jpeg.decode(buf, { useTArray: true });
        width = j.width;
        height = j.height;
        rgba = j.data;
      }
    }

    if (!rgba || width <= 0 || height <= 0) {
      return null;
    }

    // Scale proportionally to fit within both maxPixelWidth and maxPixelHeight
    // targetWidth must be a multiple of 8 for ESC/POS raster byte rows
    const maxWidth = Math.max(8, Math.floor(maxPixelWidth / 8) * 8);
    const maxHeight = Math.max(8, maxPixelHeight);

    let scale = Math.min(maxWidth / width, maxHeight / height);
    if (scale > 1) {
      scale = 1;
    }

    const targetWidth = Math.max(8, Math.floor((width * scale) / 8) * 8);
    const targetHeight = Math.max(1, Math.round(height * (targetWidth / width)));

    const widthBytes = targetWidth >> 3;
    const raster = new Uint8Array(widthBytes * targetHeight);

    // Resample pixels and perform thresholding
    for (let ty = 0; ty < targetHeight; ty++) {
      const sy = Math.min(height - 1, Math.floor((ty * height) / targetHeight));
      for (let bx = 0; bx < widthBytes; bx++) {
        let byteVal = 0;
        for (let bit = 0; bit < 8; bit++) {
          const tx = (bx << 3) + bit;
          const sx = Math.min(width - 1, Math.floor((tx * width) / targetWidth));
          const idx = (sy * width + sx) << 2;
          const r = rgba[idx];
          const g = rgba[idx + 1];
          const b = rgba[idx + 2];
          const a = rgba[idx + 3];

          // Transparent pixels are treated as paper background (white)
          if (a >= 128) {
            const lum = 0.299 * r + 0.587 * g + 0.114 * b;
            // Dot printed on thermal paper if luminance is dark enough
            if (lum < 165) {
              byteVal |= 1 << (7 - bit);
            }
          }
        }
        raster[ty * widthBytes + bx] = byteVal;
      }
    }

    return {
      width: targetWidth,
      height: targetHeight,
      widthBytes,
      data: raster,
    };
  } catch (err) {
    console.warn('[image-rasterizer] Failed to rasterize image for thermal printer:', err);
    return null;
  }
}

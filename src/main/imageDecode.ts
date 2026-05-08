import path from 'node:path';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import type { Sharp } from 'sharp';

// heic-convert is CommonJS with a default function export. The TS types are minimal,
// so we declare a tight shape locally.
type HeicConvertFn = (opts: {
  buffer: Buffer;
  format: 'JPEG' | 'PNG';
  quality?: number;
}) => Promise<ArrayBuffer | Uint8Array>;
const heicConvert = require('heic-convert') as HeicConvertFn;

const HEIC_EXTS = new Set(['.heic', '.heif']);

/**
 * Open an image as a Sharp instance, transparently decoding HEIC/HEIF first.
 *
 * Why: libvips bundled with the npm `sharp` package lacks the HEVC decoder
 * plugin (patent encumbered), so it can read HEIF metadata but fails to decode
 * pixel data. heic-convert ships libheif compiled with HEVC via WebAssembly —
 * slow but cross-platform and license-clean. We decode to PNG to keep full
 * fidelity through the rest of the pipeline.
 */
export async function openImage(inputPath: string): Promise<Sharp> {
  const ext = path.extname(inputPath).toLowerCase();
  if (HEIC_EXTS.has(ext)) {
    const inputBuffer = await readFile(inputPath);
    const pngBuf = await heicConvert({ buffer: inputBuffer, format: 'PNG' });
    // heic-convert returns ArrayBuffer | Uint8Array depending on the runtime.
    // Coerce both into a Node Buffer so sharp accepts it without overload issues.
    const buf =
      pngBuf instanceof Uint8Array
        ? Buffer.from(pngBuf.buffer, pngBuf.byteOffset, pngBuf.byteLength)
        : Buffer.from(pngBuf);
    return sharp(buf, { failOn: 'none' });
  }
  return sharp(inputPath, { failOn: 'none' });
}

export function isHeic(p: string): boolean {
  return HEIC_EXTS.has(path.extname(p).toLowerCase());
}

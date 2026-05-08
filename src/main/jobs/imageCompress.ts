import path from 'node:path';
import { stat } from 'node:fs/promises';
import PQueue from 'p-queue';
import os from 'node:os';
import { exiftool } from 'exiftool-vendored';
import { ensureDir } from '../paths';
import { openImage, isHeic } from '../imageDecode';
import type {
  ImageCompressOptions,
  JobItem,
  JobResult,
  JobResultItem,
  ProgressEvent,
} from '../../preload/index';

export async function runImageCompress(args: {
  jobId: string;
  items: JobItem[];
  options: ImageCompressOptions;
  onProgress: (e: ProgressEvent) => void;
  signal: AbortSignal;
}): Promise<JobResult> {
  const { jobId, items, options, onProgress, signal } = args;
  await ensureDir(options.outputDir);

  const queue = new PQueue({ concurrency: Math.max(2, os.cpus().length - 1) });
  const results: JobResultItem[] = [];

  await Promise.all(
    items.map((item) =>
      queue.add(async () => {
        const t0 = Date.now();
        try {
          if (signal.aborted) throw new Error('cancelled');
          const bytesIn = (await stat(item.inputPath)).size;
          const inExt = path.extname(item.inputPath).slice(1).toLowerCase();
          // HEIC inputs always need re-encoding (sharp can't write HEIC). When the
          // user picks "preserve" with an HEIC input, default to JPEG — the obvious
          // intent is "convert iPhone photos to something universal".
          const inferredFromExt = ['heic', 'heif'].includes(inExt)
            ? 'jpeg'
            : ['jpg', 'jpeg'].includes(inExt)
            ? 'jpeg'
            : (inExt as 'jpeg' | 'webp' | 'avif' | 'png');
          const targetFormat =
            options.format === 'preserve' ? inferredFromExt : options.format;
          const outExt = targetFormat === 'jpeg' ? 'jpg' : targetFormat;
          const base = path.parse(item.inputPath).name;
          const outPath = path.join(options.outputDir, `${base}_compressed.${outExt}`);

          if (isHeic(item.inputPath)) {
            onProgress({ jobId, itemId: item.id, pct: 3, stage: 'Decoding HEIC' });
          } else {
            onProgress({ jobId, itemId: item.id, pct: 5, stage: 'Compressing' });
          }
          let pipe = (await openImage(item.inputPath)).rotate(); // honor EXIF rotation

          if (options.maxWidth && options.maxWidth > 0) {
            const meta = await pipe.clone().metadata();
            if ((meta.width ?? 0) > options.maxWidth) {
              pipe = pipe.resize({
                width: options.maxWidth,
                kernel: 'lanczos3',
                withoutEnlargement: true,
              });
            }
          }

          if (targetFormat === 'jpeg') {
            pipe = pipe.jpeg({ quality: options.quality, mozjpeg: true, progressive: true });
          } else if (targetFormat === 'webp') {
            pipe = pipe.webp({ quality: options.quality, effort: 5 });
          } else if (targetFormat === 'avif') {
            pipe = pipe.avif({ quality: options.quality, effort: 4 });
          } else {
            // png
            pipe = pipe.png({ compressionLevel: 9, palette: options.quality < 80 });
          }

          // Strip metadata by NOT calling .withMetadata(); only re-attach when keeping.
          if (!options.stripMetadata) {
            pipe = pipe.withMetadata();
          }

          await pipe.toFile(outPath);

          // Apply metadata overrides via exiftool if requested.
          // Sanitize: strip newlines and clamp length — CVE GHSA-cw26-7653-2rp5
          // (fixed in v35) showed how raw newlines in tag values let an attacker
          // inject extra exiftool args. Defensive trim even with the patched lib.
          const sanitize = (s: string | undefined) =>
            s ? s.replace(/[\r\n\t\0]+/g, ' ').slice(0, 1024).trim() : '';
          const overrides = options.metadataOverrides ?? {};
          const artist = sanitize(overrides.artist);
          const copyright = sanitize(overrides.copyright);
          const description = sanitize(overrides.description);
          const hasOverrides = artist || copyright || description;
          if (hasOverrides) {
            onProgress({ jobId, itemId: item.id, pct: 80, stage: 'Writing metadata' });
            const tags: Record<string, string> = {};
            if (artist) {
              tags.Artist = artist;
              tags.Creator = artist;
              tags.XPAuthor = artist;
            }
            if (copyright) {
              tags.Copyright = copyright;
              tags.Rights = copyright;
            }
            if (description) {
              tags.ImageDescription = description;
              tags.Description = description;
            }
            try {
              await exiftool.write(outPath, tags, ['-overwrite_original']);
            } catch {
              // Some formats (avif) may not support all tags; non-fatal.
            }
          }

          const bytesOut = (await stat(outPath)).size;
          onProgress({ jobId, itemId: item.id, pct: 100, stage: 'Done', outputPath: outPath });
          results.push({
            itemId: item.id,
            inputPath: item.inputPath,
            outputPath: outPath,
            ok: true,
            bytesIn,
            bytesOut,
            durationMs: Date.now() - t0,
          });
        } catch (err) {
          results.push({
            itemId: item.id,
            inputPath: item.inputPath,
            ok: false,
            error: (err as Error).message,
            durationMs: Date.now() - t0,
          });
          onProgress({ jobId, itemId: item.id, pct: 100, stage: 'Failed' });
        }
      }),
    ),
  );

  return { jobId, items: results };
}

import path from 'node:path';
import { stat } from 'node:fs/promises';
import sharp from 'sharp';
import PQueue from 'p-queue';
import os from 'node:os';
import { ensureDir } from '../paths';
import { isInstalled, runUpscale } from '../realesrgan';
import { isHeic, openImage } from '../imageDecode';
import type {
  ImageUpscaleOptions,
  JobItem,
  JobResult,
  JobResultItem,
  ProgressEvent,
} from '../../preload/index';

export async function runImageUpscale(args: {
  jobId: string;
  items: JobItem[];
  options: ImageUpscaleOptions;
  onProgress: (e: ProgressEvent) => void;
  signal: AbortSignal;
}): Promise<JobResult> {
  const { jobId, items, options, onProgress, signal } = args;
  await ensureDir(options.outputDir);

  // Real-ESRGAN is GPU-bound — run one at a time. Lanczos fallback can fan out.
  const useAi = options.preferAi && isInstalled();
  const queue = new PQueue({ concurrency: useAi ? 1 : Math.max(2, os.cpus().length - 1) });

  const results: JobResultItem[] = [];

  await Promise.all(
    items.map((item) =>
      queue.add(async () => {
        const t0 = Date.now();
        try {
          if (signal.aborted) throw new Error('cancelled');
          const ext = options.outputFormat === 'jpg' ? 'jpg' : options.outputFormat;
          const base = path.parse(item.inputPath).name;
          const outPath = path.join(
            options.outputDir,
            `${base}_x${options.scale}.${ext}`,
          );
          const bytesIn = (await stat(item.inputPath)).size;

          // Real-ESRGAN ncnn-vulkan uses stb_image and can't decode HEIC. If the
          // input is HEIC, we decode it once via heic-convert and feed the
          // intermediate PNG to whichever path runs.
          let workingInput = item.inputPath;
          let cleanupPng: string | null = null;
          if (isHeic(item.inputPath)) {
            onProgress({ jobId, itemId: item.id, pct: 1, stage: 'Decoding HEIC' });
            const tmp = path.join(
              options.outputDir,
              `${path.parse(item.inputPath).name}.heic-decode.tmp.png`,
            );
            await (await openImage(item.inputPath))
              .png({ compressionLevel: 1 })
              .toFile(tmp);
            workingInput = tmp;
            cleanupPng = tmp;
          }

          try {
            if (useAi) {
              const tmpPng =
                ext === 'png' ? outPath : outPath.replace(/\.\w+$/, '.tmp.png');
              onProgress({
                jobId,
                itemId: item.id,
                pct: 3,
                stage: 'Initializing GPU',
              });
              let lastLog: string | undefined;
              let currentPct = 3;
              await runUpscale({
                inputPath: workingInput,
                outputPath: tmpPng,
                scale: options.scale,
                model: options.model,
                onProgress: (pct) => {
                  currentPct = Math.max(3, Math.min(99, pct));
                  onProgress({
                    jobId,
                    itemId: item.id,
                    pct: currentPct,
                    stage: 'AI upscaling',
                    log: lastLog,
                  });
                },
                onLog: (line) => {
                  lastLog = line;
                  // Forward the line without regressing the bar
                  onProgress({
                    jobId,
                    itemId: item.id,
                    pct: currentPct,
                    stage: 'AI upscaling',
                    log: line,
                  });
                },
                signal,
              });
              if (ext !== 'png') {
                onProgress({ jobId, itemId: item.id, pct: 95, stage: 'Encoding' });
                await transcode(tmpPng, outPath, ext);
                await (await import('node:fs/promises')).rm(tmpPng, { force: true });
              }
            } else {
              onProgress({ jobId, itemId: item.id, pct: 5, stage: 'Lanczos resize' });
              const img = sharp(workingInput, { failOn: 'none' });
              const meta = await img.metadata();
              const w = (meta.width ?? 0) * options.scale;
              const pipeline = img.resize({
                width: w,
                kernel: 'lanczos3',
                withoutEnlargement: false,
              });
              await applyEncoder(pipeline, ext).toFile(outPath);
            }
          } finally {
            if (cleanupPng) {
              await (await import('node:fs/promises')).rm(cleanupPng, { force: true });
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

function applyEncoder(pipe: sharp.Sharp, ext: string) {
  if (ext === 'png') return pipe.png({ compressionLevel: 9 });
  if (ext === 'webp') return pipe.webp({ quality: 95, effort: 5 });
  return pipe.jpeg({ quality: 95, mozjpeg: true });
}

async function transcode(inPath: string, outPath: string, ext: string): Promise<void> {
  const pipe = sharp(inPath, { failOn: 'none' });
  await applyEncoder(pipe, ext).toFile(outPath);
}

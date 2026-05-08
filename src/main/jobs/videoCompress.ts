import path from 'node:path';
import { stat } from 'node:fs/promises';
import { ffmpeg, probeVideo } from '../ffmpeg';
import { ensureDir } from '../paths';
import type {
  JobItem,
  JobResult,
  JobResultItem,
  ProgressEvent,
  VideoCompressOptions,
} from '../../preload/index';

/**
 * Video compression — single-pass libx264 with optional resolution downscale.
 *
 * No AI, no frame extraction; one ffmpeg invocation per input. Order of magnitude
 * faster than the upscale pipeline. Use this for: shrinking files for upload,
 * downsizing 4K → 1080p, dropping bitrate while keeping resolution.
 *
 * Trade-off: CRF (Constant Rate Factor) is the lever — lower = bigger + better,
 * higher = smaller + lossier. 18 ≈ visually lossless, 23 = default, 28 = small,
 * 32+ = fall off a cliff for most content.
 */

// Map preset name → output max-height. 'preserve' keeps source dimensions.
const RESOLUTION_HEIGHTS: Record<string, number | null> = {
  preserve: null,
  '1080p': 1080,
  '720p': 720,
  '480p': 480,
  '360p': 360,
};

export async function runVideoCompress(args: {
  jobId: string;
  items: JobItem[];
  options: VideoCompressOptions;
  onProgress: (e: ProgressEvent) => void;
  signal: AbortSignal;
}): Promise<JobResult> {
  const { jobId, items, options, onProgress, signal } = args;
  await ensureDir(options.outputDir);

  // Each ffmpeg run is heavy (uses many cores) — process serially across items.
  const results: JobResultItem[] = [];
  for (const item of items) {
    if (signal.aborted) {
      results.push({
        itemId: item.id,
        inputPath: item.inputPath,
        ok: false,
        error: 'cancelled',
      });
      continue;
    }
    const t0 = Date.now();
    try {
      const r = await processOne({ jobId, item, options, onProgress, signal });
      results.push({ ...r, durationMs: Date.now() - t0 });
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
  }
  return { jobId, items: results };
}

async function processOne(args: {
  jobId: string;
  item: JobItem;
  options: VideoCompressOptions;
  onProgress: (e: ProgressEvent) => void;
  signal: AbortSignal;
}): Promise<JobResultItem> {
  const { jobId, item, options, onProgress, signal } = args;
  onProgress({ jobId, itemId: item.id, pct: 1, stage: 'Probing' });

  const probe = await probeVideo(item.inputPath);
  const bytesIn = (await stat(item.inputPath)).size;
  const base = path.parse(item.inputPath).name;
  const outPath = path.join(options.outputDir, `${base}_compressed.mp4`);

  // Build the video filter chain. Resolution downscale only happens when the
  // source is taller than the target — we never upscale here.
  const targetHeight = RESOLUTION_HEIGHTS[options.resolution];
  const vfilters: string[] = [];
  if (targetHeight && probe.height > targetHeight) {
    // -2 keeps width even-numbered (libx264 requires it) and preserves aspect ratio.
    vfilters.push(`scale=-2:${targetHeight}`);
  }

  onProgress({ jobId, itemId: item.id, pct: 3, stage: 'Encoding' });

  await new Promise<void>((resolve, reject) => {
    const cmd = ffmpeg(item.inputPath)
      .videoCodec('libx264')
      .outputOptions([
        '-pix_fmt', 'yuv420p',
        '-preset', options.preset,
        '-crf', String(options.crf),
        '-movflags', '+faststart',
      ]);

    if (vfilters.length) cmd.videoFilter(vfilters.join(','));

    if (probe.hasAudio) {
      if (options.audioBitrate === 'preserve') {
        cmd.audioCodec('copy');
      } else {
        cmd.audioCodec('aac').audioBitrate(options.audioBitrate);
      }
    } else {
      cmd.noAudio();
    }

    let killed = false;
    const onAbort = () => {
      killed = true;
      cmd.kill('SIGTERM');
    };
    signal.addEventListener('abort', onAbort, { once: true });

    cmd
      .output(outPath)
      .on('progress', (p: { percent?: number }) => {
        if (typeof p.percent === 'number') {
          onProgress({
            jobId,
            itemId: item.id,
            pct: Math.max(3, Math.min(99, p.percent)),
            stage: 'Encoding',
          });
        }
      })
      .on('error', (err: Error) => {
        signal.removeEventListener('abort', onAbort);
        reject(killed ? new Error('cancelled') : err);
      })
      .on('end', () => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      })
      .run();
  });

  const bytesOut = (await stat(outPath)).size;
  onProgress({ jobId, itemId: item.id, pct: 100, stage: 'Done', outputPath: outPath });

  return {
    itemId: item.id,
    inputPath: item.inputPath,
    outputPath: outPath,
    ok: true,
    bytesIn,
    bytesOut,
  };
}

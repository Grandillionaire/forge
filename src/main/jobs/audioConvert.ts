import path from 'node:path';
import { stat } from 'node:fs/promises';
import { ffmpeg } from '../ffmpeg';
import { ensureDir } from '../paths';
import type {
  AudioConvertOptions,
  JobItem,
  JobResult,
  JobResultItem,
  ProgressEvent,
} from '../../preload/index';

/**
 * Audio convert / compress — single FFmpeg pass per file.
 *
 * Supports the common lossy + lossless targets and preserves source codec
 * params via "preserve" sentinels. Bitrate is ignored for lossless targets
 * (FLAC, WAV) — those are inherently sized by sample rate × bit depth.
 */

interface FormatSpec {
  codec: string;
  ext: string;
  lossless: boolean;
}

const FORMATS: Record<AudioConvertOptions['format'], FormatSpec> = {
  mp3:  { codec: 'libmp3lame',  ext: 'mp3',  lossless: false },
  m4a:  { codec: 'aac',         ext: 'm4a',  lossless: false },
  aac:  { codec: 'aac',         ext: 'm4a',  lossless: false },
  wav:  { codec: 'pcm_s16le',   ext: 'wav',  lossless: true  },
  flac: { codec: 'flac',        ext: 'flac', lossless: true  },
  ogg:  { codec: 'libvorbis',   ext: 'ogg',  lossless: false },
  opus: { codec: 'libopus',     ext: 'opus', lossless: false },
};

export async function runAudioConvert(args: {
  jobId: string;
  items: JobItem[];
  options: AudioConvertOptions;
  onProgress: (e: ProgressEvent) => void;
  signal: AbortSignal;
}): Promise<JobResult> {
  const { jobId, items, options, onProgress, signal } = args;
  await ensureDir(options.outputDir);

  // Audio conversions are CPU-light per file but each ffmpeg invocation
  // already uses multiple cores. Run serially to keep the UI responsive.
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
  options: AudioConvertOptions;
  onProgress: (e: ProgressEvent) => void;
  signal: AbortSignal;
}): Promise<JobResultItem> {
  const { jobId, item, options, onProgress, signal } = args;
  const spec = FORMATS[options.format];
  if (!spec) throw new Error(`Unknown audio format: ${options.format}`);

  onProgress({ jobId, itemId: item.id, pct: 1, stage: 'Encoding' });

  const bytesIn = (await stat(item.inputPath)).size;
  const base = path.parse(item.inputPath).name;
  const outPath = path.join(options.outputDir, `${base}_converted.${spec.ext}`);

  await new Promise<void>((resolve, reject) => {
    const cmd = ffmpeg(item.inputPath)
      .audioCodec(spec.codec)
      .noVideo();

    // Bitrate only meaningful for lossy codecs
    if (!spec.lossless && options.bitrate !== 'preserve') {
      cmd.audioBitrate(options.bitrate);
    }

    if (options.sampleRate !== 'preserve') {
      cmd.audioFrequency(Number(options.sampleRate));
    }

    if (options.channels !== 'preserve') {
      cmd.audioChannels(options.channels === 'mono' ? 1 : 2);
    }

    // Container-level extras
    if (spec.ext === 'm4a') {
      cmd.outputOptions(['-movflags', '+faststart']);
    }

    let killed = false;
    const onAbort = () => {
      killed = true;
      cmd.kill('SIGTERM');
    };
    signal.addEventListener('abort', onAbort, { once: true });

    cmd
      .output(outPath)
      .on('progress', (p: { percent?: number; timemark?: string }) => {
        if (typeof p.percent === 'number') {
          onProgress({
            jobId,
            itemId: item.id,
            pct: Math.max(1, Math.min(99, p.percent)),
            stage: 'Encoding',
            log: p.timemark ? `t=${p.timemark}` : undefined,
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

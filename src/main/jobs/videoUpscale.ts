import path from 'node:path';
import os from 'node:os';
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { ffmpeg, probeVideo } from '../ffmpeg';
import { ensureDir } from '../paths';
import { isInstalled, runUpscale } from '../realesrgan';
import PQueue from 'p-queue';
import type {
  JobItem,
  JobResult,
  JobResultItem,
  ProgressEvent,
  VideoUpscaleOptions,
} from '../../preload/index';

/**
 * Pipeline:
 *   1. ffprobe input (dims, fps, duration, audio)
 *   2. ffmpeg extract frames -> tmp/in (PNG sequence)
 *   3. realesrgan-ncnn-vulkan upscale all frames -> tmp/out
 *   4. ffmpeg reassemble PNG sequence + original audio at original fps -> H.264 mp4
 *   5. clean tmp dirs
 *
 * Stages map to progress bands:
 *   extract: 0-15%
 *   upscale: 15-85%
 *   encode:  85-99%
 *   done:    100%
 */
export async function runVideoUpscale(args: {
  jobId: string;
  items: JobItem[];
  options: VideoUpscaleOptions;
  onProgress: (e: ProgressEvent) => void;
  signal: AbortSignal;
}): Promise<JobResult> {
  const { jobId, items, options, onProgress, signal } = args;

  if (!isInstalled()) {
    return {
      jobId,
      items: items.map((it) => ({
        itemId: it.id,
        inputPath: it.inputPath,
        ok: false,
        error: 'Real-ESRGAN not installed. Open Settings to install it.',
      })),
    };
  }
  await ensureDir(options.outputDir);

  // Videos are heavy: process serially across items, parallel within (frame-level).
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
      results.push({
        ...r,
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
  }
  return { jobId, items: results };
}

async function processOne(args: {
  jobId: string;
  item: JobItem;
  options: VideoUpscaleOptions;
  onProgress: (e: ProgressEvent) => void;
  signal: AbortSignal;
}): Promise<JobResultItem> {
  const { jobId, item, options, onProgress, signal } = args;
  const tmpRoot = await mkdtemp(path.join(tmpdir(), 'forge-vid-'));
  const inDir = path.join(tmpRoot, 'in');
  const outDir = path.join(tmpRoot, 'out');
  await ensureDir(inDir);
  await ensureDir(outDir);

  const probe = await probeVideo(item.inputPath);
  const bytesIn = (await stat(item.inputPath)).size;
  const base = path.parse(item.inputPath).name;
  const outPath = path.join(options.outputDir, `${base}_x${options.scale}.mp4`);

  // 1. Extract frames
  onProgress({ jobId, itemId: item.id, pct: 1, stage: 'Extracting frames' });
  await ffmpegRun((c) =>
    c
      .input(item.inputPath)
      .outputOptions(['-q:v', '1', '-pix_fmt', 'rgb24'])
      .output(path.join(inDir, 'frame_%08d.png')),
    (pct) =>
      onProgress({
        jobId,
        itemId: item.id,
        pct: Math.min(15, pct * 0.15),
        stage: 'Extracting frames',
      }),
    signal,
  );

  // 2. Upscale frames (serial — GPU contention)
  const frames = (await readdir(inDir)).filter((f) => f.endsWith('.png')).sort();
  if (frames.length === 0) throw new Error('No frames extracted');
  const queue = new PQueue({ concurrency: 1 });
  let done = 0;
  await Promise.all(
    frames.map((name) =>
      queue.add(async () => {
        if (signal.aborted) throw new Error('cancelled');
        await runUpscale({
          inputPath: path.join(inDir, name),
          outputPath: path.join(outDir, name),
          scale: options.scale,
          model: options.model,
          signal,
        });
        done += 1;
        const frameProgress = (done / frames.length) * 70;
        onProgress({
          jobId,
          itemId: item.id,
          pct: 15 + frameProgress,
          stage: `Upscaling frame ${done}/${frames.length}`,
        });
      }),
    ),
  );

  // 3. Reassemble — copy audio from original
  onProgress({ jobId, itemId: item.id, pct: 85, stage: 'Encoding video' });
  await ffmpegRun((c) => {
    c.input(path.join(outDir, 'frame_%08d.png')).inputOptions(['-framerate', String(probe.fps)]);
    if (probe.hasAudio) {
      c.input(item.inputPath).outputOptions(['-map', '0:v:0', '-map', '1:a:0?']);
    }
    return c
      .videoCodec('libx264')
      .outputOptions([
        '-pix_fmt', 'yuv420p',
        '-preset', options.preset,
        '-crf', String(options.crf),
        '-movflags', '+faststart',
      ])
      .audioCodec('aac')
      .audioBitrate('192k')
      .output(outPath);
  },
    (pct) =>
      onProgress({
        jobId,
        itemId: item.id,
        pct: Math.min(99, 85 + pct * 0.14),
        stage: 'Encoding video',
      }),
    signal,
  );

  // 4. Clean tmp
  await rm(tmpRoot, { recursive: true, force: true });

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

function ffmpegRun(
  configure: (c: ReturnType<typeof ffmpeg>) => ReturnType<typeof ffmpeg>,
  onProgress: (pct: number) => void,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const cmd = configure(ffmpeg());
    let killed = false;
    const onAbort = () => {
      killed = true;
      cmd.kill('SIGTERM');
    };
    signal.addEventListener('abort', onAbort, { once: true });
    cmd
      .on('progress', (p: { percent?: number }) => {
        if (typeof p.percent === 'number') onProgress(Math.max(0, Math.min(100, p.percent)));
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
}

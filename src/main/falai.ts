import { readFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { fal } from '@fal-ai/client';

/**
 * Cloud upscaling via fal.ai. The user supplies their own API key — Forge
 * never holds one — and pays fal.ai directly per call.
 *
 * Each model has slightly different input shape; we normalize to a single
 * call surface (input image, scale, output path) and translate per-model.
 */

export type FalModelId =
  | 'fal-ai/aura-sr'
  | 'fal-ai/clarity-upscaler'
  | 'fal-ai/ccsr'
  | 'fal-ai/esrgan';

export interface FalModelInfo {
  id: FalModelId;
  label: string;
  approxUsd: number;            // approximate cost per image (USD)
  description: string;
}

export const FAL_MODELS: FalModelInfo[] = [
  {
    id: 'fal-ai/aura-sr',
    label: 'aura-sr',
    approxUsd: 0.001,
    description: 'Fast, cheap, photographic — best default',
  },
  {
    id: 'fal-ai/esrgan',
    label: 'esrgan',
    approxUsd: 0.005,
    description: 'Same model as local Real-ESRGAN, on their GPU',
  },
  {
    id: 'fal-ai/clarity-upscaler',
    label: 'clarity-upscaler',
    approxUsd: 0.04,
    description: 'Premium photorealistic, very high detail',
  },
  {
    id: 'fal-ai/ccsr',
    label: 'ccsr',
    approxUsd: 0.04,
    description: 'Content-aware super-resolution, faithful',
  },
];

interface RunArgs {
  apiKey: string;
  model: FalModelId;
  inputPath: string;
  outputPath: string;
  scale: 2 | 3 | 4;
  signal?: AbortSignal;
  onProgress?: (pct: number) => void;
  onLog?: (line: string) => void;
}

export async function runCloudUpscale(args: RunArgs): Promise<void> {
  const { apiKey, model, inputPath, outputPath, scale, signal, onProgress, onLog } = args;

  if (!apiKey || apiKey.length < 10) {
    throw new Error('fal.ai API key is missing. Add one in the Image upscale tab.');
  }

  // Configure per call so swapping keys works without process restart
  fal.config({ credentials: apiKey });

  if (signal?.aborted) throw new Error('cancelled');

  // 1. Upload to fal storage so we don't blow up the request payload with base64
  onLog?.('Uploading source image…');
  const fileBuffer = await readFile(inputPath);
  const fileName = path.basename(inputPath);
  const file = new File([new Uint8Array(fileBuffer)], fileName);
  const imageUrl = await fal.storage.upload(file);

  if (signal?.aborted) throw new Error('cancelled');

  onLog?.('Submitted to fal.ai · waiting in queue…');
  onProgress?.(8);

  const onQueueUpdate = (update: { status: string; logs?: Array<{ message?: string }> }) => {
    if (signal?.aborted) return;
    if (update.status === 'IN_QUEUE') {
      const pos = (update as unknown as { queue_position?: number }).queue_position;
      onLog?.(typeof pos === 'number' && pos > 0 ? `Queued · position ${pos}` : 'Queued on fal.ai');
      onProgress?.(12);
    } else if (update.status === 'IN_PROGRESS') {
      onProgress?.(50);
      const lastLog = update.logs?.at(-1)?.message;
      onLog?.(lastLog ? lastLog.slice(0, 200) : 'Running on fal.ai GPU…');
    } else if (update.status === 'COMPLETED') {
      onProgress?.(85);
      onLog?.('Downloading result');
    }
  };

  // The fal client types each endpoint input strictly. Doing the dispatch
  // inline (one call per model) keeps every input type-checked end-to-end.
  let result: FalResultShape;
  switch (model) {
    case 'fal-ai/aura-sr':
      result = await fal.subscribe('fal-ai/aura-sr', {
        input: { image_url: imageUrl, upscale_factor: scale },
        logs: true,
        onQueueUpdate,
      });
      break;
    case 'fal-ai/clarity-upscaler':
      result = await fal.subscribe('fal-ai/clarity-upscaler', {
        input: { image_url: imageUrl, upscale_factor: scale },
        logs: true,
        onQueueUpdate,
      });
      break;
    case 'fal-ai/ccsr':
      result = await fal.subscribe('fal-ai/ccsr', {
        input: { image_url: imageUrl, scale },
        logs: true,
        onQueueUpdate,
      });
      break;
    case 'fal-ai/esrgan':
      result = await fal.subscribe('fal-ai/esrgan', {
        input: { image_url: imageUrl, scale },
        logs: true,
        onQueueUpdate,
      });
      break;
  }

  if (signal?.aborted) throw new Error('cancelled');

  // 4. Pull out the output URL (shape varies subtly per model)
  const outUrl = extractOutputUrl(result);
  if (!outUrl) {
    throw new Error(
      `fal.ai returned no output URL — got: ${JSON.stringify(result.data).slice(0, 200)}`,
    );
  }

  // 5. Download to outputPath
  await downloadTo(outUrl, outputPath);
  onProgress?.(99);
}

interface FalResultShape {
  data?: {
    image?: { url?: string };
    images?: Array<{ url?: string }>;
  };
}

function extractOutputUrl(result: FalResultShape): string | null {
  const data = result?.data;
  if (!data) return null;
  if (data.image?.url) return data.image.url;
  if (Array.isArray(data.images) && data.images[0]?.url) return data.images[0].url;
  return null;
}

async function downloadTo(url: string, dest: string): Promise<void> {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error(`Download failed ${res.status}: ${url}`);
  const sink = createWriteStream(dest);
  await pipeline(
    (async function* () {
      const reader = res.body!.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        yield value;
      }
    })(),
    sink,
  );
}

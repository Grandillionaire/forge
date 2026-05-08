import { contextBridge, ipcRenderer, webUtils } from 'electron';

export type JobKind = 'image-upscale' | 'image-compress' | 'video-upscale';

export interface ImageUpscaleOptions {
  scale: 2 | 3 | 4;
  model: 'realesrgan-x4plus' | 'realesrgan-x4plus-anime' | 'realesr-animevideov3';
  outputFormat: 'png' | 'jpg' | 'webp';
  outputDir: string;
  preferAi: boolean;
}

export interface ImageCompressOptions {
  format: 'jpeg' | 'webp' | 'avif' | 'preserve';
  quality: number;          // 1-100
  maxWidth?: number;        // 0 = no resize
  stripMetadata: boolean;
  metadataOverrides?: {
    artist?: string;
    copyright?: string;
    description?: string;
  };
  outputDir: string;
}

export interface VideoUpscaleOptions {
  scale: 2 | 3 | 4;
  model: 'realesrgan-x4plus' | 'realesr-animevideov3';
  crf: number;              // ffmpeg CRF, lower = better
  preset: 'ultrafast' | 'fast' | 'medium' | 'slow';
  outputDir: string;
}

export type VideoResolutionPreset = 'preserve' | '1080p' | '720p' | '480p' | '360p';
export type VideoAudioBitrate = '64k' | '128k' | '192k' | '256k' | 'preserve';

export interface VideoCompressOptions {
  resolution: VideoResolutionPreset;
  crf: number;              // 18-32 typical for compression; higher = smaller
  preset: 'ultrafast' | 'fast' | 'medium' | 'slow';
  audioBitrate: VideoAudioBitrate;
  outputDir: string;
}

export interface JobItem {
  id: string;
  inputPath: string;
}

export interface ProgressEvent {
  jobId: string;
  itemId: string;
  pct: number;          // 0-100
  stage: string;
  outputPath?: string;
  // Most recent informative line from the underlying binary (ncnn-vulkan,
  // ffmpeg). Surfacing this in the UI gives users continuous feedback even
  // when the percentage hasn't moved (e.g., GPU init, single huge tile).
  log?: string;
}

export interface JobResultItem {
  itemId: string;
  inputPath: string;
  outputPath?: string;
  ok: boolean;
  error?: string;
  bytesIn?: number;
  bytesOut?: number;
  durationMs?: number;
}

export interface JobResult {
  jobId: string;
  items: JobResultItem[];
}

const api = {
  /**
   * Resolve a dropped File to its absolute filesystem path. Electron 32+
   * removed File.path; webUtils.getPathForFile is the supported replacement.
   */
  getPathForFile: (file: File): string => webUtils.getPathForFile(file),
  pickFiles: (kind: 'image' | 'video') =>
    ipcRenderer.invoke('dialog:pickFiles', kind) as Promise<string[]>,
  pickDirectory: () =>
    ipcRenderer.invoke('dialog:pickDirectory') as Promise<string | null>,
  defaultOutputDir: () =>
    ipcRenderer.invoke('app:defaultOutputDir') as Promise<string>,
  revealInFinder: (p: string) =>
    ipcRenderer.invoke('shell:reveal', p) as Promise<void>,
  openPath: (p: string) =>
    ipcRenderer.invoke('shell:openPath', p) as Promise<void>,
  openExternal: (url: string) =>
    ipcRenderer.invoke('shell:openExternal', url) as Promise<void>,
  probe: (paths: string[]) =>
    ipcRenderer.invoke('media:probe', paths) as Promise<
      Array<{ path: string; ok: boolean; width?: number; height?: number; bytes?: number; durationSec?: number; thumbnail?: string }>
    >,
  imageUpscale: (items: JobItem[], options: ImageUpscaleOptions) =>
    ipcRenderer.invoke('job:imageUpscale', items, options) as Promise<JobResult>,
  imageCompress: (items: JobItem[], options: ImageCompressOptions) =>
    ipcRenderer.invoke('job:imageCompress', items, options) as Promise<JobResult>,
  videoUpscale: (items: JobItem[], options: VideoUpscaleOptions) =>
    ipcRenderer.invoke('job:videoUpscale', items, options) as Promise<JobResult>,
  videoCompress: (items: JobItem[], options: VideoCompressOptions) =>
    ipcRenderer.invoke('job:videoCompress', items, options) as Promise<JobResult>,
  cancelJob: (jobId: string) =>
    ipcRenderer.invoke('job:cancel', jobId) as Promise<void>,
  onProgress: (cb: (e: ProgressEvent) => void) => {
    const listener = (_: unknown, e: ProgressEvent) => cb(e);
    ipcRenderer.on('job:progress', listener);
    return () => ipcRenderer.removeListener('job:progress', listener);
  },
  diagnostics: () =>
    ipcRenderer.invoke('app:diagnostics') as Promise<{
      ffmpegPath: string;
      realesrganAvailable: boolean;
      realesrganPath?: string;
      cpuCount: number;
      platform: string;
      arch: string;
    }>,
  ensureRealesrgan: () =>
    ipcRenderer.invoke('app:ensureRealesrgan') as Promise<{ ok: boolean; path?: string; message?: string }>,
};

contextBridge.exposeInMainWorld('forge', api);

export type ForgeApi = typeof api;

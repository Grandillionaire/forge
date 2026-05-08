import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import path from 'node:path';
import os from 'node:os';
import { stat } from 'node:fs/promises';
import sharp from 'sharp';
import log from 'electron-log/main';
import { ffmpegPath, probeAudio, probeVideo } from './ffmpeg';
import { defaultOutputDir, ensureDir } from './paths';
import * as realesrgan from './realesrgan';
import { runImageUpscale } from './jobs/imageUpscale';
import { runImageCompress } from './jobs/imageCompress';
import { runVideoUpscale } from './jobs/videoUpscale';
import { runVideoCompress } from './jobs/videoCompress';
import { runAudioConvert } from './jobs/audioConvert';
import { openImage } from './imageDecode';

log.transports.file.level = 'info';
import { setupAutoUpdater } from './updater';
import type {
  AudioConvertOptions,
  ImageCompressOptions,
  ImageUpscaleOptions,
  JobItem,
  ProgressEvent,
  VideoCompressOptions,
  VideoUpscaleOptions,
} from '../preload/index';

const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'webp', 'tiff', 'tif', 'bmp', 'avif', 'heic', 'heif'] as const;
const VIDEO_EXT = ['mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v'] as const;
const AUDIO_EXT = [
  'mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg', 'opus',
  'wma', 'amr', 'aiff', 'aif', 'mp2', 'mka', 'm4b',
] as const;
const ALL_EXT = new Set<string>([...IMAGE_EXT, ...VIDEO_EXT, ...AUDIO_EXT]);

const jobControllers = new Map<string, AbortController>();

/* ── Input validation helpers ──────────────────────────────────────────────
   The renderer is locked down (sandbox + contextIsolation + CSP), but we still
   validate every IPC payload defensively. Belt + suspenders. */
function isString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0 && v.length < 4096;
}
function isMediaPath(p: unknown): p is string {
  if (!isString(p)) return false;
  if (p.includes('\0')) return false; // null-byte injection
  const ext = path.extname(p).slice(1).toLowerCase();
  return ALL_EXT.has(ext);
}
function isJobItem(x: unknown): x is JobItem {
  return (
    typeof x === 'object' && x !== null &&
    isString((x as JobItem).id) &&
    isMediaPath((x as JobItem).inputPath)
  );
}
function isJobItems(arr: unknown): arr is JobItem[] {
  return Array.isArray(arr) && arr.length > 0 && arr.length < 5000 && arr.every(isJobItem);
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 720,
    minHeight: 600,
    show: false,
    backgroundColor: '#0A0B0D',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    title: 'Forge',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
    },
  });

  win.on('ready-to-show', () => win.show());

  // Reject any attempt to open a new window or navigate away from the renderer
  // bundle — defense-in-depth even though CSP would catch it too.
  win.webContents.setWindowOpenHandler(({ url }) => {
    // External links open in the system browser; everything else is denied.
    if (/^https?:\/\//.test(url)) {
      shell.openExternal(url).catch(() => {});
    }
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
  return win;
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('app.forge.studio');
  app.on('browser-window-created', (_, w) => optimizer.watchWindowShortcuts(w));

  registerIpc();

  let mainWindow: BrowserWindow | null = createWindow();
  mainWindow.on('closed', () => { mainWindow = null; });

  setupAutoUpdater(() => mainWindow);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
      mainWindow.on('closed', () => { mainWindow = null; });
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function registerIpc(): void {
  ipcMain.handle('dialog:pickFiles', async (_e, kind: unknown) => {
    const k =
      kind === 'image' || kind === 'video' || kind === 'audio' ? kind : 'image';
    const filters =
      k === 'image'
        ? [{ name: 'Images', extensions: [...IMAGE_EXT] }]
        : k === 'video'
        ? [{ name: 'Videos', extensions: [...VIDEO_EXT] }]
        : [{ name: 'Audio', extensions: [...AUDIO_EXT] }];
    const titleByKind = { image: 'Select images', video: 'Select videos', audio: 'Select audio files' };
    const r = await dialog.showOpenDialog({
      title: titleByKind[k],
      properties: ['openFile', 'multiSelections'],
      filters,
    });
    return r.canceled ? [] : r.filePaths;
  });

  ipcMain.handle('dialog:pickDirectory', async () => {
    const r = await dialog.showOpenDialog({
      title: 'Select output folder',
      properties: ['openDirectory', 'createDirectory'],
    });
    return r.canceled ? null : r.filePaths[0];
  });

  ipcMain.handle('app:defaultOutputDir', async () => {
    const dir = defaultOutputDir();
    await ensureDir(dir);
    return dir;
  });

  // Reveal/open: only allow paths whose extensions are media or that point at
  // directories. Stops a hijacked renderer from making us reveal /etc/passwd.
  ipcMain.handle('shell:reveal', async (_e, p: unknown) => {
    if (!isString(p)) return;
    const ext = path.extname(p).slice(1).toLowerCase();
    if (!ALL_EXT.has(ext)) return;
    shell.showItemInFolder(p);
  });

  // External URLs only — http(s) only, opened in the system browser.
  ipcMain.handle('shell:openExternal', async (_e, url: unknown) => {
    if (!isString(url)) return;
    if (!/^https:\/\/[\w.-]+(\/.*)?$/i.test(url) && !/^http:\/\/[\w.-]+(\/.*)?$/i.test(url)) return;
    await shell.openExternal(url);
  });

  ipcMain.handle('shell:openPath', async (_e, p: unknown) => {
    if (!isString(p) || p.includes('\0')) return '';
    // Allow opening directories (output folder) and known media files only.
    try {
      const s = await stat(p);
      if (s.isDirectory()) return shell.openPath(p);
      const ext = path.extname(p).slice(1).toLowerCase();
      if (ALL_EXT.has(ext)) return shell.openPath(p);
    } catch { /* path invalid — drop silently */ }
    return '';
  });

  ipcMain.handle('media:probe', async (_e, paths: unknown) => {
    if (!Array.isArray(paths) || paths.length > 5000) return [];
    return Promise.all(
      paths.filter(isMediaPath).map(async (p) => {
        try {
          const ext = path.extname(p).slice(1).toLowerCase();
          const sz = (await stat(p)).size;
          if ((IMAGE_EXT as readonly string[]).includes(ext)) {
            // openImage() handles HEIC via heic-convert; sharp can decode
            // the rest natively. Metadata still uses sharp directly because
            // its HEIC header parsing works without the HEVC plugin.
            const meta = await sharp(p, { failOn: 'none' }).metadata();
            const decoded = await openImage(p).catch(() => null);
            const thumb = decoded
              ? await decoded
                  .rotate()
                  .resize({ width: 96, withoutEnlargement: true })
                  .jpeg({ quality: 70 })
                  .toBuffer()
                  .catch(() => null)
              : null;
            return {
              path: p,
              ok: true,
              width: meta.width,
              height: meta.height,
              bytes: sz,
              thumbnail: thumb ? `data:image/jpeg;base64,${thumb.toString('base64')}` : undefined,
            };
          }
          if ((VIDEO_EXT as readonly string[]).includes(ext)) {
            const v = await probeVideo(p);
            return { path: p, ok: true, width: v.width, height: v.height, bytes: sz, durationSec: v.durationSec };
          }
          if ((AUDIO_EXT as readonly string[]).includes(ext)) {
            // ffprobe also handles pure-audio files; probeVideo() throws when
            // it can't find a video stream, so use a slimmer probe directly.
            const probe = await probeAudio(p).catch(() => null);
            return {
              path: p,
              ok: true,
              bytes: sz,
              durationSec: probe?.durationSec,
            };
          }
          return { path: p, ok: false };
        } catch {
          return { path: p, ok: false };
        }
      }),
    );
  });

  ipcMain.handle('app:diagnostics', async () => ({
    ffmpegPath: ffmpegPath ?? '',
    realesrganAvailable: realesrgan.isInstalled(),
    realesrganPath: realesrgan.isInstalled() ? undefined : undefined,
    cpuCount: os.cpus().length,
    platform: process.platform,
    arch: process.arch,
  }));

  ipcMain.handle('app:ensureRealesrgan', async (e) => {
    const send = (msg: string) =>
      e.sender.send('job:progress', {
        jobId: 'install',
        itemId: 'realesrgan',
        pct: 50,
        stage: msg,
      } satisfies ProgressEvent);
    return realesrgan.ensureInstalled(send);
  });

  ipcMain.handle('job:cancel', async (_e, jobId: unknown) => {
    if (!isString(jobId)) return;
    jobControllers.get(jobId)?.abort();
    jobControllers.delete(jobId);
  });

  // Each job handler is defensive in three layers:
  //   1. Validate inputs and *log + return a structured failure* if invalid,
  //      so the UI can show the user what's wrong instead of an empty result.
  //   2. Wrap the run in try/catch so unhandled exceptions in the pipeline
  //      surface as per-item errors in the result, not silent IPC failures.
  //   3. Log job lifecycle (start, validation issues, exception) to main.log
  //      so we can debug from the user's machine without a debugger.
  ipcMain.handle('job:imageUpscale', (e, items, options) =>
    runJobHandler('imageUpscale', e, items, options, isImageUpscaleOptions, runImageUpscale),
  );
  ipcMain.handle('job:imageCompress', (e, items, options) =>
    runJobHandler('imageCompress', e, items, options, isImageCompressOptions, runImageCompress),
  );
  ipcMain.handle('job:videoUpscale', (e, items, options) =>
    runJobHandler('videoUpscale', e, items, options, isVideoUpscaleOptions, runVideoUpscale),
  );
  ipcMain.handle('job:videoCompress', (e, items, options) =>
    runJobHandler('videoCompress', e, items, options, isVideoCompressOptions, runVideoCompress),
  );
  ipcMain.handle('job:audioConvert', (e, items, options) =>
    runJobHandler('audioConvert', e, items, options, isAudioConvertOptions, runAudioConvert),
  );
}

/**
 * Wraps a job pipeline with validation, logging, and exception capture.
 *
 * Always returns a JobResult — never throws back through IPC. If the inputs
 * are invalid, returns a result where every item has `ok: false` with a
 * specific error message. If the pipeline itself throws, every item still
 * gets an error rather than the renderer being stuck on "Queued" forever.
 */
async function runJobHandler<O>(
  jobName: string,
  e: Electron.IpcMainInvokeEvent,
  items: unknown,
  options: unknown,
  validateOptions: (o: unknown) => o is O,
  fn: (a: {
    jobId: string;
    items: JobItem[];
    options: O;
    onProgress: (ev: ProgressEvent) => void;
    signal: AbortSignal;
  }) => Promise<unknown>,
) {
  // Itemize what's wrong so failures show up in the UI per-row, not silently.
  if (!Array.isArray(items) || items.length === 0) {
    log.warn(`[${jobName}] rejected: items is not a non-empty array`);
    return { jobId: '', items: [] };
  }

  if (!validateOptions(options)) {
    log.warn(`[${jobName}] rejected: invalid options`, options);
    return {
      jobId: '',
      items: items.map((it: { id?: unknown; inputPath?: unknown }, i) => ({
        itemId: typeof it?.id === 'string' ? it.id : `?${i}`,
        inputPath: typeof it?.inputPath === 'string' ? it.inputPath : '',
        ok: false,
        error: 'Invalid options — please re-check the form values',
      })),
    };
  }

  // Per-item validation: surface only the specific items that failed,
  // run the rest. Beats rejecting the whole batch silently.
  const valid: JobItem[] = [];
  const invalid: Array<{ itemId: string; inputPath: string; error: string }> = [];
  for (const raw of items) {
    if (!isJobItem(raw)) {
      const it = raw as { id?: unknown; inputPath?: unknown };
      invalid.push({
        itemId: typeof it?.id === 'string' ? it.id : '?',
        inputPath: typeof it?.inputPath === 'string' ? it.inputPath : '',
        error: 'Unsupported file type or invalid path',
      });
      log.warn(`[${jobName}] item rejected:`, raw);
      continue;
    }
    valid.push(raw);
  }

  if (valid.length === 0) {
    return {
      jobId: '',
      items: invalid.map((x) => ({ ...x, ok: false })),
    };
  }

  log.info(`[${jobName}] starting: ${valid.length} item(s)`);
  try {
    const result = (await runWithController(valid, options, e, fn)) as {
      jobId: string;
      items: Array<{ itemId: string; inputPath: string; ok: boolean; error?: string }>;
    };
    log.info(
      `[${jobName}] finished: ` +
        `${result.items.filter((r) => r.ok).length} ok, ` +
        `${result.items.filter((r) => !r.ok).length} failed`,
    );
    // Stitch in the items that failed validation so the UI updates them too.
    return {
      ...result,
      items: [...result.items, ...invalid.map((x) => ({ ...x, ok: false }))],
    };
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    log.error(`[${jobName}] threw:`, err);
    return {
      jobId: '',
      items: [
        ...valid.map((it) => ({
          itemId: it.id,
          inputPath: it.inputPath,
          ok: false,
          error: `Forge crashed during ${jobName}: ${msg}`,
        })),
        ...invalid.map((x) => ({ ...x, ok: false })),
      ],
    };
  }
}

/* ── Option validators ──────────────────────────────────────────────────────
   Loose shape checks. We don't strictly enforce every enum because the option
   handlers themselves fall back gracefully on unrecognized values. */
function isImageUpscaleOptions(o: unknown): o is ImageUpscaleOptions {
  return typeof o === 'object' && o !== null
    && [2, 3, 4].includes((o as ImageUpscaleOptions).scale)
    && isString((o as ImageUpscaleOptions).model)
    && isString((o as ImageUpscaleOptions).outputFormat)
    && isString((o as ImageUpscaleOptions).outputDir)
    && typeof (o as ImageUpscaleOptions).preferAi === 'boolean';
}
function isImageCompressOptions(o: unknown): o is ImageCompressOptions {
  if (typeof o !== 'object' || o === null) return false;
  const c = o as ImageCompressOptions;
  return isString(c.format)
    && typeof c.quality === 'number' && c.quality >= 1 && c.quality <= 100
    && typeof c.stripMetadata === 'boolean'
    && isString(c.outputDir);
}
function isVideoUpscaleOptions(o: unknown): o is VideoUpscaleOptions {
  if (typeof o !== 'object' || o === null) return false;
  const v = o as VideoUpscaleOptions;
  return [2, 3, 4].includes(v.scale)
    && isString(v.model)
    && typeof v.crf === 'number' && v.crf >= 0 && v.crf <= 51
    && isString(v.preset)
    && isString(v.outputDir);
}
function isVideoCompressOptions(o: unknown): o is VideoCompressOptions {
  if (typeof o !== 'object' || o === null) return false;
  const v = o as VideoCompressOptions;
  return isString(v.resolution)
    && typeof v.crf === 'number' && v.crf >= 0 && v.crf <= 51
    && isString(v.preset)
    && isString(v.audioBitrate)
    && isString(v.outputDir);
}
function isAudioConvertOptions(o: unknown): o is AudioConvertOptions {
  if (typeof o !== 'object' || o === null) return false;
  const a = o as AudioConvertOptions;
  return isString(a.format)
    && isString(a.bitrate)
    && isString(a.sampleRate)
    && isString(a.channels)
    && isString(a.outputDir);
}

async function runWithController<O>(
  items: JobItem[],
  options: O,
  e: Electron.IpcMainInvokeEvent,
  fn: (a: {
    jobId: string;
    items: JobItem[];
    options: O;
    onProgress: (ev: ProgressEvent) => void;
    signal: AbortSignal;
  }) => Promise<unknown>,
) {
  const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const ctrl = new AbortController();
  jobControllers.set(jobId, ctrl);
  try {
    return await fn({
      jobId,
      items,
      options,
      signal: ctrl.signal,
      onProgress: (ev) => {
        if (!e.sender.isDestroyed()) e.sender.send('job:progress', ev);
      },
    });
  } finally {
    jobControllers.delete(jobId);
  }
}

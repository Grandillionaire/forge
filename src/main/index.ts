import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import path from 'node:path';
import os from 'node:os';
import { stat } from 'node:fs/promises';
import sharp from 'sharp';
import { ffmpegPath, probeVideo } from './ffmpeg';
import { defaultOutputDir, ensureDir } from './paths';
import * as realesrgan from './realesrgan';
import { runImageUpscale } from './jobs/imageUpscale';
import { runImageCompress } from './jobs/imageCompress';
import { runVideoUpscale } from './jobs/videoUpscale';
import { runVideoCompress } from './jobs/videoCompress';
import { openImage } from './imageDecode';
import { setupAutoUpdater } from './updater';
import type {
  ImageCompressOptions,
  ImageUpscaleOptions,
  JobItem,
  ProgressEvent,
  VideoCompressOptions,
  VideoUpscaleOptions,
} from '../preload/index';

const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'webp', 'tiff', 'tif', 'bmp', 'avif', 'heic'] as const;
const VIDEO_EXT = ['mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v'] as const;
const ALL_EXT = new Set<string>([...IMAGE_EXT, ...VIDEO_EXT]);

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
    const k = kind === 'image' || kind === 'video' ? kind : 'image';
    const filters =
      k === 'image'
        ? [{ name: 'Images', extensions: [...IMAGE_EXT] }]
        : [{ name: 'Videos', extensions: [...VIDEO_EXT] }];
    const r = await dialog.showOpenDialog({
      title: k === 'image' ? 'Select images' : 'Select videos',
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

  ipcMain.handle(
    'job:imageUpscale',
    async (e, items: unknown, options: unknown) => {
      if (!isJobItems(items) || !isImageUpscaleOptions(options)) return { jobId: '', items: [] };
      return runWithController(items, options, e, runImageUpscale);
    },
  );
  ipcMain.handle(
    'job:imageCompress',
    async (e, items: unknown, options: unknown) => {
      if (!isJobItems(items) || !isImageCompressOptions(options)) return { jobId: '', items: [] };
      return runWithController(items, options, e, runImageCompress);
    },
  );
  ipcMain.handle(
    'job:videoUpscale',
    async (e, items: unknown, options: unknown) => {
      if (!isJobItems(items) || !isVideoUpscaleOptions(options)) return { jobId: '', items: [] };
      return runWithController(items, options, e, runVideoUpscale);
    },
  );
  ipcMain.handle(
    'job:videoCompress',
    async (e, items: unknown, options: unknown) => {
      if (!isJobItems(items) || !isVideoCompressOptions(options)) return { jobId: '', items: [] };
      return runWithController(items, options, e, runVideoCompress);
    },
  );
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

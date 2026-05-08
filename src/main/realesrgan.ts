import { existsSync } from 'node:fs';
import { chmod, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { ensureDir, realesrganBinaryPath, realesrganDir } from './paths';

// Upstream release we vendor against. ncnn-vulkan binary set covers macOS-arm64,
// macOS-x64, linux, windows, and ships the four standard model files.
const RELEASE_TAG = '20220424';
const ASSET_URL_BASE =
  'https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0';

function assetForPlatform(): { url: string; archiveName: string; archDir: string } {
  if (process.platform === 'darwin') {
    return {
      url: `${ASSET_URL_BASE}/realesrgan-ncnn-vulkan-${RELEASE_TAG}-macos.zip`,
      archiveName: `realesrgan-${RELEASE_TAG}-macos.zip`,
      archDir: process.arch === 'arm64' ? 'macos-arm64' : 'macos-x64',
    };
  }
  if (process.platform === 'win32') {
    return {
      url: `${ASSET_URL_BASE}/realesrgan-ncnn-vulkan-${RELEASE_TAG}-windows.zip`,
      archiveName: `realesrgan-${RELEASE_TAG}-windows.zip`,
      archDir: 'windows',
    };
  }
  return {
    url: `${ASSET_URL_BASE}/realesrgan-ncnn-vulkan-${RELEASE_TAG}-ubuntu.zip`,
    archiveName: `realesrgan-${RELEASE_TAG}-ubuntu.zip`,
    archDir: 'ubuntu',
  };
}

export function isInstalled(): boolean {
  return existsSync(realesrganBinaryPath());
}

export async function ensureInstalled(
  onProgress?: (msg: string) => void,
): Promise<{ ok: boolean; path?: string; message?: string }> {
  try {
    if (isInstalled()) return { ok: true, path: realesrganBinaryPath() };

    const { url, archiveName, archDir } = assetForPlatform();
    const dir = await ensureDir(realesrganDir());
    const zipPath = path.join(dir, archiveName);

    onProgress?.('Downloading Real-ESRGAN ncnn-vulkan…');
    await downloadFile(url, zipPath, onProgress);

    // The macOS upstream zip extracts FLAT (binary + models/ + samples directly into
    // the target). The Linux/Windows zips wrap their contents in
    // `realesrgan-ncnn-vulkan-<tag>-<plat>/`. We normalize both to `<archDir>/`.
    onProgress?.('Extracting…');
    const finalDir = path.join(dir, archDir);
    if (existsSync(finalDir)) await rm(finalDir, { recursive: true, force: true });
    await ensureDir(finalDir);
    await unzipMac(zipPath, finalDir);

    // If the archive wrapped contents in a single subdir, lift them up.
    const fsp = await import('node:fs/promises');
    const top = await fsp.readdir(finalDir, { withFileTypes: true });
    const onlyDir =
      top.length === 1 && top[0].isDirectory() ? top[0].name : null;
    if (onlyDir) {
      const inner = path.join(finalDir, onlyDir);
      for (const entry of await fsp.readdir(inner)) {
        await fsp.rename(path.join(inner, entry), path.join(finalDir, entry));
      }
      await fsp.rmdir(inner);
    }

    const bin = realesrganBinaryPath();
    if (!existsSync(bin)) {
      throw new Error(
        `Binary missing after extract: ${bin}. Got: ${(await fsp.readdir(finalDir)).join(', ')}`,
      );
    }
    await chmod(bin, 0o755);

    // macOS quarantines downloaded binaries — strip it so spawn doesn't get blocked.
    if (process.platform === 'darwin') {
      try {
        const { spawnSync } = await import('node:child_process');
        spawnSync('xattr', ['-dr', 'com.apple.quarantine', finalDir], { stdio: 'ignore' });
      } catch { /* non-fatal */ }
    }

    await rm(zipPath, { force: true });
    return { ok: true, path: bin };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

async function downloadFile(
  url: string,
  dest: string,
  onProgress?: (msg: string) => void,
): Promise<void> {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error(`Download failed ${res.status}: ${url}`);
  const total = Number(res.headers.get('content-length') ?? 0);
  let received = 0;
  const reader = res.body.getReader();
  const sink = createWriteStream(dest);
  await pipeline(
    (async function* () {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        if (total && onProgress) {
          const pct = ((received / total) * 100).toFixed(1);
          onProgress(`Downloading Real-ESRGAN ${pct}%`);
        }
        yield value;
      }
    })(),
    sink,
  );
}

function unzipMac(zip: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const cmd = process.platform === 'win32' ? 'tar' : 'unzip';
    const args =
      process.platform === 'win32'
        ? ['-xf', zip, '-C', dest]
        : ['-q', '-o', zip, '-d', dest];
    const p = spawn(cmd, args, { stdio: 'ignore' });
    p.on('error', reject);
    p.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`unzip exit ${code}`)),
    );
  });
}

/**
 * Run the ncnn-vulkan binary on a single image.
 *
 * Progress: ncnn streams "0.50%" / "12.50%" lines to stderr. We extract the
 * LAST percentage in each chunk (multi-line chunks are common when the binary
 * produces ticks faster than Node reads the pipe).
 *
 * Logs: the full stderr tail is buffered (last 8 KB) so we can surface a
 * meaningful error message if the process exits non-zero, and we also pass the
 * most recent meaningful line (init / progress / status) up through onLog so
 * the UI can show users what the binary is currently doing.
 */
export function runUpscale(args: {
  inputPath: string;
  outputPath: string;
  scale: 2 | 3 | 4;
  model: string;
  onProgress?: (pct: number) => void;
  onLog?: (line: string) => void;
  signal?: AbortSignal;
}): Promise<void> {
  const bin = realesrganBinaryPath();
  if (!existsSync(bin)) {
    return Promise.reject(new Error('Real-ESRGAN binary not installed'));
  }
  const modelDir = path.join(path.dirname(bin), 'models');
  return new Promise((resolve, reject) => {
    const proc = spawn(
      bin,
      [
        '-i', args.inputPath,
        '-o', args.outputPath,
        '-n', args.model,
        '-s', String(args.scale),
        '-m', modelDir,
        '-f', path.extname(args.outputPath).slice(1) || 'png',
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );

    let killed = false;
    if (args.signal) {
      args.signal.addEventListener(
        'abort',
        () => { killed = true; proc.kill('SIGTERM'); },
        { once: true },
      );
    }

    // Cap stderr buffer at 8KB. Enough for diagnostics, nowhere near memory growth.
    let stderrTail = '';
    const PCT_RE = /([\d.]+)%/g;

    proc.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stderrTail = (stderrTail + text).slice(-8192);

      // Capture every match in this chunk; the last one is the freshest %.
      const matches = [...text.matchAll(PCT_RE)];
      if (matches.length && args.onProgress) {
        const pct = Number(matches[matches.length - 1][1]);
        if (!Number.isNaN(pct)) args.onProgress(Math.min(99, pct));
      }

      // Surface the most recent non-empty informational line. Skip the
      // percentage-only lines because they're already reflected in the bar.
      if (args.onLog) {
        const lines = text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
        for (const line of lines.reverse()) {
          if (!/^[\d.]+%$/.test(line)) {
            args.onLog(line.slice(0, 200));
            break;
          }
        }
      }
    });

    proc.on('error', (err) => reject(killed ? new Error('cancelled') : err));
    proc.on('close', (code) => {
      if (killed) return reject(new Error('cancelled'));
      if (code === 0) return resolve();
      const tailLines = stderrTail.split(/\r?\n/).filter((l) => l.trim()).slice(-3).join(' · ');
      reject(new Error(`Real-ESRGAN exit ${code}${tailLines ? ` — ${tailLines}` : ''}`));
    });
  });
}

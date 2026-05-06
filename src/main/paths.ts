import { app } from 'electron';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import os from 'node:os';

export function userDataDir(): string {
  return app.getPath('userData');
}

export function realesrganDir(): string {
  return join(userDataDir(), 'realesrgan');
}

export function realesrganBinaryPath(): string {
  let archDir: string;
  if (process.platform === 'darwin') {
    archDir = process.arch === 'arm64' ? 'macos-arm64' : 'macos-x64';
  } else if (process.platform === 'win32') {
    archDir = 'windows';
  } else {
    archDir = 'ubuntu';
  }
  const binName = process.platform === 'win32' ? 'realesrgan-ncnn-vulkan.exe' : 'realesrgan-ncnn-vulkan';
  return join(realesrganDir(), archDir, binName);
}

export function tempDir(suffix = ''): string {
  return join(os.tmpdir(), `forge-${process.pid}${suffix}`);
}

export async function ensureDir(p: string): Promise<string> {
  if (!existsSync(p)) await mkdir(p, { recursive: true });
  return p;
}

export function defaultOutputDir(): string {
  return join(app.getPath('downloads'), 'Forge');
}

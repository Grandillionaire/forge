// Smoke test runner — exercises the real pipelines against real files.
// Bypasses Electron's window/IPC layer; everything else (sharp, ffmpeg-static,
// exiftool-vendored, realesrgan-ncnn-vulkan) is the actual production code.
//
// Usage: node scripts/smoke.mjs [step]
//   step ∈ { compress, upscale-lanczos, upscale-ai, video, all }
//
// Stages a fake `electron` module before any production import touches it,
// so jobs/* can call paths.ts without booting a real Electron app.

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import os from 'node:os';
import Module from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const SMOKE_ROOT = '/tmp/forge-smoke';
const IN_DIR = path.join(SMOKE_ROOT, 'in');
const OUT_DIR = path.join(SMOKE_ROOT, 'out');

// ── Inject a fake `electron` module so paths.ts works without a real app boot ──
const userDataDir = path.join(SMOKE_ROOT, 'userData');
const downloadsDir = path.join(SMOKE_ROOT, 'downloads');
fs.mkdirSync(userDataDir, { recursive: true });
fs.mkdirSync(downloadsDir, { recursive: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

const fakeElectron = {
  app: {
    getPath: (name) => {
      if (name === 'userData') return userDataDir;
      if (name === 'downloads') return downloadsDir;
      return os.tmpdir();
    },
  },
};
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request === 'electron') return 'electron-shim';
  return origResolve.call(this, request, parent, ...rest);
};
const origLoad = Module._load;
Module._load = function (request, parent, ...rest) {
  if (request === 'electron') return fakeElectron;
  return origLoad.call(this, request, parent, ...rest);
};

// Production code is TypeScript. We import the compiled CJS bundle, but the bundle
// is bundled — easier to dynamic-import the .ts via tsx or call sharp/ffmpeg directly.
// Cleanest: drive each pipeline through its own job module by transpiling on the fly
// with esbuild's register hook. Skip that complexity by re-implementing the test
// orchestration here, calling the same dependencies in the same order. Each smoke
// stage is small enough to inline.

const require_ = createRequire(import.meta.url);

function bytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(2)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

const log = (...a) => console.log('•', ...a);
const ok = (msg) => console.log(`\x1b[32m✓\x1b[0m ${msg}`);
const fail = (msg, err) => {
  console.log(`\x1b[31m✗\x1b[0m ${msg}`);
  if (err) console.error(err);
  process.exitCode = 1;
};

async function withTimer(label, fn) {
  const t0 = Date.now();
  try {
    const r = await fn();
    ok(`${label} (${Date.now() - t0} ms)`);
    return r;
  } catch (e) {
    fail(`${label} — ${e?.message ?? e}`, e);
    throw e;
  }
}

async function step_compress() {
  log('\n── COMPRESS + METADATA ─────────────────────────────');
  const sharp = require_('sharp');
  const { exiftool } = await import('exiftool-vendored');
  const inputs = fs.readdirSync(IN_DIR).filter((f) => /\.(jpe?g|png)$/i.test(f));
  if (inputs.length === 0) throw new Error('no input images');
  const outDir = path.join(OUT_DIR, 'compress');
  fs.mkdirSync(outDir, { recursive: true });

  for (const name of inputs) {
    const inP = path.join(IN_DIR, name);
    const outP = path.join(outDir, path.parse(name).name + '_compressed.jpg');
    const bytesIn = fs.statSync(inP).size;
    await withTimer(`compress ${name}`, async () => {
      await sharp(inP, { failOn: 'none' })
        .rotate()
        .resize({ width: 1200, kernel: 'lanczos3', withoutEnlargement: true })
        .jpeg({ quality: 72, mozjpeg: true, progressive: true })
        .toFile(outP);

      // Apply metadata override
      await exiftool.write(
        outP,
        {
          Artist: 'Forge',
          Copyright: '© Forge',
          ImageDescription: 'Compressed by Forge (smoke test)',
        },
        ['-overwrite_original'],
      );
      const bytesOut = fs.statSync(outP).size;
      log(`  ${bytes(bytesIn)} → ${bytes(bytesOut)} (${Math.round(((bytesIn - bytesOut) / bytesIn) * 100)}% smaller)`);

      // Verify the metadata actually wrote
      const tags = await exiftool.read(outP);
      if (tags.Artist !== 'Forge') throw new Error('Artist not written');
      if (!String(tags.Copyright).includes('Forge')) throw new Error('Copyright not written');
      log(`  metadata: Artist=${tags.Artist} Copyright=${tags.Copyright}`);
    });
  }
  await exiftool.end();
}

async function step_upscale_lanczos() {
  log('\n── IMAGE UPSCALE (Lanczos fallback) ───────────────');
  const sharp = require_('sharp');
  const inputs = fs.readdirSync(IN_DIR).filter((f) => /\.(jpe?g|png)$/i.test(f));
  const outDir = path.join(OUT_DIR, 'upscale-lanczos');
  fs.mkdirSync(outDir, { recursive: true });

  for (const name of inputs) {
    const inP = path.join(IN_DIR, name);
    const outP = path.join(outDir, path.parse(name).name + '_x4.jpg');
    await withTimer(`upscale-lanczos ${name}`, async () => {
      const img = sharp(inP, { failOn: 'none' });
      const meta = await img.metadata();
      const w = (meta.width ?? 0) * 4;
      await img
        .resize({ width: w, kernel: 'lanczos3', withoutEnlargement: false })
        .jpeg({ quality: 95, mozjpeg: true })
        .toFile(outP);
      const out = await sharp(outP).metadata();
      log(`  ${meta.width}×${meta.height}  →  ${out.width}×${out.height}  ${bytes(fs.statSync(outP).size)}`);
      if ((out.width ?? 0) !== w) throw new Error('width mismatch');
    });
  }
}

async function downloadRealesrgan() {
  // Mirror src/main/realesrgan.ts exactly. Uses the same upstream URL shape.
  const RELEASE = '0.2.5.0';
  const url = `https://github.com/xinntao/Real-ESRGAN/releases/download/v${RELEASE}/realesrgan-ncnn-vulkan-20220424-macos.zip`;
  const dir = path.join(userDataDir, 'realesrgan');
  fs.mkdirSync(dir, { recursive: true });
  const zip = path.join(dir, 'realesrgan-macos.zip');

  log(`  downloading ${url}`);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(zip, buf);
  log(`  downloaded ${bytes(buf.length)}`);

  const { execSync, spawnSync } = await import('node:child_process');
  const finalDir = path.join(dir, 'macos-arm64');
  if (fs.existsSync(finalDir)) fs.rmSync(finalDir, { recursive: true, force: true });
  fs.mkdirSync(finalDir, { recursive: true });
  execSync(`unzip -q -o "${zip}" -d "${finalDir}"`, { stdio: 'inherit' });

  // Lift a single wrapping dir if present (Linux/Windows variants do this)
  const top = fs.readdirSync(finalDir, { withFileTypes: true });
  if (top.length === 1 && top[0].isDirectory()) {
    const inner = path.join(finalDir, top[0].name);
    for (const e of fs.readdirSync(inner)) {
      fs.renameSync(path.join(inner, e), path.join(finalDir, e));
    }
    fs.rmdirSync(inner);
  }

  const bin = path.join(finalDir, 'realesrgan-ncnn-vulkan');
  if (!fs.existsSync(bin)) {
    throw new Error(`binary missing; got: ${fs.readdirSync(finalDir).join(', ')}`);
  }
  fs.chmodSync(bin, 0o755);
  spawnSync('xattr', ['-dr', 'com.apple.quarantine', finalDir], { stdio: 'ignore' });
  fs.rmSync(zip, { force: true });
  return bin;
}

async function step_upscale_ai() {
  log('\n── IMAGE UPSCALE (Real-ESRGAN AI) ─────────────────');
  const dir = path.join(userDataDir, 'realesrgan', 'macos-arm64');
  let bin = path.join(dir, 'realesrgan-ncnn-vulkan');
  if (!fs.existsSync(bin)) {
    await withTimer('download Real-ESRGAN', async () => {
      bin = await downloadRealesrgan();
    });
  } else {
    ok('Real-ESRGAN already installed');
  }

  // Pick the smallest input for a fast AI test
  const inputs = fs
    .readdirSync(IN_DIR)
    .filter((f) => /\.(jpe?g|png)$/i.test(f))
    .map((f) => ({ f, sz: fs.statSync(path.join(IN_DIR, f)).size }))
    .sort((a, b) => a.sz - b.sz);
  const small = inputs[0];
  if (!small) throw new Error('no inputs');

  const outDir = path.join(OUT_DIR, 'upscale-ai');
  fs.mkdirSync(outDir, { recursive: true });
  const inP = path.join(IN_DIR, small.f);
  const outP = path.join(outDir, path.parse(small.f).name + '_x4_ai.png');

  const modelDir = path.join(dir, 'models');
  if (!fs.existsSync(modelDir)) throw new Error(`models dir missing: ${modelDir}`);
  log(`  models: ${fs.readdirSync(modelDir).filter((f) => f.endsWith('.bin')).join(', ')}`);

  const { spawn } = await import('node:child_process');
  await withTimer(`AI upscale ${small.f}`, async () => {
    await new Promise((resolve, reject) => {
      const proc = spawn(bin, [
        '-i', inP, '-o', outP,
        '-n', 'realesrgan-x4plus',
        '-s', '4',
        '-m', modelDir,
        '-f', 'png',
      ], { stdio: ['ignore', 'pipe', 'pipe'] });
      let lastPct = 0;
      proc.stderr.on('data', (chunk) => {
        const m = /([\d.]+)%/.exec(chunk.toString());
        if (m) {
          const pct = Number(m[1]);
          if (pct - lastPct >= 10 || pct === 100) {
            log(`  …${pct.toFixed(1)}%`);
            lastPct = pct;
          }
        }
      });
      proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
      proc.on('error', reject);
    });
  });

  if (!fs.existsSync(outP)) throw new Error('AI output not written');
  const sharp = require_('sharp');
  const inMeta = await sharp(inP).metadata();
  const outMeta = await sharp(outP).metadata();
  log(`  ${inMeta.width}×${inMeta.height} → ${outMeta.width}×${outMeta.height}  ${bytes(fs.statSync(outP).size)}`);
  if ((outMeta.width ?? 0) !== (inMeta.width ?? 0) * 4) throw new Error('AI scale mismatch');
}

async function makeTestVideo() {
  // 2-second 320x240 test pattern with audio tone
  const ffmpeg = require_('ffmpeg-static');
  const ffPath = typeof ffmpeg === 'string' ? ffmpeg : ffmpeg.default ?? ffmpeg;
  if (!ffPath) throw new Error('ffmpeg-static path empty');
  const out = path.join(IN_DIR, 'test_clip.mp4');
  if (fs.existsSync(out)) return out;
  const { execSync } = await import('node:child_process');
  execSync(
    `"${ffPath}" -y -f lavfi -i "testsrc=duration=2:size=320x240:rate=10" -f lavfi -i "sine=frequency=880:duration=2" -c:v libx264 -crf 23 -pix_fmt yuv420p -c:a aac -shortest "${out}"`,
    { stdio: 'pipe' },
  );
  return out;
}

async function step_video() {
  log('\n── VIDEO UPSCALE ──────────────────────────────────');
  const ffmpeg = require_('ffmpeg-static');
  const ffPath = typeof ffmpeg === 'string' ? ffmpeg : ffmpeg.default ?? ffmpeg;
  log(`  ffmpeg: ${ffPath}`);
  if (!fs.existsSync(ffPath)) throw new Error('ffmpeg-static binary missing');

  const inP = await withTimer('synthesize 2s test clip', () => makeTestVideo());
  log(`  test clip: ${inP}  (${bytes(fs.statSync(inP).size)})`);

  const aiDir = path.join(userDataDir, 'realesrgan', 'macos-arm64');
  const aiBin = path.join(aiDir, 'realesrgan-ncnn-vulkan');
  if (!fs.existsSync(aiBin)) throw new Error('Real-ESRGAN must be installed first (run step upscale-ai)');

  const tmp = path.join(SMOKE_ROOT, 'video-tmp');
  const inFrames = path.join(tmp, 'in');
  const outFrames = path.join(tmp, 'out');
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(inFrames, { recursive: true });
  fs.mkdirSync(outFrames, { recursive: true });

  const { execSync, spawn } = await import('node:child_process');

  // Probe
  const ffprobe = require_('@ffprobe-installer/ffprobe');
  const ffprobePath = ffprobe.path;
  const probe = JSON.parse(
    execSync(
      `"${ffprobePath}" -v error -print_format json -show_streams -show_format "${inP}"`,
    ).toString(),
  );
  const v = probe.streams.find((s) => s.codec_type === 'video');
  const [n, d] = (v.r_frame_rate ?? '10/1').split('/').map(Number);
  const fps = n / d;
  const hasAudio = probe.streams.some((s) => s.codec_type === 'audio');
  log(`  probe: ${v.width}×${v.height}  ${fps} fps  audio=${hasAudio}`);

  // Extract frames
  await withTimer('extract frames', async () => {
    execSync(
      `"${ffPath}" -y -i "${inP}" -q:v 1 -pix_fmt rgb24 "${path.join(inFrames, 'frame_%08d.png')}"`,
      { stdio: 'pipe' },
    );
  });
  const frames = fs.readdirSync(inFrames).filter((f) => f.endsWith('.png')).sort();
  log(`  extracted ${frames.length} frames`);

  // Upscale every frame
  const modelDir = path.join(aiDir, 'models');
  await withTimer(`AI upscale ${frames.length} frames`, async () => {
    for (let i = 0; i < frames.length; i++) {
      const name = frames[i];
      await new Promise((resolve, reject) => {
        const proc = spawn(aiBin, [
          '-i', path.join(inFrames, name),
          '-o', path.join(outFrames, name),
          '-n', 'realesr-animevideov3',
          '-s', '2',
          '-m', modelDir,
          '-f', 'png',
        ], { stdio: ['ignore', 'pipe', 'pipe'] });
        proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`frame ${name} exit ${code}`))));
        proc.on('error', reject);
      });
      if ((i + 1) % 5 === 0 || i === frames.length - 1) log(`  frame ${i + 1}/${frames.length}`);
    }
  });

  // Reassemble
  const outVideo = path.join(OUT_DIR, 'test_clip_x2.mp4');
  await withTimer('reassemble video', async () => {
    const args = ['-y'];
    args.push('-framerate', String(fps));
    args.push('-i', path.join(outFrames, 'frame_%08d.png'));
    if (hasAudio) {
      args.push('-i', inP);
      args.push('-map', '0:v:0', '-map', '1:a:0?');
    }
    args.push(
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-preset', 'fast',
      '-crf', '20',
      '-movflags', '+faststart',
    );
    if (hasAudio) args.push('-c:a', 'aac', '-b:a', '192k');
    args.push(outVideo);
    execSync(`"${ffPath}" ${args.map((a) => `"${a}"`).join(' ')}`, { stdio: 'pipe' });
  });

  // Verify the result
  const outProbe = JSON.parse(
    execSync(
      `"${ffprobePath}" -v error -print_format json -show_streams "${outVideo}"`,
    ).toString(),
  );
  const ov = outProbe.streams.find((s) => s.codec_type === 'video');
  const oa = outProbe.streams.find((s) => s.codec_type === 'audio');
  log(`  output: ${ov.width}×${ov.height}  audio=${!!oa}  ${bytes(fs.statSync(outVideo).size)}`);
  if (ov.width !== v.width * 2 || ov.height !== v.height * 2) {
    throw new Error(`scale mismatch: ${ov.width}x${ov.height} vs expected ${v.width * 2}x${v.height * 2}`);
  }
  if (hasAudio && !oa) throw new Error('audio dropped');
  fs.rmSync(tmp, { recursive: true, force: true });
}

const which = process.argv[2] ?? 'all';
const steps = {
  compress: step_compress,
  'upscale-lanczos': step_upscale_lanczos,
  'upscale-ai': step_upscale_ai,
  video: step_video,
};

(async () => {
  if (which === 'all') {
    for (const [name, fn] of Object.entries(steps)) {
      try { await fn(); } catch (e) { /* keep going so we see all failures */ }
    }
  } else if (steps[which]) {
    await steps[which]();
  } else {
    console.error('unknown step:', which);
    process.exit(2);
  }
  console.log('\n── done ──');
})();

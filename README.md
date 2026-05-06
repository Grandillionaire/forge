# Forge

> Bulk media tooling. AI image upscaling, batch compression, AI video upscaling. Local-first, GPU-accelerated, MIT licensed.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Electron](https://img.shields.io/badge/Electron-42-47848F.svg)](https://www.electronjs.org/)

---

Forge is a desktop app for processing image and video files in bulk. It runs entirely on your machine — no uploads, no accounts, no per-use costs.

## What it does

- **Bulk image upscale** — drop a folder of images, get 2×/3×/4× output via [Real-ESRGAN ncnn-vulkan](https://github.com/xinntao/Real-ESRGAN) running on your local GPU (Vulkan / Metal / DirectX). Falls back to high-quality Lanczos via [Sharp](https://sharp.pixelplumbing.com/) when the AI engine isn't installed.
- **Compress and rewrite metadata** — JPEG / WebP / AVIF re-encode at any quality, optional resize. Strip all EXIF / GPS / ICC, or rewrite Artist / Copyright / Description across the whole batch.
- **Bulk video upscale** — frame-extract → AI upscale per frame → re-encode (H.264, faststart, audio preserved). MP4, MOV, MKV, WebM all supported.

Everything is parallelized. The AI engine downloads on first use (~50 MB, one-time, from the official upstream).

## Install

Download from the [latest release](https://github.com/Grandillionaire/forge/releases/latest):

| Platform | Asset |
|---|---|
| macOS Apple Silicon | `Forge-x.y.z-arm64.dmg` |
| macOS Intel | `Forge-x.y.z-x64.dmg` |
| Windows x64 | `Forge-x.y.z-x64.exe` |
| Windows ARM64 | `Forge-x.y.z-arm64.exe` |
| Linux x64 | `Forge-x.y.z-x64.AppImage` |
| Linux ARM64 | `Forge-x.y.z-arm64.AppImage` |

The app isn't code-signed. On macOS, the first launch will prompt with "cannot verify the developer" — right-click the app, choose **Open**, then confirm. On Windows, click **More info → Run anyway** in SmartScreen. After that, the app self-updates from GitHub Releases.

## Build from source

```bash
git clone https://github.com/Grandillionaire/forge.git
cd forge
npm install
npm run dev               # hot-reload dev
npm run build:mac         # produces dist/Forge-*.dmg
npm run build:win         # produces dist/Forge-*.exe
npm run build:linux       # produces dist/Forge-*.AppImage
```

## Architecture

```
┌─────────────────────────────────────────┐
│  Renderer (sandboxed, contextIsolated)  │  React + TypeScript + Vite + Tailwind
│   ↕  IPC (validated)                    │  framer-motion + lucide-react
├─────────────────────────────────────────┤
│  Main process                           │  Electron 42
│   ├─ Sharp                              │  Image read/encode/resize
│   ├─ ffmpeg-static + ffmpeg-installer  │  Video transcode
│   ├─ exiftool-vendored                  │  Metadata read/write
│   └─ realesrgan-ncnn-vulkan (sidecar)  │  AI upscaling on local GPU
└─────────────────────────────────────────┘
```

The renderer never touches the filesystem directly — everything goes through narrow, validated IPC handlers in the main process. The main process spawns external binaries with array args (no shell), and Real-ESRGAN runs as an isolated subprocess.

## Privacy & security

- **Network**: Forge only contacts GitHub (auto-update + Real-ESRGAN download). No telemetry, no analytics, no third-party SDKs. Audit `src/main/realesrgan.ts` and `src/main/updater.ts` to verify.
- **Filesystem**: only paths you select via the OS file picker (or drag-drop) are touched. Output is written to the folder you choose.
- **Sandboxed renderer**: `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`, locked-down CSP (`default-src 'self'`).
- **Code signing**: not yet (would cost $99/yr Apple Dev account). PRs that add signing infrastructure are welcome.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). TL;DR: clone, `npm install`, `npm run dev`. Bug reports and PRs both welcome.

## License

[MIT](LICENSE) — do whatever you want, no warranty.

## Credits

- [Real-ESRGAN](https://github.com/xinntao/Real-ESRGAN) — Tencent ARC Lab (BSD-3)
- [Sharp](https://sharp.pixelplumbing.com/) — Lovell Fuller (Apache 2.0)
- [ffmpeg-static](https://github.com/eugeneware/ffmpeg-static) — bundled FFmpeg builds (LGPL/GPL via FFmpeg)
- [exiftool-vendored](https://github.com/photostructure/exiftool-vendored.js) — Matthew McEachen (MIT)
- [Electron](https://www.electronjs.org/) (MIT)

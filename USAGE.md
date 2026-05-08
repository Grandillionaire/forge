<div align="center">

<picture>
  <img src="build/icon.png" width="84" alt="Forge" />
</picture>

# Forge — User Manual

**Bulk media tooling. Local. GPU-accelerated. MIT.**

[Download](https://github.com/Grandillionaire/forge/releases/latest) · [Source](https://github.com/Grandillionaire/forge) · [Issues](https://github.com/Grandillionaire/forge/issues)

</div>

---

## What Forge does

Forge is a desktop app for processing image and video files **in bulk**, entirely on your own machine. It has four tools, and you can pick whichever one matches what you're trying to do:

| Tool | Goal | Engine | Speed |
|---|---|---|---|
| **Image upscale** | Make images **bigger** and sharper | Real-ESRGAN AI on your GPU (Lanczos fallback) | Fast on GPU; slow on CPU |
| **Image compress** | Make images **smaller** + convert formats + control metadata | Sharp (libvips) | Very fast |
| **Video upscale** | Make videos **bigger** and sharper | Real-ESRGAN per frame + FFmpeg | Slow — figure minutes per second of footage |
| **Video compress** | Make videos **smaller** — downscale resolution and/or quality | FFmpeg single-pass H.264 | Fast |

Everything is **local**. No uploads, no accounts, no per-use cost. Files never leave your machine.

---

## Getting set up

### 1. Install

Download the right installer for your OS from the [latest release](https://github.com/Grandillionaire/forge/releases/latest):

| Platform | File |
|---|---|
| macOS Apple Silicon | `Forge-x.y.z-arm64.dmg` |
| macOS Intel | `Forge-x.y.z-x64.dmg` |
| Windows x64 | `Forge-x.y.z-x64.exe` |
| Windows ARM | `Forge-x.y.z-arm64.exe` |
| Linux x64 | `Forge-x.y.z-x86_64.AppImage` |
| Linux ARM | `Forge-x.y.z-arm64.AppImage` |

Open the installer, drag Forge into Applications (Mac) or run the installer (Windows/Linux).

### 2. First-launch warnings

Forge isn't paid-code-signed (no Apple Developer cert / Windows EV cert), so the OS shows a warning the first time. **The app is fine; the warnings are misleading.**

#### macOS — `"Forge is damaged and cannot be opened"`
This is Apple's misleading message for any unsigned download since Sonoma. Run once in Terminal:
```bash
xattr -dr com.apple.quarantine /Applications/Forge.app
```
Open Forge normally from then on.

#### Windows — `"Windows protected your PC"`
Click **More info → Run anyway**.

#### Linux — `.AppImage` won't execute
```bash
chmod +x Forge-*.AppImage && ./Forge-*.AppImage
```

### 3. Install the AI engine (optional, but needed for AI features)

The first time you open an AI feature (Image upscale or Video upscale), Forge offers to install **Real-ESRGAN ncnn-vulkan** — a GPU-accelerated AI upscaler. It's a one-time ~50 MB download into `~/Library/Application Support/Forge/realesrgan/` (Mac) or the equivalent on Windows/Linux.

You don't need to install it for **Image compress** or **Video compress** — those use FFmpeg + libvips which ship with Forge.

---

## How each tool works

### 🪄 Image upscale

> Make images bigger and sharper.

**The flow:**

1. **Drop images** anywhere on the window, or click the dropzone to pick from Finder
2. Pick a **scale** (2×, 3×, 4×)
3. Pick a **model** that matches your content
4. Pick an **output format** (PNG / JPG / WebP)
5. Choose an **output folder** (defaults to `~/Downloads/Forge`)
6. Click **Upscale**

**Models:**

| Model | Use for |
|---|---|
| `realesrgan-x4plus` | **Photographs**, screenshots, real-world textures |
| `realesrgan-x4plus-anime` | **Illustrations**, anime, comic art with smooth gradients |
| `realesr-animevideov3` | **Line art**, sharp-edged graphics, video frames with high contrast |

If you're not sure, start with `realesrgan-x4plus`.

**The "AI engine" toggle:**
- **On** (default): Uses Real-ESRGAN. Best quality. Requires the AI engine to be installed.
- **Off**, or AI engine not installed: Falls back to **Lanczos** — a high-quality classical resize via Sharp/libvips. Not AI, but still good for cases where the AI is overkill.

**HEIC inputs:** iPhone photos (HEIC/HEIF) are decoded automatically. You don't need to convert them first.

**Speed expectation:** On an Apple M-series Mac, a 1024×1024 image at 4× takes ~5–10 seconds with AI. CPU-only Lanczos is sub-second.

**Output naming:** `<originalname>_x<scale>.<ext>` — e.g. `vacation_x4.jpg`.

---

### 🗜️ Image compress

> Make images smaller, convert formats, control metadata.

**The flow:**

1. Drop images
2. Pick an **output format** (JPEG / WebP / AVIF / preserve)
3. Drag the **quality slider** — 1 (tiny) to 100 (pristine)
4. Optional: set a **max width** to resize before encoding
5. Choose **strip metadata** or **keep & rewrite** Artist/Copyright/Description
6. Pick an output folder
7. Click **Compress**

**Format guide:**

| Format | When to use |
|---|---|
| **JPEG** | Photos for the web. Universal compatibility. Default starting point. |
| **WebP** | Photos for modern browsers. ~25–35% smaller than JPEG at the same quality. |
| **AVIF** | The new standard. ~50% smaller than JPEG. Slow to encode, supported on most modern OSes. |
| **Preserve** | Keep the source format (e.g. PNG → PNG). HEIC inputs default to JPEG since HEIC re-encode isn't supported. |

**Quality slider — what setting to pick:**
- **90–100**: Pristine. Use when the file will be re-edited or printed.
- **70–85**: Sweet spot for the web — visually lossless, big file-size wins.
- **50–69**: Aggressive. Visible artifacts but tiny files.
- **<50**: For thumbnails or extreme size constraints only.

**iPhone HEIC → JPEG:**
1. Drop HEIC/HEIF files
2. Set output format to **JPEG**
3. Quality 85 is a good default
4. Click Compress

This is the canonical "convert iPhone photos so anyone can open them" workflow.

**Metadata:**
- **Strip all** (default): Removes EXIF, GPS, camera info, ICC profiles — useful before posting publicly. Privacy-safe.
- **Keep & rewrite**: Preserves the original metadata and lets you stamp Artist / Copyright / Description across the whole batch (e.g. add `© Your Name 2026` to every photo).

**Output naming:** `<originalname>_compressed.<ext>`.

---

### ✨ Video upscale

> Make videos bigger and sharper using AI. Heavy work.

**The flow:**

1. Drop videos (MP4, MOV, MKV, WebM, AVI, M4V)
2. Pick a **scale** (2×, 3×, 4×)
3. Pick a **model** (`animevideo-v3` for general use; `x4plus` for live-action)
4. Set **CRF** (output quality — lower = bigger and better)
5. Set **encoder preset** (`medium` is the default sweet spot)
6. Choose an output folder
7. Click **Upscale**

**Pipeline (under the hood):**
1. Probe the video (ffprobe → resolution, fps, audio detection)
2. Extract every frame to PNG via FFmpeg
3. Run each frame through Real-ESRGAN on your GPU
4. Reassemble the upscaled frames at the original framerate
5. Mux back the original audio with AAC at 192 kbps
6. Output: H.264 MP4 with `faststart` for instant playback over the network

**Speed expectations** (Apple M-series, 1080p source):

| Scale | Source length | Time (rough) |
|---|---|---|
| 2× | 30 seconds | ~5–10 minutes |
| 4× | 30 seconds | ~25–40 minutes |

This is the heaviest operation in Forge by a wide margin. It needs the AI engine installed.

**CRF guide:**
- **18**: Visually lossless. Big files.
- **22–24**: Excellent quality. Roughly the YouTube upload sweet spot.
- **26–28**: Smaller, still good. Best for compressed-feel content.

**Output naming:** `<originalname>_x<scale>.mp4`.

---

### 📼 Video compress

> Make videos smaller — downscale resolution and/or drop bitrate. No AI, just FFmpeg.

**The flow:**

1. Drop videos
2. Pick a **resolution preset**:
   - **Preserve**: keep source dimensions
   - **1080p / 720p / 480p / 360p**: cap the height; aspect ratio is preserved
3. Set **CRF** (18 = pristine, 32 = tiny)
4. Pick an **encoder preset** (`medium` is balanced)
5. Pick **audio bitrate** or `Preserve` to copy the source audio
6. Choose an output folder
7. Click **Compress**

**Critical constraint:** Resolution downscale only fires when the source is **taller** than the target. Forge never upscales here — for upscaling, use the Video upscale tool.

**Pipeline:** single-pass libx264 with `-movflags +faststart`. One FFmpeg invocation per video — orders of magnitude faster than the upscale path.

**When to use which audio setting:**

| Setting | When |
|---|---|
| `64k` | Voice-only, podcasts, screen recordings |
| `128k` | Standard videos, dialogue + light music |
| `192k` | Music videos, soundtracks |
| `256k` | Music-heavy content where audio fidelity matters |
| `Preserve` | Copy the source audio bit-for-bit (no re-encode) |

**Speed expectation:** Roughly real-time to 5× real-time on a recent Mac with `medium` preset.

**Output naming:** `<originalname>_compressed.mp4`.

**Common recipes:**
- "Shrink a 4K phone video for upload": Resolution `1080p`, CRF `24`, preset `medium`, audio `128k`
- "Tiny preview of a long film": Resolution `360p`, CRF `28`, preset `fast`, audio `64k`
- "Same dimensions, just smaller": Resolution `Preserve`, CRF `26`, preset `medium`, audio `Preserve`

---

## Things that work everywhere

### Drag-and-drop, anywhere

You can drag files from Finder/Explorer onto the **entire app window**, not just the small dropzone. Forge highlights the whole window with a glowing border when it sees a drag.

### Output folder

Defaults to `~/Downloads/Forge` on every tool, but each tool remembers your choice independently. Click **Choose** to pick a different folder; click **Open** to reveal the current one in Finder.

### Reveal in Finder

Every finished file in the queue has a **Reveal** button next to it. Click to jump to the file in Finder/Explorer.

### Cancel mid-job

While a batch is running, the **Cancel** button stops the current job cleanly. Files already finished stay finished; files in progress are aborted.

### Auto-update

Forge checks GitHub Releases on every launch. When a newer version is available, it downloads in the background and prompts you to restart on next quit. No manual re-downloading needed.

### The help triplet (top-right)

Three icons in the header, always there:

| Icon | Opens |
|---|---|
| 🤖 (Bot) | **AI Assistant** — chat panel that knows Forge inside out. Bring your own OpenAI API key. |
| 📖 (BookOpen) | **Manual** — this document, rendered in-app. |
| ❓ (HelpCircle) | **Tour** — re-opens the interactive onboarding wizard. |

### AI Assistant — bring your own key

Click the 🤖 icon. The panel slides in from the right.

**How it works:**
1. First-launch: paste your **OpenAI API key** in the field. It's stored only on your device, in localStorage.
2. Pick a model — `gpt-4o-mini` is the cheap, fast default; `gpt-4o` is smarter but ~10× more expensive.
3. Type a question. Hit Enter. Tokens stream in as the assistant responds.

**What the assistant knows:**
The system prompt embeds this entire manual plus the current tab you're on. So if you're in Image compress and ask "what should I pick?", it answers in that context.

**What you should know:**
- The assistant **sends your messages to OpenAI's servers** — not Forge's. This is the only feature that contacts a third party. Forge has no servers.
- OpenAI bills your account directly. A typical question costs ~$0.0001 with `gpt-4o-mini`.
- The key is stored unencrypted in the renderer's localStorage. If your machine is compromised, the key is too — same as any browser tool that stores keys.
- Get a key at [platform.openai.com/api-keys](https://platform.openai.com/api-keys).

**Privacy note:** every other Forge feature stays 100% local. The assistant is the lone exception, and it's opt-in by design.

---

## Supported formats

### Images (input)

`png`, `jpg/jpeg`, `webp`, `tiff/tif`, `bmp`, `avif`, **`heic/heif`** (transparently decoded via libheif)

### Images (output)

`png`, `jpg`, `webp`, `avif`

### Videos (input)

`mp4`, `mov`, `mkv`, `avi`, `webm`, `m4v`

### Videos (output)

`mp4` (H.264 + AAC, with faststart)

---

## Privacy and security

- **Network**: Forge only contacts GitHub — once on launch (auto-update check) and once on first AI-engine install (Real-ESRGAN download). No telemetry, no analytics, no third-party SDKs.
- **Filesystem**: only paths you select via dialog or drag-and-drop are touched.
- **Sandbox**: the renderer runs with `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`, locked-down CSP.
- **IPC**: every IPC handler validates inputs (path extensions, URL schemes, type shapes).
- **Subprocesses**: every `spawn` uses array args — no shell, no injection surface.
- **Open source**: all of the above is verifiable. Read the source.

For security disclosures, see [SECURITY.md](SECURITY.md).

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `"Forge is damaged"` on macOS | Run `xattr -dr com.apple.quarantine /Applications/Forge.app` |
| `"Windows protected your PC"` | Click "More info → Run anyway" |
| AI features greyed out | Click **Install AI engine** — banner at the top of the upscale tabs. ~50 MB one-time download. |
| HEIC file shows no thumbnail | Forge decodes HEIC on-demand for thumbnails — slow first time, fast after. |
| Video upscale taking forever | Expected. Use a smaller scale (2× instead of 4×), or use **Video compress** if you want a smaller file rather than a sharper one. |
| Output folder missing | Click **Open** next to the path — Forge creates the folder lazily on first run. |
| Job failed but message is unclear | Check `~/Library/Logs/Forge/main.log` (Mac) or `%APPDATA%\Forge\logs\main.log` (Windows). |

---

## Tips from heavy use

- **Process big batches overnight.** Bulk video upscale on dozens of clips can run for hours. Drop everything, set output folder, hit Upscale, walk away.
- **Use Image compress before sharing iPhone photos**, even if you don't care about size. The HEIC → JPEG conversion is the real win — recipients on Windows/Android can actually open the files.
- **Use Video compress with `Preserve` resolution + CRF 26** to lossily de-bloat any video without changing how it looks. Often halves the file size invisibly.
- **For social media**: Image compress → JPEG, quality 80, max-width 1920. Strip metadata. Done.
- **For archival**: Image compress → AVIF, quality 90. Or keep originals and let Forge make compressed copies.

---

## Building from source

If you'd rather not download a binary, or want to modify Forge:

```bash
git clone https://github.com/Grandillionaire/forge.git
cd forge
npm install
npm run dev               # hot-reload development
npm run build:mac         # produces dist/Forge-*.dmg
npm run build:win         # Windows installers
npm run build:linux       # Linux AppImage
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the rest of the workflow.

---

<div align="center">

**Forge** · MIT licensed · [github.com/Grandillionaire/forge](https://github.com/Grandillionaire/forge)

</div>

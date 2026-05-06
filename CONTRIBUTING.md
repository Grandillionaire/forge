# Contributing to Forge

Thanks for considering a contribution.

## Setup

```bash
git clone https://github.com/Grandillionaire/forge.git
cd forge
npm install
npm run dev
```

`npm run dev` starts electron-vite with HMR for the renderer and main-process restart on file change. The first launch will need to download the Real-ESRGAN sidecar (~50 MB) — there's an "Install AI engine" button in the UI when it's missing.

## Project layout

```
src/
  main/             ← Electron main process (Node)
    index.ts        ← Window creation, IPC handlers, security policy
    paths.ts        ← User-data dir resolvers
    realesrgan.ts   ← Sidecar download + spawn
    ffmpeg.ts       ← FFmpeg/ffprobe binding
    updater.ts      ← Auto-update flow
    jobs/           ← The three pipelines
      imageUpscale.ts
      imageCompress.ts
      videoUpscale.ts
  preload/          ← contextBridge surface (window.forge.*)
  renderer/src/     ← React UI
    components/     ← All UI components
      ui/           ← Reusable primitives (Button, Card, Field, ...)
    lib/            ← Hooks + small utilities
site/               ← Standalone landing page (Vercel)
scripts/smoke.mjs   ← End-to-end smoke harness for the three pipelines
.github/workflows/  ← CI release pipeline
```

## Making a change

1. Branch from `main`
2. Make your change
3. Run `npm run typecheck` — must pass
4. Run `npm run build` — must pass
5. Run a relevant smoke step from `scripts/smoke.mjs` if you touched a pipeline:
   ```bash
   node scripts/smoke.mjs compress         # image compress + metadata
   node scripts/smoke.mjs upscale-lanczos  # Sharp Lanczos fallback
   node scripts/smoke.mjs upscale-ai       # downloads ~50MB on first run
   node scripts/smoke.mjs video            # full video pipeline
   ```
6. Open a PR with a description of *why* the change matters

## Code style

- TypeScript everywhere. `strict: true` is non-negotiable.
- No unused exports, no commented-out code, no console.log left in.
- Comments explain *why* (constraints, edge cases, decisions). Don't paraphrase what the code already says.
- Tailwind for styling; new design tokens go in `tailwind.config.mjs` (the `forge.*` namespace), not as one-off colors in JSX.
- Don't add dependencies casually — for small utilities prefer inlining.

## Releasing

Tag-driven via GitHub Actions:

```bash
# bump version in package.json first, then
git tag v0.1.1
git push origin v0.1.1
```

The workflow at `.github/workflows/release.yml` builds Mac (arm64+x64), Windows (x64+arm64), and Linux (x64+arm64) installers in parallel and publishes them to the GitHub Release the tag created. Existing installs auto-update via `electron-updater`.

## Bug reports

Open an issue. Helpful info:

- Platform + arch (e.g., `macOS 14 arm64`)
- Forge version (Help / About)
- What you did, what you expected, what happened
- The relevant lines from `~/Library/Logs/Forge/main.log` (Mac) or `%USERPROFILE%\AppData\Roaming\Forge\logs\main.log` (Windows)

## Security

If you find something that looks like a security problem, please **don't** open a public issue. Email the maintainer directly via the contact info on the GitHub profile, or use GitHub Security Advisories on the repo.

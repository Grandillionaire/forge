// Reads USAGE.md from the repo root and emits a TS module so the renderer can
// import the content without Vite needing to traverse outside its root.
//
// Run automatically as `prebuild` (see package.json). Commit the generated
// output so dev mode also works without re-running the script first.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const sourcePath = resolve(repoRoot, 'USAGE.md');
const outPath = resolve(repoRoot, 'src/renderer/src/data/usageContent.ts');

const md = readFileSync(sourcePath, 'utf8');

// Strip the `<picture>` wrapping the icon — it references `build/icon.png`
// which only resolves relative to the repo root, not the renderer bundle.
// The renderer shows the wordmark separately in the modal header.
const cleaned = md
  .replace(/<picture>[\s\S]*?<\/picture>/g, '')
  // Remove any other raw HTML divs we don't need rendered (the centered
  // `<div align="center">` blocks become noise in our themed view).
  .replace(/<div[^>]*>([\s\S]*?)<\/div>/g, (_, inner) => inner)
  .trim();

const content = `// AUTO-GENERATED from /USAGE.md by scripts/embed-usage.mjs.
// Do not edit by hand — edit USAGE.md and re-run \`npm run embed:usage\`.
// The prebuild script runs this automatically before \`npm run build\`.

export const USAGE_MD = ${JSON.stringify(cleaned)};
`;

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, content);

console.log(`embed-usage: wrote ${outPath} (${content.length} bytes)`);

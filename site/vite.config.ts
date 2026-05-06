import { defineConfig } from 'vite';

// Relative base so the site works whether it's served from the root of a
// custom domain (forge.dev/) or a subpath like grandillionaire.github.io/forge/.
//
// Empty postcss config stops Vite from auto-discovering the parent project's
// postcss.config.mjs (which depends on tailwind that isn't a site dep).
export default defineConfig({
  base: './',
  css: {
    postcss: { plugins: [] },
  },
  build: {
    target: 'es2020',
    sourcemap: false,
    cssCodeSplit: false,
  },
});

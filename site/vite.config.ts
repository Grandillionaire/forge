import { defineConfig } from 'vite';

// Relative base so the site works whether it's served from the root of a
// custom domain (forge.dev/) or a subpath like grandillionaire.github.io/forge/.
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    sourcemap: false,
    cssCodeSplit: false,
  },
});

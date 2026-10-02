import react from '@astrojs/react';
import { defineConfig } from 'astro/config';
import { externalizeRapierWasm } from './src/lib/badge/rapierWasm.ts';

// Serves the Rapier physics wasm as its own file instead of inlined base64.
const rapierWasmAsset = {
  name: 'rapier-wasm-asset',
  apply: 'build',
  enforce: 'pre',
  transform(code, id) {
    if (!id.endsWith('@dimforge/rapier3d-compat/rapier.mjs')) return null;
    const out = externalizeRapierWasm(code);
    if (out === null) {
      throw new Error(
        'rapier-wasm-asset: inlined wasm not found in rapier3d-compat. Update src/lib/badge/rapierWasm.ts.',
      );
    }
    return { code: out, map: null };
  },
};

export default defineConfig({
  output: 'static',
  integrations: [react()],
  devToolbar: { enabled: false },
  build: { inlineStylesheets: 'always' },
  vite: {
    plugins: [rapierWasmAsset],
    // Pre-bundled together so a stale dev cache cannot mix React runtimes.
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react/jsx-runtime',
        'react/jsx-dev-runtime',
        'three',
        '@react-three/fiber',
        '@react-three/drei',
        '@react-three/rapier',
        'meshline',
      ],
    },
  },
});

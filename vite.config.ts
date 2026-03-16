import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('@strudel/soundfonts')) return 'strudel-soundfonts';
            if (id.includes('react') || id.includes('scheduler')) return 'react-vendor';
            return undefined;
          },
        },
      },
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@': __dirname,
      }
    }
});

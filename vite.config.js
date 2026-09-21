import { cp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: {
        index: resolve('index.html'),
        manual: resolve('manual.html'),
        mechanism: resolve('mechanism.html'),
        dataInfo: resolve('data.html'),
        contact: resolve('contact.html')
      }
    }
  },
  plugins: [{
    name: 'copy-map-data',
    async closeBundle() {
      await cp(resolve('data'), resolve('dist/data'), { recursive: true });
    }
  }]
});

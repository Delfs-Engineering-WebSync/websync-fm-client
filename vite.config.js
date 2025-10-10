import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { viteSingleFile } from 'vite-plugin-singlefile'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), viteSingleFile(), tailwindcss()],
  build: {
    // Use terser so we can control comment removal in JS
    minify: 'terser',
    terserOptions: {
      format: {
        comments: false,
      },
    },
    cssMinify: true,
    // Ensure service worker and manifest are copied to dist
    // Files in /public are automatically copied by Vite
    rollupOptions: {
      output: {
        // Don't hash service worker filename so it's always accessible at /sw.js
        assetFileNames: (assetInfo) => {
          if (assetInfo.name === 'sw.js') {
            return '[name][extname]'
          }
          return '[name]-[hash][extname]'
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})

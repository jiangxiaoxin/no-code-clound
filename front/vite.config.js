import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const frontRoot = fileURLToPath(new URL('.', import.meta.url))
const regionDir = path.resolve(frontRoot, '../shared/region')

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@region': regionDir,
    },
  },
  server: {
    fs: {
      allow: [frontRoot, regionDir],
    },
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})

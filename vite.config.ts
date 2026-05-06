import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import path from 'path'
import { electronObfuscatorPlugin } from './electron-obfuscator'

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: 'electron/main.ts',
        onstart(options) {
          options.startup()
        },
        vite: {
          build: {
            sourcemap: false,
            minify: 'terser',
            outDir: 'dist-electron/main',
            rollupOptions: {
              external: [
                'node-llama-cpp',
                '@xenova/transformers',
                'electron',
              ],
            },
          },
          plugins: [
            electronObfuscatorPlugin({
              outDir: 'dist-electron/main',
              verbose: true,
            }),
          ],
        },
      },
      {
        entry: 'electron/preload.ts',
        onstart(options) {
          options.reload()
        },
        vite: {
          build: {
            sourcemap: false,
            minify: 'terser',
            outDir: 'dist-electron/preload',
          },
          plugins: [
            electronObfuscatorPlugin({
              outDir: 'dist-electron/preload',
              verbose: true,
            }),
          ],
        },
      },
    ]),
    renderer(),
    // Obfuscate the renderer (React) output as well
    electronObfuscatorPlugin({
      outDir: 'dist',
      verbose: true,
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    sourcemap: false,
    minify: 'terser',
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        recorder: path.resolve(__dirname, 'recorder.html'),
      },
    },
  },
})

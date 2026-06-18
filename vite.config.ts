import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: 'src/main/index.ts',
        onstart(options) {
          options.startup()
        },
        vite: {
          build: {
            sourcemap: false,
            outDir: 'out/main',
            rollupOptions: {
              external: ['electron', 'node-pty', 'electron-store', 'ssh2']
            }
          }
        }
      },
      {
        entry: 'src/preload/index.ts',
        onstart(options) {
          options.reload()
        },
        vite: {
          build: {
            sourcemap: false,
            outDir: 'out/preload'
          }
        }
      }
    ]),
    renderer({
      optimizeDeps: {
        exclude: ['node-pty']
      }
    })
  ],
  build: {
    sourcemap: false
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/renderer/src')
    }
  }
})

import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { output: { format: 'cjs', entryFileNames: 'index.cjs' } } }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { output: { format: 'cjs', entryFileNames: 'index.cjs' } } }
  },
  renderer: { plugins: [vue()], server: { host: '127.0.0.1' }, build: { minify: true } }
})

import basicSsl from '@vitejs/plugin-basic-ssl'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), basicSsl()],
  resolve: {
    alias: [
      {
        find: /^@tensorflow-models\/face-detection$/,
        replacement: fileURLToPath(new URL('./src/shims/faceDetectionTfjs.ts', import.meta.url)),
      },
    ],
  },
})

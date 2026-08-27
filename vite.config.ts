import basicSsl from '@vitejs/plugin-basic-ssl'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'

function saveTargetPlugin(): Plugin {
  return {
    name: 'save-target-plugin',
    configureServer(server) {
      server.middlewares.use('/api/save-target', (req, res) => {
        if (req.method === 'POST') {
          const url = new URL(req.url ?? '', `http://${req.headers.host}`)
          const filename = url.searchParams.get('name') || 'target.mind'
          const chunks: Buffer[] = []
          req.on('data', (chunk) => chunks.push(chunk))
          req.on('end', () => {
            const buffer = Buffer.concat(chunks)
            const targetPath = path.resolve('public/targets', filename)
            fs.writeFileSync(targetPath, buffer)
            console.log(`[save-target] Saved ${filename} (${buffer.length} bytes) to ${targetPath}`)
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: true, filename, bytes: buffer.length }))
          })
        } else {
          res.writeHead(405)
          res.end('Method Not Allowed')
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), basicSsl(), saveTargetPlugin()],
})

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const rootDir = path.dirname(fileURLToPath(import.meta.url))
const testMaterialDir = path.join(rootDir, 'testmaterial')

/** Serve ./testmaterial at /testmaterial during `vite dev`. */
function serveTestMaterial(): Plugin {
  return {
    name: 'serve-testmaterial',
    configureServer(server) {
      server.middlewares.use('/testmaterial', (req, res, next) => {
        try {
          const raw = decodeURIComponent((req.url ?? '/').split('?')[0] || '/')
          const rel = raw.replace(/^[/\\]+/, '')
          const filePath = path.normalize(path.join(testMaterialDir, rel))
          if (
            rel.includes('..') ||
            !filePath.startsWith(path.normalize(testMaterialDir + path.sep)) &&
            filePath !== path.normalize(testMaterialDir)
          ) {
            res.statusCode = 403
            res.end('Forbidden')
            return
          }
          if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
            next()
            return
          }
          res.setHeader('Content-Type', 'application/pdf')
          fs.createReadStream(filePath).pipe(res)
        } catch {
          next()
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), serveTestMaterial()],
})

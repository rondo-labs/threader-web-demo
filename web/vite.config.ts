import { createReadStream, statSync } from 'node:fs'
import { join, normalize, resolve } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

const repo = fileURLToPath(new URL('..', import.meta.url))
// In production both are published next to the built app (deploy/build-data.sh).
const SITE_DATA = process.env.THREADER_SITE_DATA ?? resolve(repo, 'site-data')
const MEDIA = process.env.THREADER_MEDIA_DIR ?? resolve(repo, 'media')
const TYPES: Record<string, string> = { '.json': 'application/json; charset=utf-8', '.mp4': 'video/mp4' }

/** Serves /data/* from site-data/ and /media/* from media/ in dev, with Range requests so the video can seek. */
function siteFiles(): Plugin {
  const serve = (root: string) => (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const path = normalize(decodeURIComponent((req.url ?? '/').split('?')[0]))
    const file = join(root, path)
    if (!file.startsWith(root)) return next()
    let size: number
    try {
      const st = statSync(file)
      if (!st.isFile()) return next()
      size = st.size
    } catch {
      res.statusCode = 404
      return res.end()
    }
    res.setHeader('Content-Type', TYPES[file.slice(file.lastIndexOf('.'))] ?? 'application/octet-stream')
    res.setHeader('Accept-Ranges', 'bytes')
    const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? '')
    if (range) {
      const start = range[1] ? Number(range[1]) : size - Number(range[2])
      const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1
      res.statusCode = 206
      res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`)
      res.setHeader('Content-Length', end - start + 1)
      createReadStream(file, { start, end }).pipe(res)
    } else {
      res.setHeader('Content-Length', size)
      createReadStream(file).pipe(res)
    }
  }
  return {
    name: 'threader-site-files',
    configureServer(server) {
      server.middlewares.use('/data', serve(SITE_DATA))
      server.middlewares.use('/media', serve(MEDIA))
    },
  }
}

export default defineConfig(({ command }) => ({
  plugins: [react(), siteFiles()],
  // 5173 is usually taken by threader-desktop's dev server on this machine.
  server: { port: 5180 },
  // public/ only holds the prototype's local data and video link; the build must not copy them.
  publicDir: command === 'serve' ? 'public' : false,
  build: { rollupOptions: { input: fileURLToPath(new URL('./index.html', import.meta.url)) } },
}))

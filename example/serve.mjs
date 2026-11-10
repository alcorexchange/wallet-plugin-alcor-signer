// A partner page for trying the plugin against the dev Signer:
//
//   yarn example   →   https://localhost:4000
//
// The dev Signer (alcor-signer: `yarn dev`) answers this origin as a partner.
// Cert: mkcert -cert-file .certs/localhost.pem -key-file .certs/localhost-key.pem localhost

import { createServer } from 'node:https'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { build } from 'esbuild'

const ROOT = new URL('./', import.meta.url).pathname
const PORT = 4000
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' }

await build({
  entryPoints: [join(ROOT, 'main.ts')],
  outfile: join(ROOT, 'dist/main.js'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  sourcemap: true,
  logLevel: 'warning',
})

const cert = await readFile(new URL('../.certs/localhost.pem', import.meta.url))
const key = await readFile(new URL('../.certs/localhost-key.pem', import.meta.url))

createServer({ cert, key }, async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'https://localhost').pathname)
  const file = join(ROOT, normalize(path === '/' ? '/index.html' : path))
  if (!file.startsWith(ROOT)) return res.writeHead(403).end('forbidden')

  try {
    const body = await readFile(file)
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' })
    res.end(body)
  } catch {
    res.writeHead(404).end('not found')
  }
}).listen(PORT, () => console.log(`example → https://localhost:${PORT}`))

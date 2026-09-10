/**
 * Sale con código 0 si hay que recompilar el frontend, 1 si dist está al día.
 * Compara la fecha de frontend/dist/index.html con archivos de src y configs.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const distIndex = path.join(root, 'frontend', 'dist', 'index.html')

function mtime(p) {
  try {
    return fs.statSync(p).mtimeMs
  } catch {
    return 0
  }
}

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc
  for (const name of fs.readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue
    const full = path.join(dir, name)
    let st
    try {
      st = fs.statSync(full)
    } catch {
      continue
    }
    if (st.isDirectory()) walk(full, acc)
    else if (/\.(jsx?|tsx?|css|html|json)$/i.test(name)) acc.push(full)
  }
  return acc
}

if (!fs.existsSync(distIndex)) {
  process.exit(0)
}

const distTime = mtime(distIndex)
const watch = [
  ...walk(path.join(root, 'frontend', 'src')),
  path.join(root, 'frontend', 'index.html'),
  path.join(root, 'frontend', 'package.json'),
  path.join(root, 'frontend', 'vite.config.js'),
  path.join(root, 'frontend', 'tailwind.config.js'),
  path.join(root, 'frontend', 'postcss.config.js')
]

const newest = watch.reduce((max, f) => Math.max(max, mtime(f)), 0)
process.exit(newest > distTime + 1000 ? 0 : 1)

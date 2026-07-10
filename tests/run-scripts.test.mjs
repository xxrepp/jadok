import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

test('npm run dev starts both the API server and Vite frontend', () => {
  assert.equal(pkg.scripts.dev, 'node scripts/dev.mjs')
  assert.ok(existsSync(new URL('../scripts/dev.mjs', import.meta.url)))
})

test('npm run preview uses the Express app instead of Vite-only preview', () => {
  assert.equal(pkg.scripts.preview, 'npm run build && npm run start')
  assert.equal(pkg.scripts.start, 'node server/index.mjs')
})

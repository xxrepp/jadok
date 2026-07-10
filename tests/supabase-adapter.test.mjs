import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

async function loadModule(entryPath) {
  const p = typeof entryPath === 'string' ? entryPath : entryPath.pathname
  const source = readFileSync(p, 'utf8')
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 },
  }).outputText
  return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)
}

const modulePromise = loadModule(new URL('../src/lib/supabase.ts', import.meta.url))

test('buildApiUrl joins API base and RPC path without dropping /api', async () => {
  const { buildApiUrl } = await modulePromise

  assert.equal(buildApiUrl('/api', '/rpc/copy_template_zones'), '/api/rpc/copy_template_zones')
  assert.equal(buildApiUrl('/api/', '/rpc/copy_template_zones'), '/api/rpc/copy_template_zones')
  assert.equal(buildApiUrl('http://localhost:8787/api', '/rpc/copy_template_zones'), 'http://localhost:8787/api/rpc/copy_template_zones')
})

test('parseApiResponse reports HTML responses as API routing errors instead of raw JSON parse failures', async () => {
  const { parseApiResponse } = await modulePromise
  const response = new Response('<!DOCTYPE html><html></html>', {
    status: 200,
    headers: { 'content-type': 'text/html' },
  })

  await assert.rejects(
    parseApiResponse(response, '/api/rpc/copy_template_zones'),
    /Expected JSON from API endpoint \/api\/rpc\/copy_template_zones, but received HTML/
  )
})

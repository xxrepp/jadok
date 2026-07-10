import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

async function loadModule(path) {
  const source = readFileSync(path, 'utf8')
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 },
  }).outputText
  return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)
}

const modulePromise = loadModule(new URL('../src/utils/templateZoneFonts.ts', import.meta.url))

test('template zone font choices include Glacial Indifference for HUMAS editor text', async () => {
  const { TEMPLATE_ZONE_FONTS, DEFAULT_TEMPLATE_ZONE_FONT } = await modulePromise

  assert.ok(TEMPLATE_ZONE_FONTS.includes('Glacial Indifference'))
  assert.equal(DEFAULT_TEMPLATE_ZONE_FONT, 'Glacial Indifference')
  assert.equal(new Set(TEMPLATE_ZONE_FONTS).size, TEMPLATE_ZONE_FONTS.length)
})

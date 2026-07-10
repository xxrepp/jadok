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

const modulePromise = loadModule(new URL('../src/utils/templateZoneEditing.ts', import.meta.url))

const baseZones = [
  {
    id: 1,
    template_id: 10,
    department_id: 7,
    pos_x: 12,
    pos_y: 24,
    width: 300,
    height: 80,
    font_color: '#00715f',
    font_size: 32,
    font_family: 'Glacial Indifference',
    text_align: 'center',
    zone_type: 'schedule',
    custom_text: null,
    schedule_layout: 'pr-card',
  },
  {
    id: 2,
    template_id: 10,
    department_id: null,
    pos_x: 40,
    pos_y: 10,
    width: 220,
    height: 50,
    font_color: '#111111',
    font_size: 20,
    font_family: 'Arial',
    text_align: 'right',
    zone_type: 'date',
    custom_text: null,
    schedule_layout: null,
  },
]

test('ctrl-click toggles multi-zone selection while normal click selects one zone', async () => {
  const { getNextSelectedZoneIds } = await modulePromise

  assert.deepEqual(getNextSelectedZoneIds([], 1, false), [1])
  assert.deepEqual(getNextSelectedZoneIds([1], 2, true), [1, 2])
  assert.deepEqual(getNextSelectedZoneIds([1, 2], 1, true), [2])
  assert.deepEqual(getNextSelectedZoneIds([1, 2], 2, false), [2])
})

test('arrow keys move every selected zone with shift accelerated steps', async () => {
  const { moveSelectedZones } = await modulePromise

  const moved = moveSelectedZones(baseZones, [1, 2], 'ArrowRight', false)
  assert.equal(moved[0].pos_x, 13)
  assert.equal(moved[1].pos_x, 41)

  const shifted = moveSelectedZones(baseZones, [1], 'ArrowUp', true)
  assert.equal(shifted[0].pos_y, 14)
  assert.equal(shifted[1].pos_y, 10)
})

test('bulk dragging preserves each selected zone relative offset', async () => {
  const { moveSelectedZonesByDrag } = await modulePromise

  const moved = moveSelectedZonesByDrag(baseZones, [1, 2], 1, baseZones, 25, -10, false)

  assert.deepEqual(moved.map(zone => [zone.id, zone.pos_x, zone.pos_y]), [
    [1, 37, 14],
    [2, 65, 0],
  ])
})

test('bulk style and schedule layout updates only selected zones', async () => {
  const { applyBulkZoneUpdates } = await modulePromise

  const updated = applyBulkZoneUpdates(baseZones, [1, 2], {
    font_family: 'Glacial Indifference',
    font_size: 28,
    font_color: '#abcdef',
    text_align: 'justify',
    schedule_layout: 'pr-list',
  })

  assert.deepEqual(updated.map(zone => [zone.font_family, zone.font_size, zone.font_color, zone.text_align, zone.schedule_layout]), [
    ['Glacial Indifference', 28, '#abcdef', 'justify', 'pr-list'],
    ['Glacial Indifference', 28, '#abcdef', 'justify', 'pr-list'],
  ])
})

test('undo and redo return immutable zone snapshots', async () => {
  const { commitZoneHistory, undoZoneHistory, redoZoneHistory } = await modulePromise

  const first = commitZoneHistory({ past: [], present: baseZones, future: [] }, [{ ...baseZones[0], pos_x: 99 }, baseZones[1]])
  const second = commitZoneHistory(first, [{ ...first.present[0], pos_x: 101 }, first.present[1]])

  const undone = undoZoneHistory(second)
  assert.equal(undone.present[0].pos_x, 99)
  assert.equal(undone.future.length, 1)

  const redone = redoZoneHistory(undone)
  assert.equal(redone.present[0].pos_x, 101)
  assert.equal(redone.past.length, 2)
})

test('copy/paste payloads preserve visual styling and offset pasted zones inside the same template', async () => {
  const { createPastedZonePayloads } = await modulePromise

  const payloads = createPastedZonePayloads(baseZones, [1, 2], 10)

  assert.equal(payloads.length, 2)
  assert.deepEqual(payloads[0], {
    template_id: 10,
    department_id: 7,
    pos_x: 32,
    pos_y: 44,
    width: 300,
    height: 80,
    font_color: '#00715f',
    font_size: 32,
    font_family: 'Glacial Indifference',
    text_align: 'center',
    zone_type: 'schedule',
    custom_text: null,
    schedule_layout: 'pr-card',
  })
  assert.equal(payloads[1].font_family, 'Arial')
  assert.equal(payloads[1].text_align, 'right')
})

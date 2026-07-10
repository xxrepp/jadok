import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

async function loadModule(entryPath) {
  const p = typeof entryPath === 'string' ? entryPath : entryPath.pathname
  const source = readFileSync(p, 'utf8')
  const dir = p.replace(/[^/]+$/, '')
  // Inline relative imports as data URIs since Node cannot resolve them from a data:-URL.
  const inlined = source.replace(/from\s+'(\.[^']+)'/g, (match, spec) => {
    const depPath = spec.endsWith('.ts') ? dir + spec : dir + spec + '.ts'
    const depSource = readFileSync(depPath, 'utf8')
    const depJs = ts.transpileModule(depSource, {
      compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 },
    }).outputText
    return `from 'data:text/javascript;base64,${Buffer.from(depJs).toString('base64')}'`
  })
  const js = ts.transpileModule(inlined, {
    compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 },
  }).outputText
  return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)
}

const modulePromise = loadModule(new URL('../src/utils/templateZoneRendering.ts', import.meta.url))

test('snapValueToGrid snaps to nearest grid step only when enabled', async () => {
  const { snapValueToGrid } = await modulePromise

  assert.equal(snapValueToGrid(54, 10, true), 50)
  assert.equal(snapValueToGrid(56, 10, true), 60)
  assert.equal(snapValueToGrid(56, 5, true), 55)
  assert.equal(snapValueToGrid(56, 10, false), 56)
})

test('getZoneLines renders real schedule rows filtered by department', async () => {
  const { getZoneLines } = await modulePromise
  const zone = { zone_type: 'schedule', department_id: 2 }
  const schedules = [
    { start_time: '08:00:00', end_time: '12:00:00', doctors: { name: 'Dr. A', department_id: 2 } },
    { start_time: '13:00:00', end_time: '16:00:00', doctors: { name: 'Dr. B', department_id: 3 } },
    { start_time: '17:00', end_time: '18:00', doctors: { name: 'Dr. C', department_id: 2 } },
  ]

  assert.deepEqual(getZoneLines(zone, schedules, '2026-05-30', () => 'ignored'), [
    'Dr. A (08:00 - 12:00)',
    'Dr. C (17:00 - 18:00)',
  ])
})

test('getZoneLines renders date zones in uppercase and custom text zones consistently', async () => {
  const { getZoneLines } = await modulePromise

  assert.deepEqual(getZoneLines({ zone_type: 'date' }, [], '2026-05-30', date => `Sabtu, 30 Mei 2026`), ['SABTU, 30 MEI 2026'])
  assert.deepEqual(getZoneLines({ zone_type: 'text', custom_text: 'Footer' }, [], '2026-05-30', () => ''), ['Footer'])
})

test('getCurrentExportDate falls back to the current local date when no export date is selected', async () => {
  const { getCurrentExportDate } = await modulePromise

  assert.equal(getCurrentExportDate(() => '2026-01-15'), '2026-01-15')
})

test('getCurrentExportDate preserves the user-selected export date for previous-date exports', async () => {
  const { getCurrentExportDate } = await modulePromise

  assert.equal(getCurrentExportDate(() => '2026-02-01', '2026-01-31'), '2026-01-31')
})


test('buildScheduleLayoutItems supports PR vertical card layout for one and two doctors', async () => {
  const { buildScheduleLayoutItems } = await modulePromise
  const zone = { zone_type: 'schedule', department_id: 2, width: 900, height: 120, font_size: 32, schedule_layout: 'pr-card' }
  const schedules = [
    { start_time: '08:00:00', end_time: '12:00:00', doctors: { name: 'dr. Andi Sasmita', department_id: 2 } },
    { start_time: '13:00:00', end_time: '15:00:00', doctors: { name: 'dr. Nunik Yuniati', department_id: 2 } },
  ]

  assert.deepEqual(buildScheduleLayoutItems(zone, schedules).map(item => ({ time: item.time, name: item.name, xRatio: item.xRatio, align: item.align })), [
    { time: '08.00 - 12.00', name: 'dr. Andi Sasmita', xRatio: 0.25, align: 'center' },
    { time: '13.00 - 15.00', name: 'dr. Nunik Yuniati', xRatio: 0.75, align: 'center' },
  ])

  assert.deepEqual(buildScheduleLayoutItems(zone, schedules.slice(0, 1)).map(item => ({ xRatio: item.xRatio, align: item.align })), [
    { xRatio: 0.5, align: 'center' },
  ])
})

test('buildScheduleLayoutItems respects schedule zone text alignment in PR vertical card layout', async () => {
  const { buildScheduleLayoutItems } = await modulePromise
  const schedules = [
    { start_time: '08:00:00', end_time: '12:00:00', doctors: { name: 'dr. Andi Sasmita', department_id: 2 } },
  ]

  assert.deepEqual(buildScheduleLayoutItems({ zone_type: 'schedule', department_id: 2, width: 900, height: 120, font_size: 32, schedule_layout: 'pr-card', text_align: 'left' }, schedules).map(item => ({ xRatio: item.xRatio, align: item.align })), [
    { xRatio: 0, align: 'left' },
  ])
  assert.deepEqual(buildScheduleLayoutItems({ zone_type: 'schedule', department_id: 2, width: 900, height: 120, font_size: 32, schedule_layout: 'pr-card', text_align: 'right' }, schedules).map(item => ({ xRatio: item.xRatio, align: item.align })), [
    { xRatio: 1, align: 'right' },
  ])
})

test('buildScheduleLayoutItems makes doctor names readable and wraps long two-doctor names', async () => {
  const { buildScheduleLayoutItems } = await modulePromise
  const zone = { zone_type: 'schedule', department_id: 2, width: 900, height: 120, font_size: 32, schedule_layout: 'pr-card' }
  const schedules = [
    { start_time: '08:00:00', end_time: '11:00:00', doctors: { name: 'dr. Endrianus Jaya Putra, Sp.OG', department_id: 2 } },
    { start_time: '08:00:00', end_time: '11:00:00', doctors: { name: 'dr. Siti Hardianti Harahap, Sp.OG', department_id: 2 } },
  ]

  const items = buildScheduleLayoutItems(zone, schedules)
  assert.ok(items.every(item => item.nameFontScale >= 0.88), 'doctor name should not be tiny compared with time')
  assert.ok(items.every(item => item.lineGapRatio >= 0.9), 'wrapped names need vertical space below the time')
  assert.deepEqual(items.map(item => item.nameLines), [
    ['dr. Endrianus Jaya', 'Putra, Sp.OG'],
    ['dr. Siti Hardianti', 'Harahap, Sp.OG'],
  ])
})

test('buildScheduleLayoutItems wraps dr Satria safely in a two-doctor card and fits by longest rendered line', async () => {
  const { buildScheduleLayoutItems } = await modulePromise
  const zone = { zone_type: 'schedule', department_id: 2, width: 900, height: 120, font_size: 32, schedule_layout: 'pr-card' }
  const schedules = [
    { start_time: '08:00:00', end_time: '12:00:00', doctors: { name: 'dr. M. Satria Yudha Pratama, Sp.PD', department_id: 2 } },
    { start_time: '13:00:00', end_time: '16:00:00', doctors: { name: 'dr. PDL 2', department_id: 2 } },
  ]

  const [satria] = buildScheduleLayoutItems(zone, schedules)
  assert.deepEqual(satria.nameLines, ['dr. M. Satria Yudha', 'Pratama, Sp.PD'])
  assert.equal(satria.nameFitText, 'dr. M. Satria Yudha')
  assert.equal(satria.timeFontScale, 0.94)
  assert.ok(satria.lineGapRatio >= 0.9)
})

test('buildScheduleLayoutItems keeps one long doctor name on one centered line with wider space', async () => {
  const { buildScheduleLayoutItems } = await modulePromise
  const zone = { zone_type: 'schedule', department_id: 2, width: 900, height: 120, font_size: 32, schedule_layout: 'pr-card' }
  const schedules = [
    { start_time: '08:00:00', end_time: '11:00:00', doctors: { name: 'dr. M. Satria Yudha Pratama, Sp.PD', department_id: 2 } },
  ]

  const [item] = buildScheduleLayoutItems(zone, schedules)
  assert.equal(item.columnWidthRatio, 0.92)
  assert.deepEqual(item.nameLines, ['dr. M. Satria Yudha Pratama, Sp.PD'])
})

test('getZoneTextStyle adds breathing room for uppercase date zones', async () => {
  const { getZoneTextStyle } = await modulePromise

  assert.deepEqual(getZoneTextStyle({ zone_type: 'date' }), {
    fontWeight: '700',
    lineHeightRatio: 1.75,
    letterSpacingEm: 0.08,
  })
})

test('buildScheduleLayoutItems supports PR horizontal list layout with aligned time and name columns', async () => {
  const { buildScheduleLayoutItems } = await modulePromise
  const zone = { zone_type: 'schedule', department_id: 2, width: 1000, height: 150, font_size: 34, schedule_layout: 'pr-list' }
  const schedules = [
    { start_time: '08:00:00', end_time: '12:00:00', doctors: { name: 'dr. Andi Sasmita', department_id: 2 } },
    { start_time: '13:00:00', end_time: '15:00:00', doctors: { name: 'dr. Nunik Yuniati', department_id: 2 } },
  ]

  assert.deepEqual(buildScheduleLayoutItems(zone, schedules).map(item => ({ time: item.time, name: item.name, timeXRatio: item.timeXRatio, nameXRatio: item.nameXRatio, align: item.align })), [
    { time: '08.00 - 12.00', name: 'dr. Andi Sasmita', timeXRatio: 0.06, nameXRatio: 0.38, align: 'left' },
    { time: '13.00 - 15.00', name: 'dr. Nunik Yuniati', timeXRatio: 0.06, nameXRatio: 0.38, align: 'left' },
  ])
})

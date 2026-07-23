import express from 'express'
import multer from 'multer'
import bcrypt from 'bcryptjs'
import { nanoid } from 'nanoid'
import fs from 'node:fs'
import path from 'node:path'

const TABLES = new Set(['profiles', 'departments', 'doctors', 'schedules', 'templates', 'template_zones'])
const TABLE_ALIASES = { profiles: 'users' }
const TABLE_PRIMARY_KEYS = {
  profiles: 'id',
  departments: 'id',
  doctors: 'id',
  schedules: 'id',
  templates: 'id',
  template_zones: 'id',
}
const PUBLIC_READ_TABLES = new Set(['departments', 'doctors', 'schedules', 'templates', 'template_zones'])

function tableName(table) {
  return TABLE_ALIASES[table] ?? table
}

function publicUsernameFor(row) {
  if (row?.username) return row.username
  const email = String(row?.email || '')
  return email.includes('@') ? email.split('@')[0].toLowerCase() : null
}

function toPublicUser(row) {
  if (!row) return null
  return {
    id: row.id,
    email: null,
    username: publicUsernameFor(row),
    role: row.role,
  }
}

function normalizeUsername(username) {
  return String(username || '').trim().toLowerCase()
}

function internalEmailForUsername(username) {
  return `${normalizeUsername(username)}@jadok.local`
}

function sessionFor(token, user) {
  return {
    access_token: token,
    token_type: 'bearer',
    user: toPublicUser(user),
  }
}

function pickAllowed(table, payload) {
  const allowed = {
    profiles: ['username', 'role'],
    departments: ['name'],
    doctors: ['name', 'department_id'],
    schedules: ['doctor_id', 'date', 'start_time', 'end_time', 'created_by'],
    templates: ['name', 'background_image_url', 'is_active', 'is_archived', 'created_at', 'created_by'],
    template_zones: ['template_id', 'department_id', 'pos_x', 'pos_y', 'font_color', 'font_size', 'width', 'height', 'font_family', 'text_align', 'zone_type', 'custom_text', 'schedule_layout'],
  }[table]

  const out = {}
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) out[key] = payload[key]
  }
  return out
}

function normalizeRow(table, row) {
  if (!row) return row
  if (table === 'templates') {
    return {
      ...row,
      is_active: row.is_active == null ? row.is_active : Boolean(row.is_active),
      is_archived: row.is_archived == null ? row.is_archived : Boolean(row.is_archived),
    }
  }
  if (table === 'profiles') return toPublicUser(row)
  return row
}

function applyFilters(sql, params, query, tableAlias = '') {
  const prefix = tableAlias ? `${tableAlias}.` : ''
  for (const [key, value] of Object.entries(query)) {
    if (key.startsWith('eq_')) {
      const column = key.slice(3)
      sql.where.push(`${prefix}${column} = ?`)
      params.push(value)
    }
  }
}

function orderClause(query, defaultOrder = '') {
  if (!query.order) return defaultOrder
  const col = String(query.order).replace(/[^a-zA-Z0-9_]/g, '')
  const ascending = query.ascending === 'false' ? 'DESC' : 'ASC'
  return col ? ` ORDER BY ${col} ${ascending}` : defaultOrder
}

function listRows(db, table, query = {}) {
  if (table === 'doctors' && String(query.select || '').includes('departments')) {
    const parts = { where: [] }
    const params = []
    applyFilters(parts, params, query, 'doctors')
    const where = parts.where.length ? ` WHERE ${parts.where.join(' AND ')}` : ''
    const order = query.order ? ` ORDER BY doctors.${String(query.order).replace(/[^a-zA-Z0-9_]/g, '')} ${query.ascending === 'false' ? 'DESC' : 'ASC'}` : ' ORDER BY doctors.name ASC'
    const rows = db.prepare(`
      SELECT doctors.*, departments.id as department__id, departments.name as department__name
      FROM doctors
      LEFT JOIN departments ON departments.id = doctors.department_id
      ${where}${order}
    `).all(...params)
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      department_id: row.department_id,
      departments: row.department__id ? { id: row.department__id, name: row.department__name } : null,
    }))
  }

  if (table === 'schedules' && String(query.select || '').includes('doctors')) {
    const parts = { where: [] }
    const params = []
    applyFilters(parts, params, query, 'schedules')
    const where = parts.where.length ? ` WHERE ${parts.where.join(' AND ')}` : ''
    const order = query.order ? ` ORDER BY schedules.${String(query.order).replace(/[^a-zA-Z0-9_]/g, '')} ${query.ascending === 'false' ? 'DESC' : 'ASC'}` : ' ORDER BY schedules.start_time ASC'
    const rows = db.prepare(`
      SELECT schedules.*, doctors.name as doctor__name, doctors.department_id as doctor__department_id,
             departments.id as department__id, departments.name as department__name
      FROM schedules
      LEFT JOIN doctors ON doctors.id = schedules.doctor_id
      LEFT JOIN departments ON departments.id = doctors.department_id
      ${where}${order}
    `).all(...params)
    return rows.map((row) => ({
      id: row.id,
      doctor_id: row.doctor_id,
      date: row.date,
      start_time: row.start_time,
      end_time: row.end_time,
      created_by: row.created_by,
      doctors: row.doctor_id ? {
        id: row.doctor_id,
        name: row.doctor__name,
        department_id: row.doctor__department_id,
        departments: row.department__id ? { id: row.department__id, name: row.department__name } : null,
      } : null,
    }))
  }

  const physical = tableName(table)
  const parts = { where: [] }
  const params = []
  applyFilters(parts, params, query)
  const where = parts.where.length ? ` WHERE ${parts.where.join(' AND ')}` : ''
  const order = orderClause(query)
  const rows = db.prepare(`SELECT * FROM ${physical}${where}${order}`).all(...params)
  return rows.map((row) => normalizeRow(table, row))
}

function createRow(db, table, payload, user) {
  const physical = tableName(table)
  const data = pickAllowed(table, payload)
  if (table === 'schedules' && !data.created_by && user) data.created_by = user.id
  if (table === 'templates' && !data.created_by && user) data.created_by = user.id
  if (table === 'templates') {
    if ('is_active' in data) data.is_active = data.is_active ? 1 : 0
    if ('is_archived' in data) data.is_archived = data.is_archived ? 1 : 0
  }
  const keys = Object.keys(data)
  if (keys.length === 0) throw Object.assign(new Error('No writable fields provided'), { status: 400 })
  const placeholders = keys.map(() => '?').join(', ')
  const result = db.prepare(`INSERT INTO ${physical} (${keys.join(', ')}) VALUES (${placeholders})`).run(...keys.map((k) => data[k]))
  const pk = TABLE_PRIMARY_KEYS[table]
  const id = table === 'profiles' ? data.id : result.lastInsertRowid
  return normalizeRow(table, db.prepare(`SELECT * FROM ${physical} WHERE ${pk} = ?`).get(id))
}

function updateRows(db, table, payload, filters) {
  const physical = tableName(table)
  const data = pickAllowed(table, payload)
  if (table === 'templates') {
    if ('is_active' in data) data.is_active = data.is_active ? 1 : 0
    if ('is_archived' in data) data.is_archived = data.is_archived ? 1 : 0
  }
  const keys = Object.keys(data)
  if (keys.length === 0) throw Object.assign(new Error('No writable fields provided'), { status: 400 })
  const whereParts = []
  const params = keys.map((k) => data[k])
  for (const [key, value] of Object.entries(filters)) {
    if (key.startsWith('eq_')) {
      whereParts.push(`${key.slice(3)} = ?`)
      params.push(value)
    }
  }
  if (!whereParts.length) throw Object.assign(new Error('Update requires at least one eq_ filter'), { status: 400 })
  db.prepare(`UPDATE ${physical} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE ${whereParts.join(' AND ')}`).run(...params)
  return listRows(db, table, filters)
}

function deleteRows(db, table, filters) {
  const physical = tableName(table)
  const whereParts = []
  const params = []
  for (const [key, value] of Object.entries(filters)) {
    if (key.startsWith('eq_')) {
      whereParts.push(`${key.slice(3)} = ?`)
      params.push(value)
    }
  }
  if (!whereParts.length) throw Object.assign(new Error('Delete requires at least one eq_ filter'), { status: 400 })
  db.prepare(`DELETE FROM ${physical} WHERE ${whereParts.join(' AND ')}`).run(...params)
  return []
}

function copyTemplateZones(db, sourceTemplateId, targetTemplateId, { replaceExisting = false } = {}) {
  const sourceId = Number(sourceTemplateId)
  const targetId = Number(targetTemplateId)
  if (!Number.isInteger(sourceId) || !Number.isInteger(targetId)) {
    throw Object.assign(new Error('source_template_id and target_template_id are required'), { status: 400 })
  }
  if (sourceId === targetId) {
    throw Object.assign(new Error('Cannot copy zones into the same template'), { status: 400 })
  }

  const sourceTemplate = db.prepare('SELECT id FROM templates WHERE id = ?').get(sourceId)
  const targetTemplate = db.prepare('SELECT id FROM templates WHERE id = ?').get(targetId)
  if (!sourceTemplate || !targetTemplate) {
    throw Object.assign(new Error('Source or target template not found'), { status: 404 })
  }

  const sourceZones = db.prepare('SELECT * FROM template_zones WHERE template_id = ? ORDER BY id ASC').all(sourceId)
  const insert = db.prepare(`
    INSERT INTO template_zones (
      template_id, department_id, pos_x, pos_y, font_color, font_size, width, height,
      font_family, text_align, zone_type, custom_text, schedule_layout
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const deleteTargetZones = db.prepare('DELETE FROM template_zones WHERE template_id = ?')

  const copiedRows = db.transaction(() => {
    if (replaceExisting) deleteTargetZones.run(targetId)
    const rows = []
    for (const zone of sourceZones) {
      const result = insert.run(
        targetId,
        zone.department_id,
        zone.pos_x,
        zone.pos_y,
        zone.font_color,
        zone.font_size,
        zone.width,
        zone.height,
        zone.font_family,
        zone.text_align,
        zone.zone_type,
        zone.custom_text,
        zone.schedule_layout,
      )
      rows.push(db.prepare('SELECT * FROM template_zones WHERE id = ?').get(result.lastInsertRowid))
    }
    return rows
  })()

  return { count: copiedRows.length, zones: copiedRows }
}

export function createApp({ db, uploadDir = path.resolve('uploads'), staticDir = null }) {
  const app = express()
  const sessions = new Map()
  fs.mkdirSync(uploadDir, { recursive: true })

  const MAX_UPLOAD_BYTES = 25 * 1024 * 1024

  const upload = multer({
    dest: uploadDir,
    limits: { fileSize: MAX_UPLOAD_BYTES },
    fileFilter(_req, file, cb) {
      if (!file.mimetype.startsWith('image/')) cb(new Error('Only image uploads are allowed'))
      else cb(null, true)
    },
  })

  app.use(express.json())
  app.use('/uploads', express.static(uploadDir))

  function requireAuth(req, res, next) {
    const auth = req.get('Authorization') || ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
    const userId = token ? sessions.get(token) : null
    if (!userId) return res.status(401).json({ error: 'Unauthorized' })
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId)
    if (!user) return res.status(401).json({ error: 'Unauthorized' })
    req.user = user
    next()
  }

  function requireRole(...roles) {
    return (req, res, next) => {
      if (!roles.includes(req.user?.role)) return res.status(403).json({ error: 'Forbidden' })
      next()
    }
  }

  app.get('/api/health', (_req, res) => res.json({ ok: true }))

  app.post('/api/bootstrap-admin', async (req, res, next) => {
    try {
      const existing = db.prepare('SELECT COUNT(*) as count FROM users').get().count
      if (existing > 0) return res.status(409).json({ error: 'Bootstrap is only allowed when no users exist' })
      const { password } = req.body
      const username = normalizeUsername(req.body.username)
      if (!username || !password || password.length < 6) return res.status(400).json({ error: 'Username and password length >= 6 required' })
      const passwordHash = await bcrypt.hash(password, 10)
      const id = nanoid()
      db.prepare('INSERT INTO users (id, email, password_hash, username, role) VALUES (?, ?, ?, ?, ?)')
        .run(id, internalEmailForUsername(username), passwordHash, username, 'HUMAS')
      res.status(201).json(toPublicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id)))
    } catch (error) { next(error) }
  })

  app.post('/api/auth/login', async (req, res, next) => {
    try {
      const { password } = req.body
      const identifier = normalizeUsername(req.body.username ?? req.body.email)
      const user = db.prepare(`
        SELECT * FROM users
        WHERE username = ?
           OR lower(email) = ?
           OR lower(substr(email, 1, instr(email, '@') - 1)) = ?
      `).get(identifier, identifier, identifier)
      if (!user || !(await bcrypt.compare(String(password || ''), user.password_hash))) {
        return res.status(401).json({ error: 'Invalid username or password' })
      }
      if (!user.username) {
        try {
          db.prepare('UPDATE users SET username = ? WHERE id = ?').run(identifier, user.id)
          user.username = identifier
        } catch {
          // If a legacy username backfill conflicts, still allow login using the matched email account.
        }
      }
      const token = nanoid(48)
      sessions.set(token, user.id)
      res.json({ user: toPublicUser(user), session: sessionFor(token, user) })
    } catch (error) { next(error) }
  })

  app.get('/api/auth/session', requireAuth, (req, res) => {
    const auth = req.get('Authorization') || ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
    res.json({ session: sessionFor(token, req.user), user: toPublicUser(req.user) })
  })

  app.post('/api/auth/logout', requireAuth, (req, res) => {
    const auth = req.get('Authorization') || ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
    sessions.delete(token)
    res.json({ ok: true })
  })

  app.post('/api/auth/signup', requireAuth, requireRole('HUMAS'), async (req, res, next) => {
    try {
      const { password, role = 'PERAWAT' } = req.body
      const username = normalizeUsername(req.body.username ?? req.body.email)
      if (!['HUMAS', 'PERAWAT'].includes(role)) return res.status(400).json({ error: 'Invalid role' })
      if (!username || !password || password.length < 6) return res.status(400).json({ error: 'Username and password length >= 6 required' })
      const id = nanoid()
      const passwordHash = await bcrypt.hash(password, 10)
      db.prepare('INSERT INTO users (id, email, password_hash, username, role) VALUES (?, ?, ?, ?, ?)')
        .run(id, internalEmailForUsername(username), passwordHash, username, role)
      res.status(201).json({ user: toPublicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id)) })
    } catch (error) { next(error) }
  })

  app.get('/api/public/schedules', (req, res, next) => {
    try {
      const date = req.query.date
      const rows = listRows(db, 'schedules', { select: '*, doctors(*, departments(*))', eq_date: date, order: 'start_time' })
      res.json(rows)
    } catch (error) { next(error) }
  })

  // Template module is dormant (kept for possible future use).
  // Previously: requireRole('IT', 'PR')
  app.post('/api/uploads/templates', requireAuth, requireRole('HUMAS'), upload.single('file'), (req, res) => {
    const file = req.file
    if (!file) return res.status(400).json({ error: 'Missing file' })
    const ext = path.extname(file.originalname) || `.${file.mimetype.split('/')[1] || 'png'}`
    const finalName = `${Date.now()}-${nanoid(8)}${ext}`
    const finalPath = path.join(uploadDir, finalName)
    fs.renameSync(file.path, finalPath)
    res.status(201).json({ path: finalName, publicUrl: `/uploads/${finalName}` })
  })

  app.get('/api/:table', (req, res, next) => {
    try {
      const table = req.params.table
      if (!TABLES.has(table)) return res.status(404).json({ error: 'Unknown table' })
      if (!PUBLIC_READ_TABLES.has(table)) return requireAuth(req, res, () => res.json(listRows(db, table, req.query)))
      res.json(listRows(db, table, req.query))
    } catch (error) { next(error) }
  })

  app.post('/api/:table', requireAuth, (req, res, next) => {
    try {
      const table = req.params.table
      if (!TABLES.has(table)) return res.status(404).json({ error: 'Unknown table' })
      if (table === 'profiles' && req.user.role !== 'HUMAS') return res.status(403).json({ error: 'Forbidden' })
      const payloads = Array.isArray(req.body) ? req.body : [req.body]
      const rows = payloads.map((payload) => createRow(db, table, payload, req.user))
      res.status(201).json(Array.isArray(req.body) ? rows : rows[0])
    } catch (error) { next(error) }
  })

  app.patch('/api/:table', requireAuth, (req, res, next) => {
    try {
      const table = req.params.table
      if (!TABLES.has(table)) return res.status(404).json({ error: 'Unknown table' })
      res.json(updateRows(db, table, req.body, req.query))
    } catch (error) { next(error) }
  })

  app.delete('/api/:table', requireAuth, (req, res, next) => {
    try {
      const table = req.params.table
      if (!TABLES.has(table)) return res.status(404).json({ error: 'Unknown table' })
      res.json(deleteRows(db, table, req.query))
    } catch (error) { next(error) }
  })

  app.post('/api/rpc/delete_user_account', requireAuth, requireRole('HUMAS'), (req, res, next) => {
    try {
      const userId = req.body.user_id
      if (!userId) return res.status(400).json({ error: 'user_id required' })
      db.prepare('DELETE FROM users WHERE id = ?').run(userId)
      res.json({ ok: true })
    } catch (error) { next(error) }
  })

  // Template module is dormant (kept for possible future use).
  // Previously: requireRole('IT', 'PR')
  app.post('/api/rpc/copy_template_zones', requireAuth, requireRole('HUMAS'), (req, res, next) => {
    try {
      const result = copyTemplateZones(db, req.body.source_template_id, req.body.target_template_id, {
        replaceExisting: Boolean(req.body.replace_existing),
      })
      res.status(201).json(result)
    } catch (error) { next(error) }
  })

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found' })
  })

  if (staticDir && fs.existsSync(path.join(staticDir, 'index.html'))) {
    app.use(express.static(staticDir))
    app.use((req, res, next) => {
      if (req.method !== 'GET') return next()
      res.sendFile(path.join(staticDir, 'index.html'))
    })
  }

  app.use((error, _req, res, _next) => {
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: `File too large. Maximum size is ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB.` })
      }
      return res.status(400).json({ error: error.message || 'Upload failed' })
    }
    const status = error.status || 500
    res.status(status).json({ error: error.message || 'Internal server error' })
  })

  return app
}

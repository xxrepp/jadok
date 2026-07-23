export const ROLES = ['HUMAS', 'PERAWAT']

const LEGACY_ROLE_SQL = `
  CASE role
    WHEN 'IT' THEN 'HUMAS'
    WHEN 'PR' THEN 'HUMAS'
    WHEN 'NURSE' THEN 'PERAWAT'
    WHEN 'HUMAS' THEN 'HUMAS'
    WHEN 'PERAWAT' THEN 'PERAWAT'
    ELSE 'PERAWAT'
  END
`

/** Remap IT/PR/NURSE → HUMAS/PERAWAT and rebuild CHECK (SQLite cannot ALTER CHECK). */
export function migrateUserRoles(db) {
  const table = db.prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'`).get()
  if (!table?.sql) return

  const hasLegacyConstraint = /'IT'|'PR'|'NURSE'/.test(table.sql)
  const hasNewConstraint = /'HUMAS'/.test(table.sql) && /'PERAWAT'/.test(table.sql)
  const legacyRows = db
    .prepare(`SELECT COUNT(*) AS count FROM users WHERE role IN ('IT', 'PR', 'NURSE')`)
    .get().count

  if (!hasLegacyConstraint && hasNewConstraint && legacyRows === 0) return

  // Dropping/recreating users while FKs are on fails when schedules/templates reference users.
  db.pragma('foreign_keys = OFF')
  db.exec('BEGIN')
  try {
    db.exec(`
      CREATE TABLE users_new (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE,
        password_hash TEXT NOT NULL,
        username TEXT UNIQUE NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('HUMAS', 'PERAWAT'))
      );
    `)

    db.exec(`
      INSERT INTO users_new (id, email, password_hash, username, role)
      SELECT
        id,
        email,
        password_hash,
        COALESCE(
          NULLIF(username, ''),
          CASE
            WHEN email IS NOT NULL AND instr(email, '@') > 1
              THEN lower(substr(email, 1, instr(email, '@') - 1))
            ELSE id
          END
        ),
        ${LEGACY_ROLE_SQL}
      FROM users;
    `)

    db.exec('DROP TABLE users')
    db.exec('ALTER TABLE users_new RENAME TO users')
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    db.pragma('foreign_keys = ON')
    throw error
  }
  db.pragma('foreign_keys = ON')
}

export function createSchema(db) {
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE,
      password_hash TEXT NOT NULL,
      username TEXT UNIQUE NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('HUMAS', 'PERAWAT'))
    );

    CREATE TABLE IF NOT EXISTS departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS doctors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      doctor_id INTEGER NOT NULL REFERENCES doctors(id) ON DELETE RESTRICT,
      date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      created_by TEXT REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      background_image_url TEXT,
      is_active INTEGER DEFAULT 1,
      is_archived INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_by TEXT REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS template_zones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id INTEGER NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
      department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
      pos_x INTEGER,
      pos_y INTEGER,
      font_color TEXT,
      font_size INTEGER,
      width INTEGER,
      height INTEGER,
      font_family TEXT,
      text_align TEXT,
      zone_type TEXT,
      custom_text TEXT,
      schedule_layout TEXT
    );
  `)

  const templateZoneColumns = db.prepare(`PRAGMA table_info(template_zones)`).all().map((column) => column.name)
  if (!templateZoneColumns.includes('schedule_layout')) {
    db.exec(`ALTER TABLE template_zones ADD COLUMN schedule_layout TEXT`)
  }

  migrateUserRoles(db)
}

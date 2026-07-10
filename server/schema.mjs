export const ROLES = ['IT', 'PR', 'NURSE']

export function createSchema(db) {
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE,
      password_hash TEXT NOT NULL,
      username TEXT UNIQUE NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('IT', 'PR', 'NURSE'))
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
}

import Database from 'better-sqlite3'
import path from 'node:path'
import fs from 'node:fs'
import { createApp } from './app.mjs'
import { createSchema } from './schema.mjs'

const port = Number(process.env.JADOK_PORT || process.env.PORT || 8787)
const dataDir = path.resolve(process.env.JADOK_DATA_DIR || 'data')
fs.mkdirSync(dataDir, { recursive: true })

const dbPath = process.env.JADOK_DB_PATH || path.join(dataDir, 'jadok.sqlite')
const uploadDir = path.resolve(process.env.JADOK_UPLOAD_DIR || path.join(dataDir, 'uploads'))
const staticDir = path.resolve(process.env.JADOK_STATIC_DIR || 'dist')

const db = new Database(dbPath)
createSchema(db)

const app = createApp({ db, uploadDir, staticDir })
app.listen(port, () => {
  console.log(`Jadok SQLite API listening on http://localhost:${port}`)
  console.log(`Database: ${dbPath}`)
  console.log(`Uploads: ${uploadDir}`)
})

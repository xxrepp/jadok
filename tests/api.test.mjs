import test from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import Database from 'better-sqlite3'
import { createApp } from '../server/app.mjs'
import { createSchema } from '../server/schema.mjs'
import bcrypt from 'bcryptjs'

function makeTestApp() {
  const db = new Database(':memory:')
  createSchema(db)
  const app = createApp({ db, uploadDir: '/tmp/jadok-test-uploads' })
  return { app, db }
}

test('local API supports login, role profile lookup, and protected department creation', async () => {
  const { app, db } = makeTestApp()

  await request(app)
    .post('/api/bootstrap-admin')
    .send({ username: 'admin', password: 'secret123' })
    .expect(201)

  const login = await request(app)
    .post('/api/auth/login')
    .send({ username: 'admin', password: 'secret123' })
    .expect(200)

  assert.equal(login.body.user.username, 'admin')
  assert.equal(login.body.user.role, 'HUMAS')

  const token = login.body.session.access_token

  const created = await request(app)
    .post('/api/departments')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Poli Umum' })
    .expect(201)

  assert.equal(created.body.name, 'Poli Umum')
  assert.equal(db.prepare('select count(*) as count from departments').get().count, 1)
})

test('local API uses username instead of email for bootstrap, login, and user creation', async () => {
  const { app, db } = makeTestApp()

  await request(app)
    .post('/api/bootstrap-admin')
    .send({ username: 'admin', password: 'secret123' })
    .expect(201)

  const login = await request(app)
    .post('/api/auth/login')
    .send({ username: 'admin', password: 'secret123' })
    .expect(200)

  assert.equal(login.body.user.username, 'admin')
  assert.equal(login.body.user.email, null)

  const token = login.body.session.access_token

  const created = await request(app)
    .post('/api/auth/signup')
    .set('Authorization', `Bearer ${token}`)
    .send({ username: 'nurse1', password: 'secret123', role: 'PERAWAT' })
    .expect(201)

  assert.equal(created.body.user.username, 'nurse1')
  assert.equal(created.body.user.email, null)
  assert.equal(db.prepare('select count(*) as count from users where username in (?, ?)').get('admin', 'nurse1').count, 2)
})

test('local API lets legacy email-only users log in with the email local-part as username', async () => {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      username TEXT UNIQUE,
      role TEXT NOT NULL
    );
  `)
  const passwordHash = await bcrypt.hash('secret123', 10)
  db.prepare('INSERT INTO users (id, email, password_hash, username, role) VALUES (?, ?, ?, ?, ?)')
    .run('legacy-user', 'xxrepp@rep.com', passwordHash, null, 'HUMAS')

  const app = createApp({ db, uploadDir: '/tmp/jadok-test-uploads' })

  const login = await request(app)
    .post('/api/auth/login')
    .send({ username: 'xxrepp', password: 'secret123' })
    .expect(200)

  assert.equal(login.body.user.username, 'xxrepp')
  assert.equal(login.body.user.role, 'HUMAS')
})

test('public viewer endpoint returns schedules grouped with doctor and department data', async () => {
  const { app } = makeTestApp()

  await request(app).post('/api/bootstrap-admin').send({ username: 'admin', password: 'secret123' })
  const login = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'secret123' })
  const token = login.body.session.access_token

  const dept = await request(app).post('/api/departments').set('Authorization', `Bearer ${token}`).send({ name: 'Gigi' })
  const doctor = await request(app).post('/api/doctors').set('Authorization', `Bearer ${token}`).send({ name: 'dr. Sari', department_id: dept.body.id })

  await request(app)
    .post('/api/schedules')
    .set('Authorization', `Bearer ${token}`)
    .send({ doctor_id: doctor.body.id, date: '2026-05-30', start_time: '08:00', end_time: '12:00' })
    .expect(201)

  const res = await request(app)
    .get('/api/public/schedules?date=2026-05-30')
    .expect(200)

  assert.equal(res.body[0].doctors.name, 'dr. Sari')
  assert.equal(res.body[0].doctors.departments.name, 'Gigi')
})

test('PR users can copy all placed zones from one template to another', async () => {
  const { app, db } = makeTestApp()

  await request(app).post('/api/bootstrap-admin').send({ username: 'admin', password: 'secret123' })
  const login = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'secret123' })
  const token = login.body.session.access_token

  const source = await request(app)
    .post('/api/templates')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Template lama', background_image_url: '/uploads/source.png' })
    .expect(201)

  const target = await request(app)
    .post('/api/templates')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Template baru', background_image_url: '/uploads/target.png' })
    .expect(201)

  const dept = await request(app)
    .post('/api/departments')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Poli Anak' })
    .expect(201)

  await request(app)
    .post('/api/template_zones')
    .set('Authorization', `Bearer ${token}`)
    .send([
      {
        template_id: source.body.id,
        department_id: dept.body.id,
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
        template_id: source.body.id,
        department_id: null,
        pos_x: 40,
        pos_y: 10,
        width: 220,
        height: 50,
        font_color: '#111111',
        font_size: 20,
        font_family: 'Glacial Indifference',
        text_align: 'right',
        zone_type: 'date',
        custom_text: null,
        schedule_layout: null,
      },
    ])
    .expect(201)

  const copy = await request(app)
    .post('/api/rpc/copy_template_zones')
    .set('Authorization', `Bearer ${token}`)
    .send({ source_template_id: source.body.id, target_template_id: target.body.id })
    .expect(201)

  assert.match(copy.headers['content-type'], /application\/json/)
  assert.equal(copy.body.count, 2)

  const copiedRows = db.prepare('SELECT * FROM template_zones WHERE template_id = ? ORDER BY id').all(target.body.id)
  assert.equal(copiedRows.length, 2)
  assert.equal(copiedRows[0].template_id, target.body.id)
  assert.equal(copiedRows[0].department_id, dept.body.id)
  assert.equal(copiedRows[0].pos_x, 12)
  assert.equal(copiedRows[0].pos_y, 24)
  assert.equal(copiedRows[0].width, 300)
  assert.equal(copiedRows[0].height, 80)
  assert.equal(copiedRows[0].font_color, '#00715f')
  assert.equal(copiedRows[0].font_size, 32)
  assert.equal(copiedRows[0].font_family, 'Glacial Indifference')
  assert.equal(copiedRows[0].text_align, 'center')
  assert.equal(copiedRows[0].zone_type, 'schedule')
  assert.equal(copiedRows[0].schedule_layout, 'pr-card')
  assert.equal(copiedRows[1].template_id, target.body.id)
  assert.equal(copiedRows[1].pos_x, 40)
  assert.equal(copiedRows[1].pos_y, 10)
  assert.equal(copiedRows[1].width, 220)
  assert.equal(copiedRows[1].height, 50)
  assert.equal(copiedRows[1].font_color, '#111111')
  assert.equal(copiedRows[1].font_size, 20)
  assert.equal(copiedRows[1].font_family, 'Glacial Indifference')
  assert.equal(copiedRows[1].text_align, 'right')
  assert.equal(copiedRows[1].zone_type, 'date')
})

test('unknown API routes return JSON instead of the frontend HTML shell', async () => {
  const { app } = makeTestApp()

  const response = await request(app).post('/api/rpc/does_not_exist').send({})

  assert.equal(response.status, 404)
  assert.match(response.headers['content-type'], /application\/json/)
  assert.equal(response.body.error, 'API endpoint not found')
})

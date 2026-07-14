#!/usr/bin/env node

const port = process.env.JADOK_PORT || process.env.PORT || 8787
const username = process.argv[2] || 'admin'
const password = process.argv[3] || 'admin123'

const url = `http://localhost:${port}/api/bootstrap-admin`
const body = JSON.stringify({ username, password })

console.log(`Creating admin user: ${username}`)

fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body,
})
  .then(async (res) => {
    const text = await res.text()
    if (res.ok) {
      console.log('✅ Admin user created successfully')
      console.log(`Username: ${username}`)
      console.log(`Password: ${password}`)
      console.log('\nYou can now login at /login')
    } else {
      console.error(`❌ Failed: ${res.status} ${res.statusText}`)
      console.error(text)
      process.exit(1)
    }
  })
  .catch((err) => {
    console.error('❌ Error:', err.message)
    process.exit(1)
  })

import { spawn } from 'node:child_process'

const isWindows = process.platform === 'win32'
const npmCommand = isWindows ? 'npm.cmd' : 'npm'

const children = []
let shuttingDown = false

function start(name, command, args, env = {}) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    shell: false,
    env: { ...process.env, ...env },
  })

  children.push(child)

  child.on('exit', (code, signal) => {
    if (shuttingDown) return
    shuttingDown = true
    console.log(`\n${name} exited${signal ? ` with signal ${signal}` : ` with code ${code}`}. Stopping Jadok dev servers...`)
    stopAll()
    process.exit(code ?? 1)
  })

  return child
}

function stopAll() {
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM')
  }
}

process.on('SIGINT', () => {
  shuttingDown = true
  stopAll()
  process.exit(0)
})

process.on('SIGTERM', () => {
  shuttingDown = true
  stopAll()
  process.exit(0)
})

start('API server', process.execPath, ['server/index.mjs'], { JADOK_PORT: process.env.JADOK_PORT || '8787' })
start('Vite frontend', npmCommand, ['run', 'dev:vite'])

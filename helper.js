/**
 * Restart helper for the DSH restart button.
 *
 * Runs as a detached Node-mode child of the Host (same executable, through
 * ELECTRON_RUN_AS_NODE), so it outlives the two things it stops. Order matters:
 * every running copy of the application executable goes first — a Host exit on
 * its own makes the desktop shell open its recovery dialog — then the Host
 * process, then a pause long enough for the loopback port and the
 * single-instance lock to clear, then the same executable is started again.
 *
 * It uses tasklist/taskkill instead of PowerShell on purpose: those two are
 * plain console programs that start without loading a shell, which is exactly
 * what a no-console, no-PATH, detached child needs. It also refuses to rely on
 * the environment for anything, since the Host's environment is inherited from
 * a login shell.
 *
 * Nothing here touches the profile: no profile file is written.
 */

import { execFile, spawn } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { basename } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { promisify } from 'node:util'

const run = promisify(execFile)

const hostPid = Number(process.argv[2])
const exe = process.argv[3]
const logPath = process.argv[4]
const image = typeof exe === 'string' ? basename(exe) : ''

function log(line) {
  try {
    appendFileSync(logPath, `${new Date().toISOString()} [helper ${process.pid}] ${line}\n`, 'utf8')
  } catch {
    // 写不了日志也必须继续把事情做完。
  }
}

// First thing written, before any branch: no line here means the helper never
// started and the failure is in the spawn above it.
log(`entered host=${hostPid} exe=${exe}`)

if (!Number.isInteger(hostPid) || hostPid <= 0 || image === '') {
  log('abort: bad arguments')
  process.exit(2)
}

async function listPids() {
  try {
    const { stdout } = await run(
      'tasklist.exe',
      ['/FI', `IMAGENAME eq ${image}`, '/FO', 'CSV', '/NH'],
      { windowsHide: true, timeout: 15000 },
    )
    const pids = []
    for (const line of String(stdout).split(/\r?\n/)) {
      const match = /^"([^"]*)","(\d+)"/.exec(line.trim())
      if (match !== null && match[1].toLowerCase() === image.toLowerCase()) pids.push(Number(match[2]))
    }
    return pids
  } catch (error) {
    log(`tasklist failed: ${String(error)}`)
    return []
  }
}

async function kill(pid) {
  if (pid === process.pid) return
  try {
    await run('taskkill.exe', ['/F', '/PID', String(pid)], { windowsHide: true, timeout: 15000 })
    log(`killed ${pid}`)
  } catch (error) {
    // Killing the window process takes its renderers down with it, so the rest of
    // the list is often already gone. That is the normal path, not a failure.
    const message = String(error?.stderr ?? error)
    if (/not found|no running instance|没有找到|找不到|не найден|non trovato/i.test(message)) return
    log(`kill ${pid} failed: ${message.slice(0, 200)}`)
  }
}

// Give the Host a moment to answer the command that started this helper.
await sleep(250)

const targets = await listPids()
log(`restart requested: targets=${targets.join(',')}`)
for (const pid of targets) {
  await kill(pid)
}
await kill(hostPid)

for (let i = 0; i < 40; i++) {
  const left = await listPids()
  if (left.every((pid) => pid === process.pid)) break
  await sleep(100)
}

// Port and single-instance lock release.
await sleep(900)

// ELECTRON_RUN_AS_NODE would turn the new window into another headless Node, so
// it has to leave the environment before the application is started again.
const launchEnv = { ...process.env }
delete launchEnv.ELECTRON_RUN_AS_NODE
delete launchEnv.NODE_OPTIONS

let started = false
for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    const child = spawn(exe, [], {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
      env: launchEnv,
    })
    child.on('error', (error) => log(`launch child error: ${String(error)}`))
    child.unref()
    log(`launch attempt ${attempt} spawned pid=${child.pid ?? 'unknown'}`)
  } catch (error) {
    log(`launch attempt ${attempt} threw: ${String(error)}`)
  }
  await sleep(2500)
  const now = await listPids()
  if (now.some((pid) => pid !== process.pid)) {
    started = true
    log(`relaunched on attempt ${attempt}`)
    break
  }
  log(`launch attempt ${attempt} did not come up`)
}

if (!started) {
  log('giving up: the application did not come back; see this log')
  try {
    const shell = spawn('explorer.exe', [exe], { detached: true, stdio: 'ignore' })
    shell.unref()
  } catch (error) {
    log(`explorer fallback failed: ${String(error)}`)
  }
}

process.exit(started ? 0 : 1)

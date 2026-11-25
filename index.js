import { appendFileSync, closeSync, existsSync, openSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'dsh-restart-button'
export const inject = ['commands']

const here = dirname(fileURLToPath(import.meta.url))
const HELPER = join(here, 'helper.js')
const LOG = join(tmpdir(), 'dsh-restart-button.log')

/** 诊断用：走到哪一步都留一行，省得下次又只能猜。 */
function trace(line) {
  try {
    appendFileSync(LOG, `${new Date().toISOString()} ${line}\n`, 'utf8')
  } catch {
    // 写不了就算了，不能因为日志坏了拖住重启。
  }
}

/**
 * 桌面壳是这样起 Host 的：用应用自己的 exe，加 ELECTRON_RUN_AS_NODE=1，再 spawn 一个
 * Node 模式的子进程。所以在 Host 里 process.execPath 就是应用本体。Web 版（dsh web）
 * 跑在普通 node 里，这个前提不成立，直接拒绝。
 */
function desktopFacts() {
  if (process.versions.electron === undefined || process.env.ELECTRON_RUN_AS_NODE !== '1') {
    return { ok: false, reason: 'not-desktop' }
  }
  const exe = process.execPath
  if (typeof exe !== 'string' || !/\.exe$/i.test(exe)) return { ok: false, reason: 'not-desktop' }
  if (!existsSync(exe)) return { ok: false, reason: 'exe-missing' }
  return { ok: true, exe }
}

/**
 * 起一个脱离父链的 Node 助手：它先结束所有应用进程（包括本 Host），等端口腾出来之后
 * 再把应用原样拉起来。助手是本插件的 helper.js，仍然用同一个 exe 跑，只是回到 Node
 * 模式——这样不经过 PowerShell、不依赖 PATH，也不需要一个控制台。
 */
async function relaunch() {
  trace(`command received — host=${process.pid} ppid=${process.ppid} electron=${process.versions.electron ?? 'none'}`)

  const facts = desktopFacts()
  if (!facts.ok) {
    trace(`refused: ${facts.reason}`)
    return facts
  }
  if (!existsSync(HELPER)) {
    trace(`refused: helper-missing (${HELPER})`)
    return { ok: false, reason: 'helper-missing' }
  }

  trace(`spawning node helper — exe=${facts.exe} helper=${HELPER}`)

  // 助手的 stdout/stderr 也进同一个日志：它要是起不来，自己的抱怨是唯一的线索。
  let stdioFd
  try {
    stdioFd = openSync(LOG, 'a')
  } catch {
    stdioFd = undefined
  }

  const helperEnv = { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
  delete helperEnv.NODE_OPTIONS

  let child
  try {
    child = spawn(process.execPath, [HELPER, String(process.pid), facts.exe, LOG], {
      cwd: here,
      detached: true,
      stdio: stdioFd === undefined ? 'ignore' : ['ignore', stdioFd, stdioFd],
      windowsHide: true,
      env: helperEnv,
    })
  } catch (error) {
    trace(`spawn threw: ${String(error)}`)
    return { ok: false, reason: 'spawn-failed', detail: String(error) }
  }
  child.on('error', (error) => trace(`child error event: ${String(error)}`))
  if (stdioFd !== undefined) {
    setTimeout(() => {
      try {
        closeSync(stdioFd)
      } catch {
        // 已经关了就算了。
      }
    }, 3000).unref?.()
  }

  const failure = await new Promise((resolve) => {
    let settled = false
    const done = (value) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    child.once('error', (error) => done(error))
    setTimeout(() => done(null), 200).unref?.()
  })
  if (failure !== null) {
    trace(`spawn failed: ${String(failure)}`)
    return { ok: false, reason: 'spawn-failed', detail: String(failure) }
  }

  trace(`helper started — pid=${child.pid ?? 'unknown'}`)
  child.unref()
  return { ok: true }
}

const FAILURE_TEXT = {
  'not-desktop': '这个按钮只能在桌面端里用。现在这个 DSH 不是桌面窗口，重启得你自己来。',
  'exe-missing': '找不到应用本体，没敢动。',
  'helper-missing': '退出助手（helper.js）不在插件目录里，没敢动。',
  'spawn-failed': '拉不起退出助手，没敢动。',
}

export function apply(ctx) {
  ctx.effect(
    () =>
      ctx.commands.register({
        name: 'dsh-restart',
        description: '立刻重启 DSH：桌面端整台应用退出后自己重新打开',
        handler: async () => {
          const result = await relaunch()
          if (result.ok) return { kind: 'success', text: '好，正在重启，等我一下。' }
          const reason = FAILURE_TEXT[result.reason] ?? '重启没起来。'
          const detail = result.detail === undefined ? '' : `（${result.detail}）`
          return { kind: 'error', text: `${reason}${detail}` }
        },
      }),
    'dsh-restart-button: command',
  )
}

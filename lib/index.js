/**
 * dsh-deepseek-splash — host half.
 *
 * The opening animation itself is a Web client contribution (see ./client.js,
 * loaded through exports["./client"] + dsh.client.platform).
 *
 * This half exists for one job: keep DSH Desktop's own launch screen installed.
 * DSH Desktop paints `resources/splash.html` while the harness boots. That file
 * ships inside the app payload, so every desktop update rewrites it with the
 * stock page and the whale silently disappears. When the harness boots inside a
 * DSH Desktop install, this plugin puts its rendered page (`dist/splash.html`)
 * back — but only when the installed page is demonstrably not ours already.
 *
 * Never fatal: every failure is reported and the boot continues. `--restore`
 * writes a revoke marker, which turns the reinstall off until `--apply` removes
 * it.
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'deepseek-splash'

/** Same marker tools/build_splash.py keeps at the top of the rendered page. */
const MARKER = 'dsh-deepseek-splash: launch screen'
const TARGET_NAME = 'splash.html'
const BACKUP_SUFFIX = '.dsh-deepseek-splash.bak'
const REVOKE_SUFFIX = '.dsh-deepseek-splash.revoked'

/** Directory holding package.json, lib/, dist/. */
export function packageRoot() {
  return dirname(dirname(fileURLToPath(import.meta.url)))
}

/**
 * Where DSH Desktop keeps its loose resources.
 *
 * Packaged Electron exposes `process.resourcesPath`; the harness runs as an
 * Electron child process, where that may be absent, so fall back to
 * `<dir of the executable>/resources`.
 */
export function resolveResources(execPath = process.execPath, resourcesPath = process.resourcesPath) {
  const candidates = []
  if (typeof resourcesPath === 'string' && resourcesPath) candidates.push(resourcesPath)
  if (typeof execPath === 'string' && execPath) candidates.push(join(dirname(execPath), 'resources'))
  for (const dir of candidates) {
    if (existsSync(join(dir, TARGET_NAME))) return dir
  }
  return undefined
}

function readText(path) {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return undefined
  }
}

/**
 * Install dist/splash.html over the launcher page.
 *
 * Returns `{ status, target?, reason?, bytes? }` where status is one of
 * `installed`, `unchanged`, `skip`. Pure enough to unit test: nothing reads
 * module state except the packaged payload, and `root` can be overridden.
 */
export function installLaunchScreen(options = {}) {
  const root = options.root ?? packageRoot()
  const log = options.log ?? (() => {})
  // An explicit `resources: null` means "there is no install here" — do not treat
  // it as "not given", or tests and callers end up writing to the live launcher.
  const resources = Object.hasOwn(options, 'resources')
    ? options.resources
    : resolveResources(options.execPath, options.resourcesPath)

  if (!resources) return { status: 'skip', reason: 'not-a-desktop-install' }

  const target = join(resources, TARGET_NAME)
  if (!existsSync(target)) return { status: 'skip', reason: 'no-launcher-splash', target }
  if (existsSync(target + REVOKE_SUFFIX)) return { status: 'skip', reason: 'revoked', target }

  const payloadPath = join(root, 'dist', TARGET_NAME)
  const payload = readText(payloadPath)
  if (payload === undefined) return { status: 'skip', reason: 'no-rendered-page', target }
  if (!payload.includes(MARKER)) return { status: 'skip', reason: 'rendered-page-without-marker', target }

  const current = readText(target)
  if (current === payload) return { status: 'unchanged', target, bytes: Buffer.byteLength(payload) }

  // Keep the shell's own page once, so --restore always has something to go back
  // to. A page that is already ours must not overwrite that backup.
  const backupPath = target + BACKUP_SUFFIX
  if (current !== undefined && !current.includes(MARKER) && !existsSync(backupPath)) {
    writeFileSync(backupPath, current, 'utf8')
    log(`kept the shell's own page at ${backupPath}`)
  }

  // The launcher loads this file directly, so leave no half-written page behind.
  const stagingPath = target + '.dsh-deepseek-splash.tmp'
  writeFileSync(stagingPath, payload, 'utf8')
  renameSync(stagingPath, target)

  const bytes = Buffer.byteLength(payload)
  log(`restored the launch screen at ${target} (${bytes} bytes)`)
  return { status: 'installed', target, bytes }
}

export function apply(ctx) {
  try {
    const result = installLaunchScreen({
      log: (message) => {
        try {
          ctx?.logger?.info?.(message)
        } catch {
          /* logging must never break the install */
        }
      }
    })
    if (result.status === 'installed') {
      try {
        ctx?.logger?.info?.(`dsh-deepseek-splash: ${result.target}`)
      } catch {
        /* ignore */
      }
    }
  } catch (error) {
    // A splash page is cosmetic: никогда not worth failing a boot over.
    try {
      ctx?.logger?.warn?.(`dsh-deepseek-splash: launch screen not restored: ${error?.message ?? error}`)
    } catch {
      /* ignore */
    }
  }
}

export const inject = []

/**
 * Build the xlsx reactor for the browser. wasm32-wasip1 needs a WASI sysroot
 * because crates such as bzip2-sys compile C with clang. Set WASI_SYSROOT, or
 * install wasi-sdk so one of the well-known locations exists.
 */
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const manifest = resolve(here, '../native/xlsx-engine/Cargo.toml')
const target = 'wasm32-wasip1'
const artifact = resolve(here, `../native/xlsx-engine/target/${target}/release/xlsx_sidecar.wasm`)
const output = resolve(here, '../src/renderer/public/xlsx-sidecar.wasm')

const sdk = findSdk()
if (!sdk) {
  console.error(
    'No WASI SDK. Apple clang cannot target wasm32-wasip1. Set WASI_SDK_PATH or install wasi-sdk. The sheets page can mount, but it cannot open a workbook.',
  )
  process.exit(1)
}
const { sysroot, clang } = sdk

const rustup = spawnSync('rustup', ['target', 'add', target], { stdio: 'inherit' })
if (rustup.status !== 0) process.exit(rustup.status ?? 1)

const env = {
  ...process.env,
  WASI_SDK_PATH: dirname(dirname(clang)),
  WASI_SYSROOT: sysroot,
  CC_wasm32_wasip1: clang,
  CFLAGS_wasm32_wasip1: `--sysroot=${sysroot}`,
  BINDGEN_EXTRA_CLANG_ARGS_wasm32_wasip1: `--sysroot=${sysroot}`,
}
const build = spawnSync(
  'cargo',
  ['build', '--release', '--target', target, '--manifest-path', manifest],
  { stdio: 'inherit', env },
)
if (build.status !== 0) process.exit(build.status ?? 1)
if (!existsSync(artifact)) {
  console.error(`cargo reported success but ${artifact} is missing`)
  process.exit(1)
}
mkdirSync(dirname(output), { recursive: true })
copyFileSync(artifact, output)
console.log(`wrote ${output}`)

function findSdk(): { sysroot: string; clang: string } | null {
  const sdkRoots = [
    process.env.WASI_SDK_PATH,
    '/opt/wasi-sdk',
    '/usr/local/wasi-sdk',
    '/opt/homebrew/opt/wasi-sdk',
  ].filter((path): path is string => !!path)
  for (const root of sdkRoots) {
    const clang = resolve(root, 'bin/clang')
    const sysroot = process.env.WASI_SYSROOT || resolve(root, 'share/wasi-sysroot')
    if (existsSync(clang) && existsSync(sysroot)) return { sysroot, clang }
  }
  const sysrootOnly = [
    process.env.WASI_SYSROOT,
    '/usr/share/wasi-sysroot',
    '/usr/include/wasm32-wasi',
  ].find((path) => path && existsSync(path))
  if (sysrootOnly && existsSync('/usr/bin/clang')) return { sysroot: sysrootOnly, clang: '/usr/bin/clang' }
  return null
}

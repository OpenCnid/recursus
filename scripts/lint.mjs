import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const listed = spawnSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '*.mjs'],
  { cwd: root, encoding: 'utf8', windowsHide: true },
)
if (listed.status !== 0) throw new Error('could not enumerate JavaScript sources')
const files = listed.stdout.split(/\r?\n/u).filter(Boolean)
for (const relative of files) {
  const checked = spawnSync(process.execPath, ['--check', relative], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  })
  if (checked.status !== 0) {
    process.stderr.write(checked.stderr)
    throw new Error(`${relative}: JavaScript syntax check failed`)
  }
}

console.log(`lint passed: ${String(files.length)} JavaScript files syntax checked; TypeScript is checked separately`)

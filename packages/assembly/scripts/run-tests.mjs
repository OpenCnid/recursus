import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import path from 'node:path'

const packageRoot = path.resolve(import.meta.dirname, '..')
const testsRoot = path.join(packageRoot, 'tests')
const files = readdirSync(testsRoot)
  .filter((name) => name.endsWith('.test.mjs'))
  .sort()
  .map((name) => path.join(testsRoot, name))
const result = spawnSync(process.execPath, ['--test', ...files], {
  cwd: packageRoot,
  stdio: 'inherit',
  windowsHide: true,
})
if (result.error !== undefined) throw result.error
process.exitCode = result.status ?? 1

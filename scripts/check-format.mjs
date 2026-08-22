import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { extname, resolve } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const root = resolve(import.meta.dirname, '..')
const { stdout } = await execFileAsync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { cwd: root, encoding: 'utf8' },
)
const files = stdout.split('\0').filter(Boolean)

for (const relative of files) {
  const content = await readFile(resolve(root, relative), 'utf8')
  if (content.includes('\r')) throw new Error(`${relative}: CR characters violate the repository LF policy`)
  if (!content.endsWith('\n')) throw new Error(`${relative}: text file must end in one newline`)
  if (extname(relative) === '.json') {
    const formatted = `${JSON.stringify(JSON.parse(content), null, 2)}\n`
    if (content !== formatted) throw new Error(`${relative}: JSON is not deterministic two-space formatting`)
  }
}

console.log(`format check passed: ${String(files.length)} repository text files`)

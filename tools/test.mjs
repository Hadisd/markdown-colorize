// Bundles tests/*.spec.ts (they import CodeMirror) and runs them with Node's test runner.
import { build } from 'esbuild'
import { mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const files = readdirSync('tests').filter((f) => f.endsWith('.spec.ts'))
const out = mkdtempSync(join(tmpdir(), 'md-colorize-tests-'))
await build({
  entryPoints: files.map((f) => join('tests', f)),
  outdir: out,
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  outExtension: { '.js': '.mjs' },
  logLevel: 'warning'
})
const result = spawnSync(process.execPath, ['--test', ...files.map((f) => join(out, f.replace(/\.ts$/, '.mjs')))], {
  stdio: 'inherit'
})
process.exit(result.status ?? 1)

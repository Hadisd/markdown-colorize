// 1. Bundles src/render.ts (marked, highlight.js, KaTeX) into one ES module the editor imports.
// 2. Writes KaTeX's stylesheet with its fonts inlined as data: URIs, because a plugin frame has
//    no network and this avoids depending on how relative font URLs resolve.
import { build } from 'esbuild'
import { readFileSync, writeFileSync } from 'node:fs'

await build({
  entryPoints: ['src/render.ts'],
  outfile: 'editor/vendor/render.js',
  bundle: true,
  format: 'esm',
  target: 'es2022',
  minify: true,
  legalComments: 'none',
  logLevel: 'info'
})

// Mermaid is large, so it is its own file and the editor loads it only for a document that has a
// ```mermaid block.
await build({
  entryPoints: ['src/mermaid.ts'],
  outfile: 'editor/vendor/mermaid.js',
  bundle: true,
  format: 'esm',
  target: 'es2022',
  minify: true,
  legalComments: 'none',
  logLevel: 'info'
})

const dist = 'node_modules/katex/dist'
let css = readFileSync(`${dist}/katex.min.css`, 'utf8')
// Each @font-face lists woff2, woff and ttf; keep only the woff2 source, as a data: URI.
css = css.replace(/src:\s*url\(fonts\/([^)]+?)\.woff2\)[^;}]*/g, (_all, name) => {
  const data = readFileSync(`${dist}/fonts/${name}.woff2`).toString('base64')
  return `src:url(data:font/woff2;base64,${data}) format("woff2")`
})
if (/url\(fonts\//.test(css)) {
  throw new Error('a KaTeX font URL was left in the stylesheet')
}
writeFileSync('editor/vendor/katex-css.js', `export default ${JSON.stringify(css)}\n`)
console.log(`editor/vendor/katex-css.js  ${(css.length / 1024).toFixed(0)}kb`)

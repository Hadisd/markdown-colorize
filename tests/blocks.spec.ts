// The page is cut into blocks that each know their exact place in the file, so one block can be
// swapped for an editor and written back. These tests check those places. Run with `npm test`.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { renderBlocks } from '../src/render.ts'

const slices = (text: string, mdx = false): string[] =>
  renderBlocks(text, { mdx }).blocks.map((b) => text.slice(b.from, b.to))

test('plain Markdown: one block per paragraph, list, heading and code block', () => {
  const text = '# Title\n\nPara one\nstill one\n\n- a\n- b\n\n```js\nx\n```\n'
  assert.deepEqual(slices(text), ['# Title', 'Para one\nstill one', '- a\n- b', '```js\nx\n```'])
  const { blocks } = renderBlocks(text)
  assert.match(blocks[0].html, /<h1 id="title"/)
  assert.match(blocks[2].html, /<ul>/)
})

test('front matter is its own block', () => {
  const text = '---\ntitle: Hi\n---\n\n# After\n'
  assert.deepEqual(slices(text), ['---\ntitle: Hi\n---', '# After'])
  assert.match(renderBlocks(text).blocks[0].html, /front matter/)
})

test('MDX: modules and components are their own blocks, Markdown stays Markdown', () => {
  const text = "import A from './a'\nimport B from './b'\n\n# Heading\n\n<Chart data={[1]} />\n\nText **here**\n"
  assert.deepEqual(slices(text, true), ["import A from './a'\nimport B from './b'", '# Heading', '<Chart data={[1]} />', 'Text **here**'])
  const { blocks } = renderBlocks(text, { mdx: true })
  assert.match(blocks[0].html, /mdx-module/)
  assert.match(blocks[2].html, /mdx-jsx/)
  assert.match(blocks[3].html, /<strong>here<\/strong>/)
})

test('reference links still resolve inside their own block', () => {
  const text = 'See [the docs][d] now.\n\n[d]: https://example.com/docs\n'
  const { blocks } = renderBlocks(text)
  assert.equal(blocks.length, 1)
  assert.match(blocks[0].html, /href="https:\/\/example\.com\/docs"/)
})

test('math and diagram blocks stay whole', () => {
  const text = '$$\nx^2\n$$\n\n```mermaid\nflowchart LR\n  A --> B\n```\n'
  assert.deepEqual(slices(text), ['$$\nx^2\n$$', '```mermaid\nflowchart LR\n  A --> B\n```'])
  const { blocks } = renderBlocks(text)
  assert.match(blocks[0].html, /katex/)
  assert.match(blocks[1].html, /data-src=/)
})

test('Windows line endings are normalized, and offsets follow the normalized text', () => {
  const text = '# A\r\n\r\nB\r\n'
  const normalized = text.replace(/\r\n/g, '\n')
  assert.deepEqual(slices(normalized), ['# A', 'B'])
  assert.equal(renderBlocks(text).blocks.length, 2)
})

test('headings are numbered in order across blocks', () => {
  const { toc } = renderBlocks('# One\n\ntext\n\n## Two\n\n# One\n')
  assert.deepEqual(
    toc.map((t) => t.id),
    ['one', 'two', 'one-1']
  )
})

test('the sample files cut into ordered, non-overlapping, non-empty blocks', () => {
  for (const file of readdirSync('examples')) {
    const text = readFileSync(`examples/${file}`, 'utf8').replace(/\r\n?/g, '\n')
    const { blocks } = renderBlocks(text, { mdx: file.endsWith('.mdx') })
    let end = 0
    for (const b of blocks) {
      assert.ok(b.from >= end, `${file}: block at ${b.from} overlaps the one before`)
      assert.ok(b.to > b.from, `${file}: empty block at ${b.from}`)
      assert.ok(b.to <= text.length, `${file}: block past the end`)
      assert.ok(text.slice(b.from, b.to).trim() !== '', `${file}: blank block`)
      end = b.to
    }
    assert.ok(blocks.length > 0, `${file}: no blocks`)
  }
})

test('replacing one block in the text changes only that block', () => {
  const text = '# One\n\nSecond paragraph\n\n- x\n'
  const { blocks } = renderBlocks(text)
  const second = blocks[1]
  const edited = text.slice(0, second.from) + 'Edited **text**' + text.slice(second.to)
  assert.equal(edited, '# One\n\nEdited **text**\n\n- x\n')
  assert.deepEqual(
    renderBlocks(edited).blocks.map((b) => edited.slice(b.from, b.to)),
    ['# One', 'Edited **text**', '- x']
  )
})

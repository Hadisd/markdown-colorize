// Checks what the block editor colors, without a browser: it builds the decorations for an editor
// state and reads them back. Run with `npm test`.
import test from 'node:test'
import assert from 'node:assert/strict'
import { EditorState } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { buildDecorations, htmlToRanges } from '../src/live.ts'

const options = {
  highlight: (code: string, lang: string) =>
    lang === 'ts' ? '<span class="hljs-keyword">const</span> a = <span class="hljs-number">1</span>' : code
}

type Found = { from: number; to: number; cls: string; point: boolean }

const decorate = (doc: string): Found[] => {
  const state = EditorState.create({ doc, extensions: [markdown({ base: markdownLanguage })] })
  const out: Found[] = []
  buildDecorations(state, options).between(0, doc.length, (from, to, value) => {
    out.push({ from, to, cls: String(value.spec.class ?? ''), point: value.point })
  })
  return out
}

const has = (found: Found[], test: (f: Found) => boolean): boolean => found.some(test)

const DOC = '# Title\n\nSome **bold** and `code` and [link](https://x.y).\n\n- [ ] todo\n- item\n\n> quoted\n\n```ts\nconst a = 1\n```\n'

test('nothing is hidden: every Markdown symbol stays visible', () => {
  const f = decorate(DOC)
  // line styles are zero-length "point" decorations; a replace that hides text would span a range
  assert.ok(!has(f, (x) => x.point && x.to > x.from), 'no decoration replaces or hides text')
})

test('symbols are dimmed and the text between them is styled', () => {
  const f = decorate(DOC)
  assert.ok(has(f, (x) => x.cls.includes('cm-h1')))
  assert.ok(has(f, (x) => x.cls === 'cm-syntax' && x.from === 0 && x.to === 1), 'the # is dim')
  const bold = DOC.indexOf('**bold**')
  assert.ok(has(f, (x) => x.cls === 'cm-syntax' && x.from === bold && x.to === bold + 2))
  assert.ok(has(f, (x) => x.cls === 'cm-strong' && x.from === bold + 2 && x.to === bold + 6))
  const code = DOC.indexOf('`code`')
  assert.ok(has(f, (x) => x.cls === 'cm-ic' && x.from === code && x.to === code + 6))
})

test('links, list marks, task boxes and quotes are colored', () => {
  const f = decorate(DOC)
  const link = DOC.indexOf('[link]')
  assert.ok(has(f, (x) => x.cls === 'cm-link' && x.from === link + 1 && x.to === link + 5))
  assert.ok(has(f, (x) => x.cls === 'cm-syntax' && x.from === link + 5), 'the address is dim')
  const task = DOC.indexOf('- [ ]')
  assert.ok(has(f, (x) => x.cls === 'cm-listmark' && x.from === task && x.to === task + 1))
  assert.ok(has(f, (x) => x.cls === 'cm-syntax' && x.from === task + 2 && x.to === task + 5), 'the [ ] box')
  assert.ok(has(f, (x) => x.cls.includes('cm-quote')))
})

test('fenced code takes its colors from the highlighter, character for character', () => {
  const f = decorate(DOC)
  const code = DOC.indexOf('const a = 1')
  assert.ok(has(f, (x) => x.cls === 'hljs-keyword' && x.from === code && x.to === code + 5))
  assert.ok(has(f, (x) => x.cls === 'hljs-number' && x.from === code + 10 && x.to === code + 11))
  assert.ok(has(f, (x) => x.cls.includes('cm-codeblock')))
})

test('a badge keeps both its link and its picture styled', () => {
  const doc = '[![python](https://img.shields.io/badge/p-1-blue.svg)](https://x.y)'
  const f = decorate(doc)
  assert.ok(has(f, (x) => x.cls === 'cm-syntax' && x.from === 0 && x.to === 1))
  assert.ok(has(f, (x) => x.cls === 'cm-syntax' && x.from === 1 && x.to === doc.indexOf('](https://x.y)')), 'the inner image')
})

test('front matter is not styled as Markdown', () => {
  const doc = '---\ntitle: A *b*\n---\n\n# Real heading\n'
  const f = decorate(doc)
  assert.ok(has(f, (x) => x.cls.includes('cm-front') && x.from === 0))
  assert.ok(!has(f, (x) => x.cls.includes('cm-em') && x.from < 20))
  assert.ok(has(f, (x) => x.cls.includes('cm-h1')))
})

test('htmlToRanges maps highlight.js HTML back onto the plain code', () => {
  const html = '<span class="hljs-keyword">if</span> (a &lt; b &amp;&amp; <span class="hljs-title function_">f</span>)'
  const r = htmlToRanges(html)
  assert.deepEqual(r, [
    { from: 0, to: 2, cls: 'hljs-keyword' },
    { from: 13, to: 14, cls: 'hljs-title function_' }
  ])
  assert.equal(htmlToRanges('<span class="x">unclosed'), null)
})

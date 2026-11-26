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
  assert.match(blocks[0].html, /<h1 id="user-content-title"><a class="anchor" href="#title"/)
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
  assert.deepEqual(slices(text), ['See [the docs][d] now.', '[d]: https://example.com/docs'])
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

const html = (text: string): string =>
  renderBlocks(text).blocks.map((b) => b.html).join('')

test('footnotes: numbered by first use, linked both ways, each note its own block', () => {
  const text = 'Beta[^b] then alpha[^a] and beta again[^b].\n\n[^a]: Alpha note.\n[^b]: Beta note\n    with a second line.\n'
  const { blocks } = renderBlocks(text)
  assert.deepEqual(slices(text), ['Beta[^b] then alpha[^a] and beta again[^b].', '[^a]: Alpha note.', '[^b]: Beta note\n    with a second line.'])
  assert.match(blocks[0].html, /id="user-content-fnref-b"[^>]*><a href="#fn-b"[^>]*>1<\/a>/)
  assert.match(blocks[0].html, /href="#fn-a"[^>]*>2<\/a>/)
  assert.equal((blocks[0].html.match(/id="user-content-fnref-b"/g) ?? []).length, 1)
  assert.match(blocks[1].html, /id="user-content-fn-a"[^>]*><span class="fn-num">2<\/span>/)
  assert.match(blocks[2].html, /with a second line/)
  assert.match(blocks[2].html, /href="#fnref-b"/)
})

test('footnotes: an undefined reference and code stay plain text', () => {
  assert.match(html('Nothing[^x] here.'), /Nothing\[\^x\] here/)
  assert.doesNotMatch(html('```\n[^a]: not a note\n```\n\nText[^a]\n'), /fn-ref/)
})

test('==marked== text and :emoji: shortcodes', () => {
  assert.match(html('a ==very *big*== deal'), /<mark>very <em>big<\/em><\/mark>/)
  assert.doesNotMatch(html('if a == b and b == c'), /<mark>/)
  assert.match(html('Ship it :rocket: at 10:30:15 :nope:'), /Ship it 🚀 at 10:30:15 :nope:/)
  assert.match(html('`:rocket:`'), /:rocket:/)
})

test('callouts: extra kinds, custom titles, and the five GitHub ones', () => {
  assert.match(html('> [!NOTE]\n> Plain'), /callout-note"><div class="callout-title">Note<\/div><p>Plain/)
  assert.match(html('> [!bug] Crash on **save**\n> Steps follow'), /callout-caution"><div class="callout-title">Crash on <strong>save<\/strong><\/div><p>Steps follow/)
  assert.match(html('> [!success]\n> Done'), /callout-tip"><div class="callout-title">Success/)
  assert.doesNotMatch(html('> [!unknown]\n> text'), /class="callout/)
})

test('front matter: flat YAML becomes a property list, anything else stays code', () => {
  const flat = renderBlocks('---\ntitle: "Hi: there"\ndraft: false\ntags: [a, "b, c"]\nauthors:\n  - Ann\n  - Bo\n---\n\nBody\n').blocks[0].html
  assert.match(flat, /<dt>title<\/dt><dd><span class="v-str">Hi: there<\/span>/)
  assert.match(flat, /<span class="v-bool">false<\/span>/)
  assert.match(flat, /<span class="chip"><span class="v-str">b, c<\/span>/)
  assert.match(flat, /Ann.*Bo/)
  const nested = renderBlocks('---\nseo:\n  title: x\n---\n').blocks[0].html
  assert.match(nested, /<pre><code class="hljs">/)
  assert.match(renderBlocks('---\nt: <img src=x onerror=alert(1)>\n---\n').blocks[0].html, /&lt;img/)
})

test('footnote scan ignores every line of a fenced code block, and lists of maps stay code', () => {
  assert.doesNotMatch(html('```\nfirst line\n[^a]: not a note\n```\n\nText[^a]\n'), /fn-ref/)
  assert.doesNotMatch(html('~~~\nx\ny\n[^a]: no\n\nz\n~~~\n\nText[^a]\n'), /fn-ref/)
  assert.match(renderBlocks('---\nitems:\n  - name: x\n---\n').blocks[0].html, /<pre><code/)
  assert.match(renderBlocks('---\nitems:\n  - plain\n  - "q: r"\n---\n').blocks[0].html, /class="chip"/)
})

test('front matter: unindented lists, comments after quoted values, and quote escapes', () => {
  const fm = renderBlocks(
    "---\ntags:\n- one\n- two\ntitle: \"A \\\"quoted\\\" word\" # a comment\nnote: 'It''s fine'\nplain: value # comment\n---\n"
  ).blocks[0].html
  assert.match(fm, /class="chip"><span class="v-str">one<\/span>.*class="chip"><span class="v-str">two</)
  assert.match(fm, /<dd><span class="v-str">A &quot;quoted&quot; word<\/span><\/dd>/)
  assert.match(fm, /It's fine/)
  assert.match(fm, /<dd><span class="v-str">value<\/span><\/dd>/)
  assert.doesNotMatch(fm, /comment/)
  assert.match(renderBlocks('---\n- stray\n---\n').blocks[0].html, /<pre><code/)
})

test('link reference definitions: every block that uses them resolves them, and they show as written', () => {
  const text = '# T\n\n[![npm][badge]][url]\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n[badge]: https://img.shields.io/badge/npm-1.0-blue\n[url]: https://example.com/pkg\n'
  const page = renderBlocks(text)
  const defs = '[badge]: https://img.shields.io/badge/npm-1.0-blue\n[url]: https://example.com/pkg'
  assert.deepEqual(slices(text), ['# T', '[![npm][badge]][url]', '| a | b |\n|---|---|\n| 1 | 2 |', defs])
  assert.match(page.blocks[1].html, /<a href="https:\/\/example\.com\/pkg"[^>]*><span class="badge"/)
  assert.equal(page.blocks[3].html, `<div class="link-defs">${defs}</div>\n`)
  assert.equal(page.definitions, defs)
  // Typed into a block on their own, they stay in view (and are escaped like any text).
  assert.deepEqual(renderBlocks('  [a]: <https://a.a/?b=1&c=2> "<b>"\n').blocks, [
    { from: 2, to: 35, html: '<div class="link-defs">[a]: &lt;https://a.a/?b=1&amp;c=2&gt; &quot;&lt;b&gt;&quot;</div>\n' }
  ])
  // A block drawn on its own, as after an edit, is given the file's definitions.
  assert.match(html('See [the docs][d].'), /See \[the docs\]\[d\]\./)
  assert.match(renderBlocks('See [the docs][d].', { definitions: '[d]: https://example.com/docs' }).blocks[0].html, /<a href="https:\/\/example\.com\/docs"/)
  // They go in front, so a code fence left open at the end does not show them.
  const open = '[d]: https://example.com\n\nIntro [x][d]\n\n```js\nlet a = [1]\n'
  const blocks = renderBlocks(open).blocks
  assert.deepEqual(blocks.map((b) => open.slice(b.from, b.to)), ['[d]: https://example.com', 'Intro [x][d]', '```js\nlet a = [1]'])
  assert.match(blocks[1].html, /<a href="https:\/\/example\.com"/)
  assert.doesNotMatch(blocks[2].html, /example\.com/)
})

test('web addresses in text become links, beside :emoji: too', () => {
  assert.match(html('See https://example.com for more :rocket:'), /See <a href="https:\/\/example\.com"[^>]*>https:\/\/example\.com<\/a> for more 🚀/)
  assert.match(html('Run http://localhost:3000/:id/edit now'), /<a href="http:\/\/localhost:3000\/:id\/edit"/)
})

test('heading anchors are made as on GitHub, and the outline shows the text a reader sees', () => {
  const { toc } = renderBlocks('## my_function\n\n## Foo & Bar\n\n## 🚀 Launch\n\n## <img src="i.png" width="20"> Features\n\n## Tom &amp; Jerry\n\n## Install <a name="install"></a>\n')
  assert.deepEqual(toc.map((t) => t.id), ['my_function', 'foo--bar', '-launch', '-features', 'tom--jerry', 'install-'])
  assert.deepEqual(toc.map((t) => t.text), ['my_function', 'Foo & Bar', '🚀 Launch', 'Features', 'Tom & Jerry', 'Install'])
  // ² and ½ are dropped, Ⅻ is a letter; a repeat takes the first free number, never another's id.
  const ids = (md: string): string[] => renderBlocks(md).toc.map((t) => t.id)
  assert.deepEqual(ids('# x² + y½\n\n# Ⅻ\n'), ['x--y', 'ⅻ'])
  assert.deepEqual(ids('# a\n\n# a\n\n# a-1\n\n# a\n'), ['a', 'a-1', 'a-1-1', 'a-2'])
  // An anchor in HTML can be jumped to; no id can take one of the editor's own (#outline, #shell).
  assert.match(html('## Install <a name="install"></a>'), /<a id="user-content-install"><\/a>/)
  assert.match(html('## Outline'), /<h2 id="user-content-outline"><a class="anchor" href="#outline"/)
})

test('$$…$$ inside a sentence is drawn where it is; a $$ block still takes its own lines', () => {
  const inline = html('Euler: $$e^{i\\pi}+1=0$$, neat.')
  assert.match(inline, /^<p>Euler: <span class="math-block"><span class="katex-display">/)
  assert.match(inline, /<\/span>, neat\.<\/p>\n$/)
  assert.doesNotMatch(inline, /\$\$|<div/)
  assert.match(html('Before\n$$\nx^2\n$$\nAfter'), /^<p>Before<\/p>\n<div class="math-block">[\s\S]*<\/div>\n<p>After<\/p>\n$/)
})

test('links: any address without a scheme is a link, other schemes are not, and HTML entities count once', () => {
  const out = html('[a](CONTRIBUTING.md#setup) [b](page?x=1) [c](한국.md) [d](javascript:alert(1)) [e](JavaScript:alert(1))')
  assert.match(out, /<a href="CONTRIBUTING\.md#setup"/)
  assert.match(out, /<a href="page\?x=1"/)
  assert.match(out, /<a href="한국\.md"/)
  assert.doesNotMatch(out, /javascript/i)
  assert.match(
    html('<a href="https://x.com/?a=1&amp;b=2" title="Tom &amp; Jerry">x</a>'),
    /<a href="https:\/\/x\.com\/\?a=1&amp;b=2" data-href="https:\/\/x\.com\/\?a=1&amp;b=2" title="Tom &amp; Jerry">/
  )
  assert.match(html('<img alt="Tom &amp; Jerry" src="a.png">'), /data-alt="Tom &amp; Jerry"/)
  assert.doesNotMatch(html('<a href="java&#x09;script:alert(1)">x</a> <a href="javascript&#58;alert(1)">y</a>'), /href=/)
})

test('MDX: a component inside a sentence stays in it, and a fence inside a component stays in its block', () => {
  assert.match(
    renderBlocks('Press <Kbd>Ctrl</Kbd> to copy.\n', { mdx: true }).blocks[0].html,
    /^<p>Press <code class="ic">&lt;Kbd&gt;<\/code>Ctrl<code class="ic">&lt;\/Kbd&gt;<\/code> to copy\.<\/p>/
  )
  const text = '<Tabs>\n```js\nconst a = 1\n```\n</Tabs>\n'
  const { blocks } = renderBlocks(text, { mdx: true })
  assert.deepEqual(slices(text, true), ['<Tabs>\n```js\nconst a = 1\n```\n</Tabs>'])
  assert.equal((blocks[0].html.match(/class="codeblock/g) ?? []).length, 1)
  assert.match(blocks[0].html, /```js\nconst a = 1\n```\n.*Tabs/)
})

test('metaOnly gives the same outline, words and definitions as a full render', () => {
  const text = '# A [x]\n\nSee [one][x] and [Two].\n\n> ## Quoted\n\n- item\n  ### In list\n\n[x]: /x\n[two]: /two\n  "title"\n'
  const full = renderBlocks(text)
  const meta = renderBlocks(text, { metaOnly: true })
  assert.deepEqual([meta.toc, meta.words, meta.definitions], [full.toc, full.words, full.definitions])
  assert.equal(meta.blocks.filter((b) => !b.html.includes('link-defs')).length, 0)
})

test('a block gets only the reference definitions it uses, and its links still work', () => {
  const { definitions } = renderBlocks('[a]: /a\n[B c]: /bc "t"\n')
  const html = renderBlocks('Go [here][b  C] or [a].', { definitions }).blocks[0].html
  assert.match(html, /href="\/bc"/)
  assert.match(html, /href="\/a"/)
})

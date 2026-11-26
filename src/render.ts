// Turns Markdown (or MDX) text into colored HTML. Bundled by tools/build.mjs into
// editor/vendor/render.js, because a plugin has no network and no bundler at run time.
import { Marked, type Token, type Tokens, type TokenizerAndRendererExtension } from 'marked'
import katex from 'katex'
import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import c from 'highlight.js/lib/languages/c'
import cpp from 'highlight.js/lib/languages/cpp'
import csharp from 'highlight.js/lib/languages/csharp'
import css from 'highlight.js/lib/languages/css'
import diff from 'highlight.js/lib/languages/diff'
import dockerfile from 'highlight.js/lib/languages/dockerfile'
import go from 'highlight.js/lib/languages/go'
import ini from 'highlight.js/lib/languages/ini'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import kotlin from 'highlight.js/lib/languages/kotlin'
import latex from 'highlight.js/lib/languages/latex'
import lua from 'highlight.js/lib/languages/lua'
import markdown from 'highlight.js/lib/languages/markdown'
import php from 'highlight.js/lib/languages/php'
import python from 'highlight.js/lib/languages/python'
import ruby from 'highlight.js/lib/languages/ruby'
import rust from 'highlight.js/lib/languages/rust'
import scss from 'highlight.js/lib/languages/scss'
import sql from 'highlight.js/lib/languages/sql'
import swift from 'highlight.js/lib/languages/swift'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'
import { EMOJI } from './emoji'

const LANGS: Record<string, Parameters<typeof hljs.registerLanguage>[1]> = {
  bash, c, cpp, csharp, css, diff, dockerfile, go, ini, java, javascript, json, kotlin,
  latex, lua, markdown, php, python, ruby, rust, scss, sql, swift, typescript, xml, yaml
}
for (const [name, def] of Object.entries(LANGS)) {
  hljs.registerLanguage(name, def)
}

// What people write after the opening fence, mapped to a registered language.
const ALIAS: Record<string, string> = {
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', tsx: 'typescript', mts: 'typescript',
  sh: 'bash', shell: 'bash', zsh: 'bash', fish: 'bash', console: 'bash',
  yml: 'yaml', html: 'xml', svg: 'xml', vue: 'xml', xhtml: 'xml',
  md: 'markdown', mdx: 'markdown', jsonc: 'json', json5: 'json',
  toml: 'ini', py: 'python', rb: 'ruby', rs: 'rust', cs: 'csharp', kt: 'kotlin',
  'c++': 'cpp', h: 'c', hpp: 'cpp', tex: 'latex', docker: 'dockerfile', patch: 'diff'
}

export type TocEntry = { depth: number; text: string; id: string }
export type RenderOptions = {
  mdx?: boolean
  /** The file's link reference definitions, for a piece of it drawn on its own (one edited block). */
  definitions?: string
  /** Only the outline, word count and definitions: no HTML is made, so math and code are not drawn. */
  metaOnly?: boolean
}

/** In front of every id the Markdown gives an element (headings, footnotes, HTML anchors), as on
 *  GitHub, so a heading such as "Outline" cannot take the id of a part of the editor. Links keep
 *  saying #outline; the editor adds the prefix when it follows one. */
export const ANCHOR_PREFIX = 'user-content-'

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', copy: '©', reg: '®', trade: '™',
  hellip: '…', mdash: '—', ndash: '–', middot: '·', bull: '•', laquo: '«', raquo: '»',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”'
}

/** HTML text as characters: &amp;, &#39; and &#x27; become &, ' and '. Unknown names stay as written. */
const decodeEntities = (s: string): string =>
  s.replace(/&(#\d{1,7}|#x[0-9a-f]{1,6}|[a-z][a-z0-9]{1,31});/gi, (all, ref: string) => {
    if (ref[0] !== '#') {
      return ENTITIES[ref.toLowerCase()] ?? all
    }
    const code = /^#x/i.test(ref) ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10)
    return code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff) ? String.fromCodePoint(code) : '\ufffd'
  })

const resolveLang = (lang: string | undefined): string | null => {
  const first = (lang ?? '').trim().split(/[\s{]/)[0].toLowerCase()
  const name = ALIAS[first] ?? first
  return name && hljs.getLanguage(name) ? name : null
}

const highlight = (code: string, lang: string | undefined): string => {
  const name = resolveLang(lang)
  if (!name) {
    return escapeHtml(code)
  }
  try {
    return hljs.highlight(code, { language: name, ignoreIllegals: true }).value
  } catch {
    return escapeHtml(code)
  }
}

// ---- raw HTML: allow a small, harmless set of tags and attributes; escape the rest ----

const SAFE_TAGS = new Set([
  'a', 'abbr', 'b', 'blockquote', 'br', 'caption', 'center', 'code', 'dd', 'del', 'details', 'div',
  'dl', 'dt', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'ins', 'kbd', 'li', 'mark',
  'ol', 'p', 'picture', 'pre', 'q', 's', 'samp', 'small', 'span', 'strong', 'sub', 'summary', 'sup',
  'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'u', 'ul'
])
const VOID_TAGS = new Set(['br', 'hr', 'img'])
const SAFE_ATTRS = new Set(['href', 'title', 'alt', 'src', 'align', 'width', 'height', 'open', 'colspan', 'rowspan', 'id', 'name'])

/** A link the page may hold: web and mail addresses, and addresses without a scheme (a path, a
 *  #section, a ?query). Other schemes (javascript:, data:, file:...) are refused, and so are control
 *  characters, which browsers drop from an address and so could hide a scheme. */
const safeUrl = (url: string): string | null => {
  const u = url.trim()
  if (/[\u0000-\u001f\u007f]/.test(u)) {
    return null
  }
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(u)
  return scheme === null || /^(?:https?|mailto)$/i.test(scheme[1]) ? u : null
}

// ---- images and badges ----
// The frame fetches nothing itself: an image is drawn as a placeholder whose data-img the editor
// (editor/images.ts) asks the plugin's worker for. Badges whose address says what they show are
// drawn as pills straight away.

const BADGE_HOST =
  /shields\.io|badgen\.net|badge\.fury\.io|codecov\.io|coveralls\.io|travis-ci\.(?:com|org)|circleci\.com|app\.codacy\.com|\/badge[./?]|\/badge\.svg|badge\.svg/i

const BADGE_COLORS: Record<string, string> = {
  brightgreen: 'green', green: 'green', yellowgreen: 'green', success: 'green',
  yellow: 'yellow', orange: 'orange', important: 'orange', red: 'pink', critical: 'pink',
  blue: 'blue', informational: 'blue', lightblue: 'cyan', cyan: 'cyan',
  purple: 'lav', blueviolet: 'lav', violet: 'lav', teal: 'mint',
  lightgrey: 'dim', lightgray: 'dim', grey: 'dim', gray: 'dim', inactive: 'dim'
}

const badgeColor = (raw: string | undefined): string => {
  const name = (raw ?? '').toLowerCase()
  if (BADGE_COLORS[name]) {
    return `var(--${BADGE_COLORS[name]})`
  }
  return /^[0-9a-f]{3}$|^[0-9a-f]{6}$/.test(name) ? `#${name}` : 'var(--lav)'
}

const unescapeShield = (s: string): string => {
  let text = s
  try {
    text = decodeURIComponent(s)
  } catch {
    // keep the raw text
  }
  // shields.io: "--" is a dash, "__" is an underscore, a single "_" is a space.
  return text.replace(/__/g, '\u0001').replace(/_/g, ' ').replace(/\u0001/g, '_')
}

const badgeHtml = (label: string, message: string, color: string, title: string, load = ''): string =>
  `<span class="badge"${load} title="${escapeHtml(title)}">` +
  (label ? `<span class="badge-l">${escapeHtml(label)}</span>` : '') +
  `<span class="badge-m" style="--b:${color}">${escapeHtml(message)}</span></span>`

/** img.shields.io/badge/<label>-<message>-<color>.svg says everything the badge shows. */
const staticBadge = (src: string): string | null => {
  const m = /\/badge\/([^?#]+)/i.exec(src)
  if (!m) {
    return null
  }
  const path = m[1].replace(/\.(svg|png)$/i, '').replace(/--/g, '\u0000')
  const parts = path.split('-').map((p) => unescapeShield(p.replace(/\u0000/g, '-')))
  if (parts.length === 3) {
    return badgeHtml(parts[0], parts[1], badgeColor(parts[2]), src)
  }
  if (parts.length === 2) {
    return badgeHtml('', parts[0], badgeColor(parts[1]), src)
  }
  return null
}

const IMG_SIZE = /^\d{1,4}(?:px|%)?$/

/** The attributes that let the editor load an image: its address (web, file: or a path), alt text
 *  and size. Nothing for an address of another kind. */
const loadAttrs = (alt: string, src: string, size: { width?: string; height?: string } = {}): string => {
  let s = src.trim().replace(/^<|>$/g, '')
  if (s.startsWith('//')) {
    s = `https:${s}`
  }
  const ok = s.length > 0 && s.length <= 4096 && (/^(?:https?|file):/i.test(s) || /^[a-z]:[\\/]/i.test(s) || !/^[a-z][a-z0-9+.-]*:/i.test(s))
  if (!ok) {
    return ''
  }
  let out = ` data-img="${escapeHtml(s)}" data-alt="${escapeHtml(alt)}"`
  if (size.width && IMG_SIZE.test(size.width.trim())) {
    out += ` data-w="${size.width.trim()}"`
  }
  if (size.height && IMG_SIZE.test(size.height.trim())) {
    out += ` data-h="${size.height.trim()}"`
  }
  return out
}

const imageHtml = (alt: string, src: string, size: { width?: string; height?: string } = {}): string => {
  // Pictures embedded in the Markdown (data: URIs) are drawn at once. The pattern keeps this to
  // base64 image data, so nothing else can ride in through `src`.
  if (/^data:image\/(?:png|jpe?g|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/i.test(src.trim())) {
    const img = `<img class="md-img" src="${src.trim()}" alt="${escapeHtml(alt)}">`
    // The alt text as a caption below; editor/images.ts draws loaded images the same way.
    return alt.trim() ? `<span class="md-fig">${img}<span class="md-cap">${escapeHtml(alt.trim())}</span></span>` : img
  }
  if (BADGE_HOST.test(src)) {
    const fixed = staticBadge(src)
    if (fixed) {
      return fixed
    }
    // A live badge (build status, version, license...): its text is only known to the server, so
    // until the real one loads show the alt text, split at "label: message" when it has that shape.
    const text = alt.trim() || 'badge'
    const split = /^(.{1,40}?):\s+(.+)$/.exec(text)
    const load = loadAttrs(alt, src)
    return split ? badgeHtml(split[1], split[2], 'var(--lav)', src, load) : badgeHtml('', text, 'var(--lav)', src, load)
  }
  return `<span class="img-ph"${loadAttrs(alt, src, size)} title="${escapeHtml(src)}"><span class="img-ph-icon">▣</span>${escapeHtml(alt || 'image')}</span>`
}

const cleanTag = (raw: string): string => {
  const m = /^<(\/?)([a-zA-Z][a-zA-Z0-9-]*)([\s\S]*?)(\/?)>$/.exec(raw)
  if (!m) {
    return escapeHtml(raw)
  }
  const [, closing, rawName, rest] = m
  const name = rawName.toLowerCase()
  if (!SAFE_TAGS.has(name)) {
    return escapeHtml(raw)
  }
  if (closing) {
    return VOID_TAGS.has(name) ? '' : `</${name}>`
  }
  const attrs: Record<string, string> = {}
  for (const a of rest.matchAll(/([a-zA-Z][\w:-]*)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) {
    const key = a[1].toLowerCase()
    if (SAFE_ATTRS.has(key) && !(key in attrs)) {
      // Values are HTML: &amp; is "&". Decoded here, checked, and escaped once when written.
      attrs[key] = decodeEntities(a[3] ?? a[4] ?? a[5] ?? '')
    }
  }
  if (name === 'img') {
    return imageHtml(attrs.alt ?? '', attrs.src ?? '', attrs)
  }
  let out = `<${name}`
  // <a name="install"> or id="...": somewhere a #link can jump to, named like the page's other anchors.
  const anchor = (attrs.id ?? (name === 'a' ? attrs.name : undefined) ?? '').trim()
  if (anchor) {
    out += ` id="${ANCHOR_PREFIX}${escapeHtml(anchor)}"`
  }
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'id' || key === 'name') {
      continue
    }
    if (key === 'href' || key === 'src') {
      const url = safeUrl(value)
      if (url === null) {
        continue
      }
      out += key === 'href' ? ` href="${escapeHtml(url)}" data-href="${escapeHtml(url)}"` : ''
    } else {
      out += ` ${key}="${escapeHtml(value)}"`
    }
  }
  return `${out}${VOID_TAGS.has(name) ? ' /' : ''}>`
}

const cleanHtml = (raw: string): string =>
  raw
    .split(/(<!--[\s\S]*?-->|<\/?[a-zA-Z][^>]*>)/)
    .map((part, i) => {
      if (i % 2 === 0) {
        return part.replace(/</g, '&lt;').replace(/>/g, '&gt;')
      }
      return part.startsWith('<!--') ? '' : cleanTag(part)
    })
    .join('')

// ---- MDX: import/export lines and JSX blocks are code, not prose (see splitMdx below) ----

const JSX_START = /^\s*(<>|<\/>|<\/?[A-Z][\w.]*|<[a-z][\w-]*\s[^>]*\{)/
// At column 0 only: a component on its own line(s), such as <Chart data={...} /> or </Tabs>.
const JSX_BLOCK_START = /^(<>|<\/>|<\/?[A-Z][\w.]*)/

// ---- callouts, like GitHub's  > [!NOTE]  (and Obsidian's extra kinds, with an optional title) ----

// Every kind maps to one of five looks.
const CALLOUT_LOOK: Record<string, string> = {
  note: 'note', info: 'note', abstract: 'note', summary: 'note', tldr: 'note', todo: 'note',
  tip: 'tip', hint: 'tip', success: 'tip', check: 'tip', done: 'tip',
  important: 'important', example: 'important', quote: 'important', cite: 'important',
  warning: 'warning', attention: 'warning', question: 'warning', help: 'warning', faq: 'warning',
  caution: 'caution', danger: 'caution', error: 'caution', failure: 'caution', fail: 'caution',
  missing: 'caution', bug: 'caution'
}
const CALLOUT_RE = new RegExp(
  `^<p>\\s*\\[!(${Object.keys(CALLOUT_LOOK).join('|')})\\][+-]?[ \\t]*((?:(?!<br\\s*/?>)[^\\n])*?)[ \\t]*(?:<br\\s*/?>|\\n|(?=</p>))\\s*`,
  'i'
)

// ---- math: $inline$, $$display$$ and ```math blocks, drawn by KaTeX ----

const renderMath = (tex: string, display: boolean, inParagraph = false): string => {
  try {
    const out = katex.renderToString(tex, {
      displayMode: display,
      throwOnError: false,
      errorColor: '#e06c84',
      strict: 'ignore',
      trust: false,
      maxSize: 30,
      maxExpand: 300,
      output: 'htmlAndMathml'
    })
    if (!display) {
      return `<span class="math-inline">${out}</span>`
    }
    // $$…$$ inside a sentence: a <div> there would end the paragraph, so the same box as a <span>.
    return inParagraph ? `<span class="math-block">${out}</span>` : `<div class="math-block">${out}</div>\n`
  } catch {
    return `<code class="ic">${escapeHtml(tex)}</code>`
  }
}

type MathToken = Tokens.Generic & { text: string; display: boolean }

// Same rules as most Markdown tools: the opening $ is not followed by a space, the closing $ is
// not preceded by a space or followed by a digit, so "costs $5 and $6" stays text.
const mathInline: TokenizerAndRendererExtension = {
  name: 'mathInline',
  level: 'inline',
  start: (src) => src.indexOf('$'),
  tokenizer(src): MathToken | undefined {
    const double = /^\$\$([^\n]+?)\$\$/.exec(src)
    if (double) {
      return { type: 'mathInline', raw: double[0], text: double[1].trim(), display: true }
    }
    const single = /^\$(?!\s)((?:\\.|[^\\$\n])+?)(?<!\s)\$(?!\d)/.exec(src)
    if (single) {
      return { type: 'mathInline', raw: single[0], text: single[1], display: false }
    }
    return undefined
  },
  renderer: (token) => renderMath((token as MathToken).text, (token as MathToken).display, true)
}

// $$, the formula and $$, with nothing after the closing $$ on its line. The formula holds no $$, so
// "$$a$$ and text" cannot run on to the next $$ further down.
const MATH_BLOCK = /^\$\$[ \t]*\n?((?:(?!\$\$)[\s\S])+?)\n?\$\$[ \t]*(?:\n|$)/

const mathBlock: TokenizerAndRendererExtension = {
  name: 'mathBlock',
  level: 'block',
  // Only where a whole block starts a line: stopping at any $$ would cut a sentence in two, and
  // "$$x$$" inside a sentence is mathInline's.
  start(src) {
    for (let i = src.indexOf('\n$$'); i >= 0; i = src.indexOf('\n$$', i + 1)) {
      if (MATH_BLOCK.test(src.slice(i + 1))) {
        return i + 1
      }
    }
    return undefined
  },
  tokenizer(src): MathToken | undefined {
    const m = MATH_BLOCK.exec(src)
    return m ? { type: 'mathBlock', raw: m[0], text: m[1].trim(), display: true } : undefined
  },
  renderer: (token) => renderMath((token as MathToken).text, true)
}


// ---- ==highlighted== text and :emoji: shortcodes ----

type InlineToken = Tokens.Generic & { text: string }

const markInline: TokenizerAndRendererExtension = {
  name: 'markInline',
  level: 'inline',
  start: (src) => src.indexOf('=='),
  tokenizer(src): InlineToken | undefined {
    const m = /^==(?=\S)((?:\\.|[^=\n\\]|=(?!=))+?)(?<=\S)==/.exec(src)
    return m ? { type: 'markInline', raw: m[0], text: m[1], tokens: this.lexer.inlineTokens(m[1]) } : undefined
  },
  renderer(token): string {
    return `<mark>${this.parser.parseInline(token.tokens ?? [])}</mark>`
  }
}

const emojiInline: TokenizerAndRendererExtension = {
  name: 'emojiInline',
  level: 'inline',
  // Only at a known shortcode: stopping at every ":" would cut "https://…" in two before marked
  // could make it a link.
  start(src) {
    for (const m of src.matchAll(/:(?=([a-z0-9_+-]+):)/g)) {
      if (Object.hasOwn(EMOJI, m[1])) {
        return m.index
      }
    }
    return undefined
  },
  tokenizer(src): InlineToken | undefined {
    const m = /^:([a-z0-9_+-]+):/.exec(src)
    return m && Object.hasOwn(EMOJI, m[1]) ? { type: 'emojiInline', raw: m[0], text: EMOJI[m[1]] } : undefined
  },
  renderer: (token) => (token as InlineToken).text
}

// ---- footnotes: text[^1] and, anywhere in the file, [^1]: the note ----

type Notes = { number: Map<string, number>; seenRef: Set<string> }
const noteId = (label: string): string => label.replace(/[^\w-]/g, '_')

/** Numbers the footnotes in the order they are first used. Needs the whole file, so it runs once up front. */
const scanNotes = (text: string): Notes => {
  const bare = text
    .replace(/^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:\n {0,3}\1[`~]*[ \t]*(?=\n|(?![\s\S]))|(?![\s\S]))/gm, '')
    .replace(/`[^`\n]*`/g, '')
  const defined = new Set<string>()
  const defs = bare.replace(/^\[\^([^\]\s]+)\]:/gm, (_all, label: string) => {
    defined.add(label)
    return ''
  })
  const number = new Map<string, number>()
  for (const m of defs.matchAll(/\[\^([^\]\s]+)\]/g)) {
    if (defined.has(m[1]) && !number.has(m[1])) {
      number.set(m[1], number.size + 1)
    }
  }
  for (const label of defined) {
    if (!number.has(label)) {
      number.set(label, number.size + 1) // a note nobody points to still gets a number
    }
  }
  return { number, seenRef: new Set() }
}

type NoteDef = Tokens.Generic & { label: string }

const footnoteExtensions = (notes: Notes): TokenizerAndRendererExtension[] => [
  {
    name: 'footnoteRef',
    level: 'inline',
    start: (src) => src.indexOf('[^'),
    tokenizer(src): NoteDef | undefined {
      const m = /^\[\^([^\]\s]+)\]/.exec(src)
      return m && notes.number.has(m[1]) ? { type: 'footnoteRef', raw: m[0], label: m[1] } : undefined
    },
    renderer(token): string {
      const label = (token as NoteDef).label
      const id = noteId(label)
      const first = !notes.seenRef.has(label)
      notes.seenRef.add(label)
      return (
        `<sup class="fn-ref"${first ? ` id="${ANCHOR_PREFIX}fnref-${id}"` : ''}>` +
        `<a href="#fn-${id}" data-href="#fn-${id}" title="Go to the note">${notes.number.get(label)}</a></sup>`
      )
    }
  },
  {
    name: 'footnoteDef',
    level: 'block',
    start: (src) => src.match(/^\[\^[^\]\s]+\]:/m)?.index,
    tokenizer(src): NoteDef | undefined {
      // The first line, then any lines (blank ones allowed) indented by two spaces or a tab.
      const m = /^\[\^([^\]\s]+)\]:[ \t]*([^\n]*(?:\n(?:[ \t]*\n)*(?: {2,}|\t)[^\n]*)*)(?:\n|$)/.exec(src)
      if (!m || !notes.number.has(m[1])) {
        return undefined
      }
      const text = m[2].replace(/\n(?: {1,4}|\t)/g, '\n')
      return { type: 'footnoteDef', raw: m[0], label: m[1], tokens: this.lexer.blockTokens(text, []) }
    },
    renderer(token): string {
      const label = (token as NoteDef).label
      const id = noteId(label)
      return (
        `<div class="fn-def" id="${ANCHOR_PREFIX}fn-${id}"><span class="fn-num">${notes.number.get(label)}</span>` +
        `<div class="fn-body">${this.parser.parse(token.tokens ?? [])}</div>` +
        `<a class="fn-back" href="#fnref-${id}" data-href="#fnref-${id}" title="Back to the text">↩</a></div>\n`
      )
    }
  }
]

// ---- front matter: simple YAML (key: value, [a, b] or a "- item" list) becomes a property list ----

type Prop = { key: string; values: string[]; list: boolean }

const unquote = (raw: string): { text: string; quoted: boolean } => {
  const v = raw.trim()
  // "double" allows backslash escapes, 'single' doubles its quote; either may be followed by a # comment.
  const dq = /^"((?:[^"\\]|\\.)*)"(?:\s+#.*)?$/.exec(v)
  if (dq) {
    return { text: dq[1].replace(/\\(.)/g, '$1'), quoted: true }
  }
  const sq = /^'((?:[^']|'')*)'(?:\s+#.*)?$/.exec(v)
  if (sq) {
    return { text: sq[1].replace(/''/g, "'"), quoted: true }
  }
  return { text: v.replace(/\s+#.*$/, ''), quoted: false }
}

const splitInlineList = (inner: string): string[] | null => {
  const out: string[] = []
  let cur = ''
  let quote = ''
  for (const ch of inner) {
    if (quote) {
      cur += ch
      quote = ch === quote ? '' : quote
    } else if (ch === '"' || ch === "'") {
      quote = ch
      cur += ch
    } else if (ch === '[' || ch === '{') {
      return null
    } else if (ch === ',') {
      out.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  if (quote) {
    return null
  }
  out.push(cur)
  return out.map((p) => p.trim()).filter((p) => p !== '')
}

/** null when the YAML is more than flat properties; the caller then shows it as code. */
const parseProps = (yamlText: string): Prop[] | null => {
  const props: Prop[] = []
  let openList: Prop | null = null
  for (const line of yamlText.split('\n')) {
    if (line.trim() === '' || /^\s*#/.test(line)) {
      continue
    }
    const item = /^\s*-(?:\s+(.*))?$/.exec(line)
    if (item) {
      if (!openList) {
        return null
      }
      if (/^[^"'\s][^"']*?:(\s|$)/.test(item[1] ?? '')) {
        return null // "- key: value" is a list of maps, not plain items
      }
      openList.values.push(item[1] ?? '')
      continue
    }
    const kv = /^([A-Za-z0-9_][\w .-]*?):(?:[ \t]+(.*))?$/.exec(line.trimEnd())
    if (!kv) {
      return null
    }
    const value = (kv[2] ?? '').trim()
    openList = null
    if (value === '') {
      openList = { key: kv[1], values: [], list: true }
      props.push(openList)
    } else if (/^[|>&*!{]/.test(value)) {
      return null
    } else if (value.startsWith('[')) {
      const inner = /^\[(.*)\]\s*$/.exec(value)
      const items = inner ? splitInlineList(inner[1]) : null
      if (!items) {
        return null
      }
      props.push({ key: kv[1], values: items, list: true })
    } else {
      props.push({ key: kv[1], values: [value], list: false })
    }
  }
  return props.length ? props : null
}

const propValue = (raw: string): string => {
  const { text, quoted } = unquote(raw)
  const kind = quoted
    ? 'str'
    : /^(true|false|yes|no|on|off)$/i.test(text)
      ? 'bool'
      : /^[-+]?\d[\d_.]*$/.test(text)
        ? 'num'
        : /^\d{4}-\d{2}-\d{2}(?:[T ][\d:.]+(?:Z|[-+]\d{2}:?\d{2})?)?$/.test(text)
          ? 'date'
          : /^(null|~)$/i.test(text)
            ? 'null'
            : 'str'
  return `<span class="v-${kind}">${escapeHtml(text)}</span>`
}

const frontMatterHtml = (yamlText: string): string => {
  const props = parseProps(yamlText)
  const head = '<div class="code-head"><span class="code-lang">front matter</span></div>'
  if (!props) {
    return `<div class="codeblock frontmatter">${head}<pre><code class="hljs">${highlight(yamlText, 'yaml')}</code></pre></div>\n`
  }
  const rows = props
    .map((p) => {
      const value = p.list
        ? p.values.length
          ? p.values.map((v) => `<span class="chip">${propValue(v)}</span>`).join('')
          : '<span class="v-null">empty</span>'
        : propValue(p.values[0])
      return `<div class="prop"><dt>${escapeHtml(p.key)}</dt><dd>${value}</dd></div>`
    })
    .join('')
  return `<div class="codeblock frontmatter compact"><dl class="props" title="front matter">${rows}</dl></div>\n`
}

// ---- main ----

/** A heading's text as the reader sees it: no HTML tags or pictures, and &amp; as "&". */
const plainText = (tokens: Token[]): string =>
  tokens
    .map((t): string => {
      if (t.type === 'html' || t.type === 'image' || t.type === 'br') {
        return ''
      }
      if ('tokens' in t && Array.isArray(t.tokens) && t.tokens.length > 0) {
        return plainText(t.tokens)
      }
      if (!('text' in t)) {
        return ''
      }
      return t.type === 'text' ? decodeEntities(String(t.text)) : String(t.text)
    })
    .join('')

type MarkedPage = { md: Marked; addHeading: (tokens: Token[], depth: number) => string }

const makeMarked = (toc: TocEntry[], seen: Map<string, number>, mdx: boolean, notes: Notes): MarkedPage => {
  const md = new Marked({ gfm: true, breaks: false })
  // GitHub's anchors (as github-slugger makes them): lower case, only letters, marks, digits, "_",
  // "-" and spaces kept, and each space a "-", so "Foo & Bar" is #foo--bar, "🚀 Launch" is #-launch
  // and "x²" is #x. A repeat takes the first free -1, -2...: "a", "a", "a-1" are #a, #a-1, #a-1-1.
  const slug = (text: string): string => {
    const base = text.toLowerCase().replace(/[^\p{Alphabetic}\p{M}\p{Nd}\p{Pc} -]/gu, '').replace(/ /g, '-') || 'section'
    let id = base
    while (seen.has(id)) {
      const n = (seen.get(base) ?? 0) + 1
      seen.set(base, n)
      id = `${base}-${n}`
    }
    seen.set(id, 0)
    return id
  }
  /** Lists a heading in the outline and gives its id. */
  const addHeading = (tokens: Token[], depth: number): string => {
    const plain = plainText(tokens)
    const id = slug(plain)
    toc.push({ depth, text: plain.replace(/\s+/g, ' ').trim(), id })
    return id
  }
  md.use({ extensions: [mathBlock, mathInline, markInline, emojiInline, ...footnoteExtensions(notes)] })
  md.use({
    renderer: {
      heading({ tokens, depth }: Tokens.Heading): string {
        const inner = this.parser.parseInline(tokens)
        const id = addHeading(tokens, depth)
        return `<h${depth} id="${ANCHOR_PREFIX}${id}"><a class="anchor" href="#${id}" data-href="#${id}">#</a>${inner}</h${depth}>\n`
      },
      code({ text, lang }: Tokens.Code): string {
        const info = (lang ?? '').trim()
        if (/^(math|katex)$/i.test(info)) {
          return renderMath(text, true)
        }
        if (/^mermaid$/i.test(info)) {
          // The editor draws the diagram after loading; until then (or if it fails) the source shows.
          return (
            `<div class="codeblock diagram-block"><div class="code-head"><span class="code-lang">mermaid</span>` +
            `<button class="copy" type="button">Copy</button></div>` +
            `<div class="diagram" data-src="${escapeHtml(text)}"><pre><code class="hljs">${escapeHtml(text)}</code></pre></div></div>\n`
          )
        }
        const label = info.split(/\s+/)[0] || 'text'
        const kind = /\bmdx-module\b/.test(info) ? ' mdx-module' : /\bmdx-jsx\b/.test(info) ? ' mdx-jsx' : ''
        const shown = kind === ' mdx-module' ? 'mdx · import / export' : kind ? 'mdx · component' : label
        return (
          `<div class="codeblock${kind}"><div class="code-head"><span class="code-lang">${escapeHtml(shown)}</span>` +
          `<button class="copy" type="button">Copy</button></div>` +
          `<pre><code class="hljs">${highlight(text.replace(/\n$/, ''), kind === ' mdx-jsx' ? 'xml' : info)}</code></pre></div>\n`
        )
      },
      codespan({ text }: Tokens.Codespan): string {
        // marked hands over the raw text; it must be escaped here or `<img onerror=...>` would run.
        return `<code class="ic">${escapeHtml(text)}</code>`
      },
      blockquote({ tokens }: Tokens.Blockquote): string {
        const body = this.parser.parse(tokens)
        const m = CALLOUT_RE.exec(body)
        if (m) {
          const kind = m[1].toLowerCase()
          const title = m[2].trim() || kind[0].toUpperCase() + kind.slice(1)
          const rest = body.replace(CALLOUT_RE, '<p>').replace(/^<p><\/p>\s*/, '')
          return `<div class="callout callout-${CALLOUT_LOOK[kind]}"><div class="callout-title">${title}</div>${rest}</div>\n`
        }
        return `<blockquote>${body}</blockquote>\n`
      },
      link({ href, title, tokens }: Tokens.Link): string {
        const inner = this.parser.parseInline(tokens)
        const url = safeUrl(href)
        if (url === null) {
          return inner
        }
        const t = title ? ` title="${escapeHtml(title)}"` : ''
        return `<a href="${escapeHtml(url)}" data-href="${escapeHtml(url)}"${t}>${inner}</a>`
      },
      image({ href, text }: Tokens.Image): string {
        return imageHtml(text, href)
      },
      html({ text, block }: Tokens.HTML | Tokens.Tag): string {
        if (mdx && JSX_START.test(text)) {
          if (!block) {
            return `<code class="ic">${escapeHtml(text)}</code>` // a component inside a sentence stays in it
          }
          return `<div class="codeblock mdx-jsx"><div class="code-head"><span class="code-lang">jsx</span></div><pre><code class="hljs">${highlight(text.replace(/\n+$/, ''), 'xml')}</code></pre></div>\n`
        }
        return cleanHtml(text)
      },
      table(token: Tokens.Table): string {
        const head = token.header
          .map((cell, i) => `<th${token.align[i] ? ` align="${token.align[i]}"` : ''}>${this.parser.parseInline(cell.tokens)}</th>`)
          .join('')
        const rows = token.rows
          .map(
            (row) =>
              `<tr>${row
                .map((cell, i) => `<td${token.align[i] ? ` align="${token.align[i]}"` : ''}>${this.parser.parseInline(cell.tokens)}</td>`)
                .join('')}</tr>`
          )
          .join('')
        return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>\n`
      },
      checkbox({ checked }: Tokens.Checkbox): string {
        // A button: the editor (editor/tasks.ts) ticks or clears it in the file on click.
        return `<button type="button" class="task ${checked ? 'done' : 'todo'}" aria-pressed="${checked}" aria-label="${checked ? 'Done' : 'To do'}"></button> `
      }
    }
  })
  return { md, addHeading }
}

/** highlight.js HTML for the code; used by the Live editor to color fenced code. */
export const highlightCode = (code: string, lang: string): string => highlight(code, lang)

// ---- blocks: the same page, cut into top-level pieces that each know their place in the file ----

/** One top-level piece of the page. `from` and `to` are offsets into the normalized text (line
 *  endings as \n), where text.slice(from, to) is exactly the Markdown that produced `html`. */
export type Block = { from: number; to: number; html: string }
export type BlockRender = {
  blocks: Block[]
  toc: TocEntry[]
  words: number
  /** The text's own link reference definitions ([id]: url), for `RenderOptions.definitions`. */
  definitions: string
}

type Segment = { text: string; offset: number; hoist?: 'module' | 'jsx' }

/** MDX: cuts the text into normal Markdown and the import/export/JSX runs shown as code. */
const splitMdx = (text: string): Segment[] => {
  const segments: Segment[] = []
  const lines = text.split('\n')
  let fence: string | null = null
  let offset = 0 // where the current line starts
  let normalFrom = 0
  const flush = (end: number): void => {
    if (end > normalFrom) {
      segments.push({ text: text.slice(normalFrom, end), offset: normalFrom })
    }
  }
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const f = /^\s{0,3}(`{3,}|~{3,})/.exec(line)
    if (f) {
      fence = fence === null ? f[1] : line.trim().startsWith(fence) ? null : fence
    } else if (fence === null) {
      const isModule = /^(import|export)\s/.test(line)
      if (isModule || JSX_BLOCK_START.test(line)) {
        const start = offset
        let length = 0
        let j = i
        while (j < lines.length && lines[j].trim() !== '') {
          length += lines[j].length + 1
          j++
        }
        flush(start)
        segments.push({ text: text.slice(start, start + length), offset: start, hoist: isModule ? 'module' : 'jsx' })
        offset = start + length
        normalFrom = offset
        i = j
        continue
      }
    }
    offset += line.length + 1
    i++
  }
  flush(text.length)
  return segments
}

// ---- HTML that wraps blocks: <p align="center"> or <details> with blank lines inside ----

type Piece = { from: number; to: number; source: string; html?: boolean; defs?: boolean }

const CONTAINER_TAGS = new Set([...SAFE_TAGS].filter((t) => !VOID_TAGS.has(t)))

/** How many elements a piece of raw HTML leaves open (negative when it closes more). */
const openTags = (html: string): number => {
  let depth = 0
  for (const m of html.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<(\/?)([a-zA-Z][\w-]*)\b[^>]*?(\/?)>/g)) {
    if (CONTAINER_TAGS.has(m[2].toLowerCase()) && !m[3]) {
      depth += m[1] ? -1 : 1
    }
  }
  return depth
}

/**
 * Markdown cuts `<p align="center">`, a blank line, an image, a blank line and `</p>` into three
 * pieces; GitHub joins their HTML back into one element. Drawn as separate blocks the browser would
 * close the tag at once and lose the centering, so from an HTML piece that opens a tag to the piece
 * that closes it is kept as one block. A tag that is never closed is left as it was.
 */
const joinWrappingHtml = (pieces: Piece[], text: string): Piece[] => {
  const out: Piece[] = []
  for (let i = 0; i < pieces.length; i++) {
    let depth = pieces[i].html ? openTags(pieces[i].source) : 0
    let j = i
    while (depth > 0 && j + 1 < pieces.length && j - i < 200) {
      j++
      if (pieces[j].html) {
        depth += openTags(pieces[j].source)
      }
    }
    if (j > i && depth <= 0) {
      out.push({ from: pieces[i].from, to: pieces[j].to, source: text.slice(pieces[i].from, pieces[j].to) })
      i = j
    } else {
      out.push(pieces[i])
    }
  }
  return out
}

const normLabel = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ')

/**
 * From link reference definitions, a function giving the ones a block may use: those whose label
 * the block writes as `[label]` (a shortcut, a collapsed or a full reference). A definition whose
 * label cannot be read is always given, so nothing that worked before is lost.
 */
const definitionPicker = (all: string): ((source: string) => string) => {
  if (all.trim() === '') {
    return () => ''
  }
  // One entry per definition; a title on the next line stays with its definition.
  const entries = all.split(/\n(?= {0,3}\[)/).map((text) => {
    const m = /^ {0,3}\[((?:[^\]\\]|\\.)+)\]:/.exec(text)
    return { text, label: m ? `[${normLabel(m[1])}]` : null }
  })
  return (source) => {
    if (!source.includes('[')) {
      return ''
    }
    const hay = normLabel(source)
    return entries
      .filter((e) => e.label === null || hay.includes(e.label))
      .map((e) => e.text)
      .join('\n')
  }
}

/** Walks marked's tokens in page order and lists each heading, as the renderer would. */
const collectHeadings = (tokens: Token[], addHeading: (tokens: Token[], depth: number) => string): void => {
  for (const t of tokens) {
    if (t.type === 'heading') {
      addHeading((t as Tokens.Heading).tokens, (t as Tokens.Heading).depth)
      continue
    }
    if (t.type === 'list') {
      for (const item of (t as Tokens.List).items) {
        collectHeadings(item.tokens, addHeading)
      }
    } else if ('tokens' in t && Array.isArray(t.tokens)) {
      collectHeadings(t.tokens, addHeading)
    }
  }
}

/**
 * Renders the page as blocks, so the editor can swap one block for an editable copy of its own
 * Markdown. Each block is parsed on its own; the link reference definitions are put in front of
 * every block that may use them, so reference links still work.
 */
export function renderBlocks(source: string, options: RenderOptions = {}): BlockRender {
  const mdx = options.mdx === true
  const text = source.replace(/\r\n?/g, '\n')
  const toc: TocEntry[] = []
  const { md, addHeading } = makeMarked(toc, new Map(), mdx, scanNotes(text))
  const blocks: Block[] = []
  const front = /^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(text)
  let base = 0
  if (front) {
    const raw = front[0].replace(/\s+$/, '')
    blocks.push({
      from: 0,
      to: raw.length,
      html: frontMatterHtml(front[1])
    })
    base = front[0].length
  }
  const body = text.slice(base)
  const segments: Segment[] = mdx ? splitMdx(body) : [{ text: body, offset: 0 }]
  const defs: string[] = []
  const pending: Piece[] = []
  for (const seg of segments) {
    if (seg.hoist) {
      const raw = seg.text.replace(/\s+$/, '')
      const fence = seg.hoist === 'module' ? 'js mdx-module' : 'jsx mdx-jsx'
      // A fence longer than any run of backticks inside, so a ``` in the component cannot close it.
      const ticks = '`'.repeat(Math.max(3, ...Array.from(raw.matchAll(/`+/g), (m) => m[0].length + 1)))
      pending.push({ from: base + seg.offset, to: base + seg.offset + raw.length, source: `${ticks}${fence}\n${raw}\n${ticks}\n` })
      continue
    }
    let at = 0 // where in seg.text the next token may start
    let fits = true
    const found: Piece[] = []
    // marked keeps no token for a link reference definition (only the link, for the parser), so the
    // text up to `end` may be definitions and blank lines; anything else and offsets are off. The
    // definitions draw nothing, so they get a block that shows them as written, to be clicked.
    const gap = (end: number): boolean => {
      const raw = seg.text.slice(at, end)
      const written = raw.trim()
      if (written === '') {
        return true
      }
      if (!md.lexer(raw).every((t) => t.type === 'space')) {
        return false
      }
      const from = base + seg.offset + at + raw.length - raw.trimStart().length
      found.push({ from, to: from + written.length, source: written, defs: true })
      defs.push(written)
      return true
    }
    for (const token of md.lexer(seg.text)) {
      const start = seg.text.startsWith(token.raw, at) ? at : seg.text.indexOf(token.raw, at)
      if (start < 0 || !gap(start)) {
        fits = false
        break
      }
      if (token.type !== 'space') {
        const trimmed = token.raw.replace(/\s+$/, '')
        const from = base + seg.offset + start
        found.push({ from, to: from + trimmed.length, source: trimmed, html: token.type === 'html' })
      }
      at = start + token.raw.length
    }
    if (fits && gap(seg.text.length)) {
      pending.push(...joinWrappingHtml(found, text))
    } else {
      // The parser's pieces do not add up to the text, so offsets cannot be trusted: one block.
      const whole = seg.text.replace(/\s+$/, '')
      if (whole.trim() !== '') {
        pending.push({ from: base + seg.offset, to: base + seg.offset + whole.length, source: whole })
      }
    }
  }
  const own = defs.join('\n')
  const all = [options.definitions ?? '', own].filter((d) => d.trim() !== '').join('\n')
  const usedBy = definitionPicker(all)
  for (const p of pending) {
    if (p.defs) {
      blocks.push({ from: p.from, to: p.to, html: `<div class="link-defs">${escapeHtml(p.source)}</div>\n` })
      continue
    }
    // In front, a blank line apart, where a code fence left open at the end cannot swallow them; and
    // only the ones this block may use, so a file with many references is not parsed again per block.
    const used = usedBy(p.source)
    const markdown = used ? `${used}\n\n${p.source}` : p.source
    if (options.metaOnly) {
      collectHeadings(md.lexer(markdown), addHeading)
      continue
    }
    blocks.push({ from: p.from, to: p.to, html: md.parse(markdown, { async: false }) as string })
  }
  blocks.sort((a, b) => a.from - b.from)
  const words = (body.match(/[\p{L}\p{N}'’-]+/gu) ?? []).length
  return { blocks, toc, words, definitions: own }
}

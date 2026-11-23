// Turns Markdown (or MDX) text into colored HTML. Bundled by tools/build.mjs into
// editor/vendor/render.js, because a plugin has no network and no bundler at run time.
import { Marked, type Tokens, type TokenizerAndRendererExtension } from 'marked'
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
export type RenderOptions = { mdx?: boolean }

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

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
const SAFE_ATTRS = new Set(['href', 'title', 'alt', 'src', 'align', 'width', 'height', 'open', 'colspan', 'rowspan'])

const safeUrl = (url: string): string | null => {
  const u = url.trim()
  return /^(https?:|mailto:|#|\/|\.{1,2}\/)/i.test(u) || /^[\w.-]+(\/[\w.@%+-]*)*$/.test(u) ? u : null
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
    if (SAFE_ATTRS.has(key)) {
      attrs[key] = a[3] ?? a[4] ?? a[5] ?? ''
    }
  }
  if (name === 'img') {
    return imageHtml(attrs.alt ?? '', attrs.src ?? '', attrs)
  }
  let out = `<${name}`
  for (const [key, value] of Object.entries(attrs)) {
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

const renderMath = (tex: string, display: boolean): string => {
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
    return display ? `<div class="math-block">${out}</div>\n` : `<span class="math-inline">${out}</span>`
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
  renderer: (token) => renderMath((token as MathToken).text, (token as MathToken).display)
}

const mathBlock: TokenizerAndRendererExtension = {
  name: 'mathBlock',
  level: 'block',
  start: (src) => src.indexOf('$$'),
  tokenizer(src): MathToken | undefined {
    const m = /^\$\$[ \t]*\n?([\s\S]+?)\n?\$\$[ \t]*(?:\n|$)/.exec(src)
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
  start: (src) => src.indexOf(':'),
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
        `<sup class="fn-ref"${first ? ` id="fnref-${id}"` : ''}>` +
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
        `<div class="fn-def" id="fn-${id}"><span class="fn-num">${notes.number.get(label)}</span>` +
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

const makeMarked = (toc: TocEntry[], seen: Map<string, number>, mdx: boolean, notes: Notes): Marked => {
  const md = new Marked({ gfm: true, breaks: false })
  const slug = (text: string): string => {
    const base =
      text.toLowerCase().replace(/<[^>]*>/g, '').replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-') ||
      'section'
    const n = seen.get(base) ?? 0
    seen.set(base, n + 1)
    return n === 0 ? base : `${base}-${n}`
  }
  md.use({ extensions: [mathBlock, mathInline, markInline, emojiInline, ...footnoteExtensions(notes)] })
  md.use({
    renderer: {
      heading({ tokens, depth }: Tokens.Heading): string {
        const inner = this.parser.parseInline(tokens)
        const plain = tokens.map((t) => ('text' in t ? String(t.text) : '')).join('')
        const id = slug(plain)
        toc.push({ depth, text: plain, id })
        return `<h${depth} id="${id}"><a class="anchor" href="#${id}" data-href="#${id}">#</a>${inner}</h${depth}>\n`
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
      html({ text }: Tokens.HTML | Tokens.Tag): string {
        if (mdx && JSX_START.test(text)) {
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
  return md
}

/** highlight.js HTML for the code; used by the Live editor to color fenced code. */
export const highlightCode = (code: string, lang: string): string => highlight(code, lang)

// ---- blocks: the same page, cut into top-level pieces that each know their place in the file ----

/** One top-level piece of the page. `from` and `to` are offsets into the normalized text (line
 *  endings as \n), where text.slice(from, to) is exactly the Markdown that produced `html`. */
export type Block = { from: number; to: number; html: string }
export type BlockRender = { blocks: Block[]; toc: TocEntry[]; words: number }

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

type Piece = { from: number; to: number; source: string; html?: boolean }

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

/**
 * Renders the page as blocks, so the editor can swap one block for an editable copy of its own
 * Markdown. Each block is parsed on its own; link definitions are added to every block so
 * reference links still work.
 */
export function renderBlocks(source: string, options: RenderOptions = {}): BlockRender {
  const mdx = options.mdx === true
  const text = source.replace(/\r\n?/g, '\n')
  const toc: TocEntry[] = []
  const md = makeMarked(toc, new Map(), mdx, scanNotes(text))
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
  const pending: { from: number; to: number; source: string }[] = []
  for (const seg of segments) {
    if (seg.hoist) {
      const raw = seg.text.replace(/\s+$/, '')
      const fence = seg.hoist === 'module' ? 'js mdx-module' : 'jsx mdx-jsx'
      pending.push({ from: base + seg.offset, to: base + seg.offset + raw.length, source: '```' + fence + '\n' + raw + '\n```\n' })
      continue
    }
    let pos = seg.offset
    const found: Piece[] = []
    for (const token of md.lexer(seg.text)) {
      const raw = token.raw
      if (token.type === 'def') {
        defs.push(raw.replace(/\s+$/, ''))
      } else if (token.type !== 'space') {
        const trimmed = raw.replace(/\s+$/, '')
        found.push({ from: base + pos, to: base + pos + trimmed.length, source: trimmed, html: token.type === 'html' })
      }
      pos += raw.length
    }
    if (pos - seg.offset === seg.text.length) {
      pending.push(...joinWrappingHtml(found, text))
    } else {
      // The parser's pieces do not add up to the text, so offsets cannot be trusted: one block.
      const whole = seg.text.replace(/\s+$/, '')
      if (whole.trim() !== '') {
        pending.push({ from: base + seg.offset, to: base + seg.offset + whole.length, source: whole })
      }
    }
  }
  const definitions = defs.length ? `\n\n${defs.join('\n')}\n` : ''
  for (const p of pending) {
    blocks.push({ from: p.from, to: p.to, html: md.parse(p.source + definitions, { async: false }) as string })
  }
  blocks.sort((a, b) => a.from - b.from)
  const words = (body.match(/[\p{L}\p{N}'’-]+/gu) ?? []).length
  return { blocks, toc, words }
}

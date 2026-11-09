import { renderMarkdown } from './vendor/render.js'
import KATEX_CSS from './vendor/katex-css.js'
import { renderDiagrams } from './diagrams'
import { CSS } from './styles'
import { start } from './sync'

// Orca does not tell a plugin frame which fonts the person picked, so fonts are plugin settings
// (Settings → Plugins → Markdown Colorize). The toolbar buttons write the same settings.
type Mode = 'auto' | 'dark' | 'light'
type Prefs = {
  outline: boolean
  vivid: boolean
  wide: boolean
  mode: Mode
  textFont: string
  codeFont: string
  fontSize: number
}


const DEFAULT_PREFS: Prefs = { outline: false, vivid: true, wide: true, mode: 'auto', textFont: '', codeFont: '', fontSize: 15 }

const readPrefs = async (): Promise<Prefs> => {
  try {
    const s = await orca.settings.get()
    const size = Number(s.fontSize)
    return {
      outline: s.showOutline === true,
      vivid: s.colorStyle !== 'dim',
      wide: s.contentWidth !== 'narrow',
      mode: s.themeMode === 'dark' || s.themeMode === 'light' ? s.themeMode : 'auto',
      textFont: typeof s.textFont === 'string' ? s.textFont : '',
      codeFont: typeof s.codeFont === 'string' ? s.codeFont : '',
      fontSize: Number.isFinite(size) && size >= 11 && size <= 28 ? size : DEFAULT_PREFS.fontSize
    }
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

/** "Inter" or "Inter, Helvetica" becomes a safe font-family list; anything odd is dropped. */
const fontStack = (input: string, fallback: string): string => {
  const names = input
    .split(',')
    .map((n) => n.replace(/["'`;{}()<>\\/@:]/g, '').trim())
    .filter((n) => n.length > 0 && n.length <= 64)
    .slice(0, 6)
  return names.length ? `${names.map((n) => `"${n}"`).join(', ')}, ${fallback}` : fallback
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text = ''): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    node.setAttribute(k, v)
  }
  node.textContent = text
  return node
}

/** Shows the open file as colored, read-only Markdown. Edit it in the Source view. */
export async function mountViewer(options: { mdx: boolean }): Promise<void> {
  const style = el('style')
  style.textContent = KATEX_CSS + CSS
  document.head.append(style)

  const prefs = await readPrefs()
  const shell = el('div', { id: 'shell' })
  const bar = el('div', { id: 'bar' })
  const info = el('span', {}, '')
  const outlineBtn = el('button', { type: 'button', title: 'Show or hide the headings list' }, 'Outline')
  const widthBtn = el('button', { type: 'button', title: 'Limit the text to a comfortable reading width' }, 'Narrow')
  const paletteBtn = el('button', { type: 'button', title: 'Soften the colors' }, 'Dim')
  const modeBtns = (['auto', 'dark', 'light'] as const).map((m) =>
    el('button', { type: 'button', 'data-mode': m, title: m === 'auto' ? "Follow Orca's theme" : `Always ${m}` }, m[0].toUpperCase() + m.slice(1))
  )
  const modeGroup = el('span', { class: 'seg', role: 'group', 'aria-label': 'Theme' })
  modeGroup.append(...modeBtns)
  bar.append(info, el('span', { class: 'grow' }), outlineBtn, modeGroup, widthBtn, paletteBtn)
  const main = el('div', { id: 'main' })
  const scroll = el('div', { id: 'scroll' })
  const docEl = el('article', { id: 'doc' })
  const outline = el('nav', { id: 'outline', 'aria-label': 'Outline' })
  scroll.append(docEl)
  main.append(scroll, outline)
  shell.append(bar, main)
  document.body.append(shell)

  let lastLook = ''
  const applyPrefs = (): void => {
    const root = document.documentElement
    root.classList.toggle('vivid', prefs.vivid)
    root.style.setProperty('--md-width', prefs.wide ? 'none' : '820px')
    widthBtn.setAttribute('aria-pressed', String(!prefs.wide))
    // Orca stamps `light` or `dark` on <html>; "Auto" copies it, "Dark" and "Light" ignore it.
    const shown = prefs.mode === 'auto' ? (root.classList.contains('light') ? 'light' : 'dark') : prefs.mode
    root.classList.toggle('mode-light', shown === 'light')
    root.classList.toggle('force-dark', prefs.mode === 'dark')
    root.classList.toggle('force-light', prefs.mode === 'light')
    for (const b of modeBtns) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-mode') === prefs.mode))
    }
    root.style.setProperty('--md-size', `${prefs.fontSize}px`)
    root.style.setProperty(
      '--md-text-font',
      fontStack(prefs.textFont, 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif')
    )
    root.style.setProperty(
      '--md-code-font',
      fontStack(prefs.codeFont, 'ui-monospace, "SF Mono", Menlo, Consolas, monospace')
    )
    const look = [prefs.mode, prefs.vivid, shown, prefs.textFont, prefs.fontSize].join('|')
    if (look !== lastLook) {
      lastLook = look
      void renderDiagrams(docEl) // diagrams take their colors from the page, so they redraw with it
    }
    outline.hidden = !prefs.outline
    outlineBtn.setAttribute('aria-pressed', String(prefs.outline))
    paletteBtn.setAttribute('aria-pressed', String(!prefs.vivid))
  }
  const remember = (key: string, value: string | boolean): void => {
    orca.settings.set(key, value).catch(() => {
      // The choice still applies for this tab; it just is not saved.
    })
  }
  outlineBtn.addEventListener('click', () => {
    prefs.outline = !prefs.outline
    remember('showOutline', prefs.outline)
    applyPrefs()
  })
  for (const b of modeBtns) {
    b.addEventListener('click', () => {
      prefs.mode = b.getAttribute('data-mode') as Mode
      remember('themeMode', prefs.mode)
      applyPrefs()
    })
  }
  widthBtn.addEventListener('click', () => {
    prefs.wide = !prefs.wide
    remember('contentWidth', prefs.wide ? 'full' : 'narrow')
    applyPrefs()
  })
  paletteBtn.addEventListener('click', () => {
    prefs.vivid = !prefs.vivid
    remember('colorStyle', prefs.vivid ? 'vivid' : 'dim')
    applyPrefs()
  })
  applyPrefs()
  // Orca switching its theme (or rewriting <html>'s classes) must not undo "Auto", "Dark" or "Light".
  orca.on('theme', () => applyPrefs())
  new MutationObserver(() => applyPrefs()).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  // A change made in Settings reaches every open Colorized tab.
  orca.settings.onDidChange(() => {
    void readPrefs().then((next) => {
      Object.assign(prefs, next)
      applyPrefs()
    })
  })

  const draw = (text: string): void => {
    const keep = scroll.scrollTop
    if (text.trim() === '') {
      docEl.replaceChildren(el('p', { class: 'empty' }, 'This file is empty.'))
      outline.replaceChildren()
      info.textContent = ''
      return
    }
    let rendered: ReturnType<typeof renderMarkdown>
    try {
      rendered = renderMarkdown(text, { mdx: options.mdx })
    } catch {
      // Extremely nested input can overflow the parser; show a note instead of a blank page.
      docEl.replaceChildren(el('p', { class: 'empty' }, 'This file is too complex to draw here. Open the Source view.'))
      outline.replaceChildren()
      info.textContent = ''
      return
    }
    const { html, toc, words } = rendered
    docEl.innerHTML = html // renderMarkdown escapes raw HTML except a short allow list
    outline.replaceChildren(
      ...toc.map((h) => {
        const a = el('a', { href: `#${h.id}`, 'data-href': `#${h.id}`, class: `d${h.depth}` }, h.text)
        return a
      })
    )
    info.textContent = `${words.toLocaleString()} words · ${Math.max(1, Math.round(words / 220))} min read`
    scroll.scrollTop = keep
    void renderDiagrams(docEl)
  }

  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement
    const copy = target.closest<HTMLButtonElement>('.copy')
    if (copy) {
      const block = copy.closest('.codeblock')
      const code = block?.querySelector('[data-src]')?.getAttribute('data-src') ?? block?.querySelector('code')?.textContent ?? ''
      navigator.clipboard
        ?.writeText(code)
        .then(() => {
          copy.textContent = 'Copied'
          setTimeout(() => (copy.textContent = 'Copy'), 1200)
        })
        .catch(() => {
          copy.textContent = 'Blocked'
        })
      return
    }
    const link = target.closest<HTMLElement>('[data-href]')
    if (!link) {
      return
    }
    event.preventDefault()
    const url = link.getAttribute('data-href') ?? ''
    if (url.startsWith('#')) {
      document.getElementById(decodeURIComponent(url.slice(1)))?.scrollIntoView({ block: 'start' })
    } else if (/^(https?:|mailto:)/i.test(url)) {
      void orca.shell?.openExternal(url)
    }
  })

  const doc = await start()
  draw(doc.value)
  doc.onReplace(draw)
}

import { highlightCode, renderBlocks, type Block } from './vendor/render.js'
import KATEX_CSS from './vendor/katex-css.js'
import type { LiveEditor, LiveOptions } from './vendor/live.js'
import { renderDiagrams } from './diagrams'
import { mountFind } from './find'
import { PageHistory } from './history'
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

/**
 * Shows the open file as colored Markdown. Click a block (a paragraph, heading, list, code block...)
 * and that block turns into an editor for its own Markdown; click away and it is drawn again.
 * `editor` makes the blocks editable; it is passed in so a view without it never loads CodeMirror.
 */
export async function mountViewer(options: {
  mdx: boolean
  editor?: (parent: HTMLElement, options: LiveOptions) => LiveEditor
}): Promise<void> {
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
  const find = mountFind({ bar, before: outlineBtn, docEl })

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

  const blockHtml = (b: Block, shift = 0): string =>
    `<div class="blk" tabindex="-1" data-from="${b.from + shift}" data-to="${b.to + shift}">${b.html}</div>`
  const ensureTabStop = (): void => {
    if (!docEl.querySelector('.blk[tabindex="0"]')) {
      docEl.querySelector<HTMLElement>('.blk')?.setAttribute('tabindex', '0')
    }
  }
  const showOutline = (toc: { depth: number; text: string; id: string }[]): void => {
    outline.replaceChildren(
      ...toc.map((h) => el('a', { href: `#${h.id}`, 'data-href': `#${h.id}`, class: `d${h.depth}` }, h.text))
    )
  }
  const showInfo = (words: number): void => {
    info.textContent = words === 0 ? '' : `${words.toLocaleString()} words · ${Math.max(1, Math.round(words / 220))} min read`
  }
  const EMPTY = '<div class="blk blk-empty" tabindex="0" data-from="0" data-to="0"><p class="empty">This file is empty. Click to start writing.</p></div>'

  const draw = (text: string): void => {
    const keep = scroll.scrollTop
    if (text.trim() === '') {
      docEl.innerHTML = EMPTY
      outline.replaceChildren()
      showInfo(0)
      return
    }
    let rendered: ReturnType<typeof renderBlocks>
    try {
      rendered = renderBlocks(text, { mdx: options.mdx })
    } catch {
      // Extremely nested input can overflow the parser; show a note instead of a blank page.
      docEl.replaceChildren(el('p', { class: 'empty' }, 'This file is too complex to draw here. Open the Source view.'))
      outline.replaceChildren()
      showInfo(0)
      return
    }
    docEl.innerHTML = rendered.blocks.map((b) => blockHtml(b)).join('') // raw HTML in it is already cleaned
    showOutline(rendered.toc)
    showInfo(rendered.words)
    ensureTabStop()
    scroll.scrollTop = keep
    void renderDiagrams(docEl)
    find.refresh()
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
  const eol = doc.value.includes('\r\n') ? '\r\n' : '\n' // line endings are kept as the file had them
  const norm = (t: string): string => t.replace(/\r\n?/g, '\n')
  let current = norm(doc.value)
  const canEdit = options.editor !== undefined && !doc.readOnly
  docEl.classList.toggle('editable', canEdit)

  type Editing = { el: HTMLElement; editor: LiveEditor; pre: string; post: string; originalLength: number }
  let editing: Editing | null = null
  const history = new PageHistory()
  let sessionBefore = current
  // Curved arrows drawn as SVG, so they look the same with any font.
  const arrow = (d: string): string =>
    `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:block"><path d="${d}"/></svg>`
  const undoBtn = el('button', { type: 'button', class: 'icon', title: 'Undo the last edit (Ctrl/Cmd+Z)', 'aria-label': 'Undo' })
  const redoBtn = el('button', { type: 'button', class: 'icon', title: 'Redo (Ctrl/Cmd+Shift+Z)', 'aria-label': 'Redo' })
  undoBtn.innerHTML = arrow('M5.5 3 2.5 6l3 3M2.5 6H9a4.5 4.5 0 0 1 0 9H6')
  redoBtn.innerHTML = arrow('M10.5 3l3 3-3 3M13.5 6H7a4.5 4.5 0 0 0 0 9h3')
  undoBtn.hidden = redoBtn.hidden = !canEdit
  bar.insertBefore(undoBtn, outlineBtn)
  bar.insertBefore(redoBtn, outlineBtn)
  const syncHistoryButtons = (): void => {
    undoBtn.disabled = !history.canUndo
    redoBtn.disabled = !history.canRedo
  }
  syncHistoryButtons()
  let redrawTimer: ReturnType<typeof setTimeout> | undefined

  const refreshMeta = (): void => {
    try {
      const { toc, words } = renderBlocks(current, { mdx: options.mdx })
      showOutline(toc)
      showInfo(words)
    } catch {
      // nothing to update
    }
  }

  /** Where in a block's Markdown a click landed: lines up the text before the click with the source, skipping symbols. */
  const sourceOffsetAt = (blk: HTMLElement, x: number, y: number, raw: string): number => {
    if (blk.querySelector('.codeblock, .table-wrap, .diagram, .katex-display, .math-block, .callout')) {
      return raw.length
    }
    try {
      const probe = document as unknown as { caretRangeFromPoint?: (x: number, y: number) => Range | null }
      const caret = probe.caretRangeFromPoint?.(x, y)
      if (!caret || !blk.contains(caret.startContainer)) {
        return raw.length
      }
      const before = document.createRange()
      before.setStart(blk, 0)
      before.setEnd(caret.startContainer, caret.startOffset)
      let i = 0
      for (const ch of before.toString().replace(/\s+/g, ' ')) {
        if (ch === ' ') {
          continue
        }
        const next = raw.indexOf(ch, i)
        if (next < 0 || next - i > 120) {
          return raw.length // symbols and text did not line up; the end is a safe place
        }
        i = next + 1
      }
      return Math.min(raw.length, i)
    } catch {
      return raw.length
    }
  }

  const save = (): void => {
    doc.change(eol === '\n' ? current : current.replace(/\n/g, '\r\n'))
  }

  const escapeText = (t: string): string => t.replace(/[&<>]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'))

  const endEdit = (focusResult = false): void => {
    if (!editing) {
      return
    }
    const { el: box, editor, pre, post, originalLength } = editing
    const text = editor.getText()
    editing = null
    editor.destroy()
    history.record(sessionBefore, current) // one undo step per editing session
    syncHistoryButtons()
    // Blocks after this one moved by however much the text grew or shrank.
    const delta = text.length - originalLength
    let next = box.nextElementSibling as HTMLElement | null
    while (next) {
      if (next.dataset.from !== undefined) {
        next.dataset.from = String(Number(next.dataset.from) + delta)
        next.dataset.to = String(Number(next.dataset.to) + delta)
      }
      next = next.nextElementSibling as HTMLElement | null
    }
    let hasHeading = false
    if (text.trim() === '') {
      box.remove()
    } else {
      let pieces: Block[] = []
      try {
        pieces = renderBlocks(text, { mdx: options.mdx }).blocks
      } catch {
        pieces = []
      }
      hasHeading = pieces.some((b) => /^<h[1-6]\b/.test(b.html))
      box.outerHTML = pieces.length
        ? pieces.map((b) => blockHtml(b, pre.length)).join('')
        : `<div class="blk" tabindex="-1" data-from="${pre.length}" data-to="${pre.length + text.length}"><p>${escapeText(text)}</p></div>`
    }
    if (!docEl.querySelector('.blk')) {
      docEl.innerHTML = EMPTY
    }
    refreshMeta()
    void renderDiagrams(docEl)
    find.refresh()
    ensureTabStop()
    if (focusResult) {
      docEl.querySelector<HTMLElement>(`.blk[data-from="${pre.length}"]`)?.focus() // Esc keeps you in the keyboard flow
    }
    // Headings are numbered across the whole page, so redraw it once typing has stopped.
    clearTimeout(redrawTimer)
    if (hasHeading) {
      redrawTimer = setTimeout(() => {
        if (!editing && current === pre + text + post) {
          draw(current)
        }
      }, 400)
    }
  }

  const startEdit = (blk: HTMLElement | null, x: number, y: number, place?: 'start' | 'end'): void => {
    if (!canEdit || !options.editor) {
      return
    }
    endEdit()
    clearTimeout(redrawTimer)
    let box: HTMLElement
    let from: number
    let to: number
    let prefix = ''
    const existing = blk !== null && !blk.classList.contains('blk-empty')
    if (blk && existing) {
      box = blk
      from = Number(blk.dataset.from)
      to = Number(blk.dataset.to)
    } else {
      // A new block at the end of the file (or the first block of an empty one).
      blk?.remove()
      from = to = current.length
      prefix = current === '' || current.endsWith('\n\n') ? '' : current.endsWith('\n') ? '\n' : '\n\n'
      box = document.createElement('div')
      box.className = 'blk'
      docEl.append(box)
    }
    if (!(from >= 0 && to >= from && to <= current.length)) {
      return
    }
    const raw = current.slice(from, to)
    sessionBefore = current
    const cursor = place === 'start' ? 0 : place === 'end' || !blk || !existing ? raw.length : sourceOffsetAt(blk, x, y, raw)
    const pre = current.slice(0, from) + prefix
    const post = current.slice(to)
    box.classList.add('editing')
    box.replaceChildren()
    const editor = options.editor(box, {
      doc: raw,
      highlight: highlightCode,
      onChange: (text) => {
        current = pre + text + post
        save()
        showInfo((current.match(/[\p{L}\p{N}'’-]+/gu) ?? []).length)
      },
      onOpenLink: (url) => {
        if (/^(https?:|mailto:)/i.test(url)) {
          void orca.shell?.openExternal(url) // needs the click that got us here
        }
      },
      onExit: () => endEdit(true),
      onBoundary: (direction) => {
        // Arrow past the first or last line: carry on into the neighboring block.
        const box = editing?.el
        let target = box ? (direction === 'down' ? box.nextElementSibling : box.previousElementSibling) : null
        while (target && !target.classList.contains('blk')) {
          target = direction === 'down' ? target.nextElementSibling : target.previousElementSibling
        }
        if (target instanceof HTMLElement && !target.classList.contains('blk-empty')) {
          endEdit()
          startEdit(target, 0, 0, direction === 'down' ? 'start' : 'end')
        }
      }
    })
    editing = { el: box, editor, pre, post, originalLength: to - from }
    box.addEventListener('focusout', (event) => {
      const moved = event.relatedTarget as Node | null
      // Leaving the window is not leaving the block; stay in it until focus really moves.
      if (editing && editing.el === box && !(moved && box.contains(moved)) && (moved !== null || document.hasFocus())) {
        endEdit()
      }
    })
    editor.setCursor(cursor)
    editor.focus()
  }

  // Which block was pressed is decided on mouse down, before another block finishes editing and
  // the page shifts under the pointer.
  let pressed: { blk: HTMLElement | null; interactive: boolean; x: number; y: number } | null = null
  scroll.addEventListener(
    'mousedown',
    (event) => {
      const target = event.target as HTMLElement
      if (event.button !== 0 || (editing && editing.el.contains(target))) {
        pressed = null
        return
      }
      pressed = {
        blk: target.closest<HTMLElement>('.blk'),
        interactive: !!target.closest('a, button, [data-href], .copy, .anchor, summary, input, select, textarea'),
        x: event.clientX,
        y: event.clientY
      }
    },
    true
  )
  scroll.addEventListener('mouseup', (event) => {
    const p = pressed
    pressed = null
    if (!p || !canEdit || p.interactive) {
      return
    }
    if (Math.abs(event.clientX - p.x) > 4 || Math.abs(event.clientY - p.y) > 4) {
      return // a drag to select text
    }
    if (!window.getSelection()?.isCollapsed) {
      return
    }
    const target = event.target as HTMLElement
    if (!p.blk) {
      // The empty space around the text: start a new block at the end of the file.
      if (target === scroll || target === docEl) {
        startEdit(null, p.x, p.y)
      }
      return
    }
    if (p.blk.isConnected) {
      startEdit(p.blk, p.x, p.y)
    }
  })

  // ---- undo and redo for the whole page (a block's own editor keeps history only while it is open)
  const stepHistory = (kind: 'undo' | 'redo'): void => {
    if (editing) {
      return
    }
    const result = kind === 'undo' ? history.undo(current) : history.redo(current)
    syncHistoryButtons()
    if (!result) {
      return
    }
    clearTimeout(redrawTimer)
    current = result.text
    save()
    draw(current)
    const touched = Array.from(docEl.querySelectorAll<HTMLElement>('.blk')).find(
      (b) => Number(b.dataset.from) <= result.at && result.at <= Number(b.dataset.to)
    )
    touched?.scrollIntoView({ block: 'nearest' })
  }
  undoBtn.addEventListener('click', () => stepHistory('undo'))
  redoBtn.addEventListener('click', () => stepHistory('redo'))
  document.addEventListener('keydown', (event) => {
    if (!canEdit || !(event.ctrlKey || event.metaKey) || event.altKey) {
      return
    }
    const target = event.target as HTMLElement
    if (editing || target.closest('input, textarea, .cm-editor')) {
      return // those have their own undo
    }
    const key = event.key.toLowerCase()
    if (key === 'z' || key === 'y') {
      event.preventDefault()
      stepHistory(key === 'y' || event.shiftKey ? 'redo' : 'undo')
    }
  })

  // ---- keyboard: Tab reaches the page, arrows move between blocks, Enter edits the one in focus
  const blocksList = (): HTMLElement[] => Array.from(docEl.querySelectorAll<HTMLElement>('.blk'))
  docEl.addEventListener('focusin', (event) => {
    const t = event.target as HTMLElement
    if (t.classList?.contains('blk')) {
      docEl.querySelectorAll('.blk[tabindex="0"]').forEach((b) => b.setAttribute('tabindex', '-1'))
      t.setAttribute('tabindex', '0')
    }
  })
  docEl.addEventListener('keydown', (event) => {
    const blk = event.target as HTMLElement
    if (!blk.classList?.contains('blk') || event.ctrlKey || event.metaKey || event.altKey) {
      return // keys typed inside an editor or a link are not ours
    }
    const list = blocksList()
    const at = list.indexOf(blk)
    const go = (to: HTMLElement | undefined): void => {
      if (to) {
        event.preventDefault()
        to.focus()
        to.scrollIntoView({ block: 'nearest' })
      }
    }
    if (event.key === 'ArrowDown') {
      go(list[at + 1])
    } else if (event.key === 'ArrowUp') {
      go(list[at - 1])
    } else if (event.key === 'Home') {
      go(list[0])
    } else if (event.key === 'End') {
      go(list[list.length - 1])
    } else if ((event.key === 'Enter' || event.key === 'F2') && canEdit) {
      event.preventDefault()
      startEdit(blk, 0, 0, 'start')
    }
  })

  draw(current)
  doc.onReplace((text) => {
    // The file changed somewhere else (an agent, another editor); your typing is already merged in.
    clearTimeout(redrawTimer)
    if (editing) {
      editing.editor.destroy()
      editing = null
    }
    current = norm(text)
    history.clear() // steps made before another tool changed the file may no longer fit it
    syncHistoryButtons()
    draw(current)
  })
}

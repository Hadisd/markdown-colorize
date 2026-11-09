// Find in the page: Ctrl/Cmd+F or the Find button opens a bar; matches are marked with the browser's
// highlight feature, so the text itself is never changed. Matches that span bold or link markup are
// found too, because each block's text is searched as one string.

type HighlightRegistry = { set(name: string, value: unknown): void; delete(name: string): void }
const registry = (): HighlightRegistry | null => {
  const css = (globalThis as unknown as { CSS?: { highlights?: HighlightRegistry } }).CSS
  const Highlight = (globalThis as unknown as { Highlight?: unknown }).Highlight
  return css?.highlights && typeof Highlight === 'function' ? css.highlights : null
}
const makeHighlight = (ranges: Range[]): unknown => {
  const Highlight = (globalThis as unknown as { Highlight: new (...r: Range[]) => unknown }).Highlight
  return new Highlight(...ranges)
}

const MAX_MATCHES = 5000

/** Every case-insensitive occurrence of `query` under `root`, block by block. Exported for tests. */
export function findRanges(root: HTMLElement, query: string): Range[] {
  const out: Range[] = []
  if (query === '') {
    return out
  }
  const blocks = Array.from(root.querySelectorAll<HTMLElement>('.blk'))
  for (const block of blocks.length ? blocks : [root]) {
    const nodes: Text[] = []
    const starts: number[] = []
    let text = ''
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement?.closest('.copy, script, style') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT)
    })
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      nodes.push(n as Text)
      starts.push(text.length)
      text += (n as Text).data
    }
    if (text === '') {
      continue
    }
    const folded = text.toLowerCase().length === text.length // some letters change length when lowercased
    const hay = folded ? text.toLowerCase() : text
    const needle = folded ? query.toLowerCase() : query
    const locate = (pos: number, isEnd: boolean): { node: Text; offset: number } => {
      const p = isEnd ? pos - 1 : pos
      let lo = 0
      let hi = starts.length - 1
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1
        if (starts[mid] <= p) {
          lo = mid
        } else {
          hi = mid - 1
        }
      }
      return { node: nodes[lo], offset: pos - starts[lo] }
    }
    for (let at = hay.indexOf(needle); at >= 0 && out.length < MAX_MATCHES; at = hay.indexOf(needle, at + needle.length)) {
      const a = locate(at, false)
      const b = locate(at + needle.length, true)
      const range = document.createRange()
      range.setStart(a.node, a.offset)
      range.setEnd(b.node, b.offset)
      out.push(range)
    }
  }
  return out
}

export type Find = { refresh(): void }

export function mountFind(parts: {
  bar: HTMLElement
  before: HTMLElement
  docEl: HTMLElement
}): Find {
  const { bar, before, docEl } = parts
  const mk = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text = ''): HTMLElementTagNameMap[K] => {
    const node = document.createElement(tag)
    for (const [k, v] of Object.entries(attrs)) {
      node.setAttribute(k, v)
    }
    node.textContent = text
    return node
  }
  const toggle = mk('button', { type: 'button', title: 'Find in this file (Ctrl/Cmd+F)' }, 'Find')
  const row = mk('div', { id: 'find', role: 'search' })
  const input = mk('input', { type: 'search', placeholder: 'Find', 'aria-label': 'Find in this file', spellcheck: 'false' })
  const count = mk('span', { class: 'count', 'aria-live': 'polite' })
  const prev = mk('button', { type: 'button', title: 'Previous match (Shift+Enter)' }, '↑')
  const next = mk('button', { type: 'button', title: 'Next match (Enter)' }, '↓')
  const close = mk('button', { type: 'button', title: 'Close (Esc)' }, '×')
  row.append(input, count, prev, next, close)
  row.hidden = true
  bar.insertBefore(toggle, before)
  bar.after(row)

  let matches: Range[] = []
  let index = -1

  const paint = (jump: boolean): void => {
    const hl = registry()
    if (hl) {
      hl.delete('find')
      hl.delete('find-current')
      if (matches.length) {
        hl.set('find', makeHighlight(matches))
        if (index >= 0) {
          hl.set('find-current', makeHighlight([matches[index]]))
        }
      }
    }
    count.textContent = input.value === '' ? '' : matches.length ? `${index + 1} / ${matches.length}${matches.length >= MAX_MATCHES ? '+' : ''}` : 'No results'
    if (jump && index >= 0) {
      const range = matches[index]
      if (!hl) {
        const selection = window.getSelection()
        selection?.removeAllRanges()
        selection?.addRange(range) // no highlight support: select the match instead
      }
      range.startContainer.parentElement?.scrollIntoView({ block: 'center', inline: 'nearest' })
    }
  }

  const search = (keepPlace: boolean, jump: boolean): void => {
    const was = index
    matches = findRanges(docEl, input.value)
    index = matches.length ? (keepPlace && was >= 0 && was < matches.length ? was : 0) : -1
    paint(jump)
  }

  const step = (by: number): void => {
    if (!matches.length) {
      search(false, true)
      return
    }
    index = (index + by + matches.length) % matches.length
    paint(true)
  }

  const open = (): void => {
    row.hidden = false
    toggle.setAttribute('aria-pressed', 'true')
    const picked = window.getSelection()?.toString().trim() ?? ''
    if (picked && picked.length <= 80 && !picked.includes('\n')) {
      input.value = picked
    }
    input.focus()
    input.select()
    search(false, true)
  }

  const shut = (): void => {
    row.hidden = true
    toggle.setAttribute('aria-pressed', 'false')
    matches = []
    index = -1
    const hl = registry()
    hl?.delete('find')
    hl?.delete('find-current')
  }

  toggle.addEventListener('click', () => (row.hidden ? open() : shut()))
  close.addEventListener('click', shut)
  prev.addEventListener('click', () => step(-1))
  next.addEventListener('click', () => step(1))
  input.addEventListener('input', () => search(false, true))
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      step(event.shiftKey ? -1 : 1)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      shut()
    }
  })
  document.addEventListener('keydown', (event) => {
    const mod = event.ctrlKey || event.metaKey
    if (mod && !event.altKey && event.key.toLowerCase() === 'f') {
      event.preventDefault()
      open()
    } else if (!row.hidden && (event.key === 'F3' || (mod && event.key.toLowerCase() === 'g'))) {
      event.preventDefault()
      step(event.shiftKey ? -1 : 1)
    }
  })

  return {
    // The page was redrawn: look again, and keep the current match where it still exists.
    refresh: () => {
      if (!row.hidden && input.value !== '') {
        search(true, false)
      }
    }
  }
}

// The block editor: a CodeMirror editor for one block of Markdown. Every Markdown symbol stays
// visible, but headings, emphasis, links, lists, quotes and fenced code are colored in the page's
// palette. Bundled by tools/build.mjs into editor/vendor/live.js. Code highlighting comes from the
// page (see LiveOptions), so this bundle does not repeat highlight.js.
import { EditorSelection, EditorState, StateField, type Extension, type Range } from '@codemirror/state'
import { Decoration, EditorView, drawSelection, keymap, type DecorationSet } from '@codemirror/view'
import { cursorLineDown, cursorLineUp, defaultKeymap, history, historyKeymap, indentLess, indentMore } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language'

export type LiveOptions = {
  doc: string
  /** highlight.js HTML for `code` in language `lang` (HTML-escaped text inside <span class="hljs-…">). */
  highlight: (code: string, lang: string) => string
  onChange: (text: string) => void
  onOpenLink: (url: string) => void
  /** Escape or Ctrl/Cmd+Enter pressed in the editor. */
  onExit?: () => void
  /** The cursor tried to move past the first line (up) or the last line (down). */
  onBoundary?: (direction: 'up' | 'down') => void
}

export type LiveEditor = {
  getText(): string
  focus(): void
  /** Puts the cursor at a character offset. */
  setCursor(pos: number): void
  destroy(): void
}

type DecoOptions = Pick<LiveOptions, 'highlight'>

const MAX_DECORATED = 400_000 // characters; a bigger block stays plain so typing stays fast

// ---------------------------------------------------------------- highlight.js HTML -> ranges

/** Turns highlight.js output into [from, to, class] ranges over the plain code; null if it is not shaped as expected. */
export function htmlToRanges(html: string): { from: number; to: number; cls: string }[] | null {
  const out: { from: number; to: number; cls: string }[] = []
  const stack: { cls: string; start: number }[] = []
  let pos = 0
  const re = /<span class="([^"]*)">|<\/span>|&(amp|lt|gt|quot|#x27|#39);|[^<&]+|[<&]/g
  for (const m of html.matchAll(re)) {
    if (m[1] !== undefined) {
      stack.push({ cls: m[1], start: pos })
    } else if (m[0] === '</span>') {
      const open = stack.pop()
      if (!open) {
        return null
      }
      if (pos > open.start) {
        out.push({ from: open.start, to: pos, cls: open.cls })
      }
    } else if (m[2] !== undefined) {
      pos += 1
    } else {
      pos += m[0].length
    }
  }
  return stack.length === 0 ? out : null
}

// ---------------------------------------------------------------- decorations

const frontMatterEnd = (text: string): number => {
  const m = /^---[ \t]*\n[\s\S]*?\n---[ \t]*(?:\n|$)/.exec(text)
  return m ? m[0].length : 0
}

/** The colors and line styles the editor adds on top of the plain text. Exported for tests. */
export function buildDecorations(state: EditorState, options: DecoOptions): DecorationSet {
  const doc = state.doc
  if (doc.length > MAX_DECORATED) {
    return Decoration.none
  }
  const items: Range<Decoration>[] = []
  const lineClasses = new Map<number, Set<string>>() // line start -> classes, so each line gets one decoration
  const addLine = (pos: number, cls: string): void => {
    const start = doc.lineAt(pos).from
    const set = lineClasses.get(start) ?? new Set<string>()
    cls.split(' ').forEach((c) => set.add(c))
    lineClasses.set(start, set)
  }
  const addLines = (from: number, to: number, cls: string): void => {
    for (let n = doc.lineAt(from).number; n <= doc.lineAt(Math.min(to, doc.length)).number; n++) {
      addLine(doc.line(n).from, cls)
    }
  }
  const mark = (from: number, to: number, cls: string): void => {
    if (to > from) {
      items.push(Decoration.mark({ class: cls }).range(from, to))
    }
  }

  // Front matter is plain YAML: dim and monospace, with no Markdown styling inside it.
  const fmEnd = frontMatterEnd(doc.sliceString(0, Math.min(doc.length, 4000)))
  if (fmEnd > 0) {
    addLines(0, Math.max(0, fmEnd - 1), 'cm-front')
  }

  const tree = ensureSyntaxTree(state, doc.length, 150) ?? syntaxTree(state)
  tree.iterate({
    enter: (n) => {
      if (n.to <= fmEnd && n.name !== 'Document') {
        return false
      }
      const { name, from, to } = n
      let m: RegExpExecArray | null
      if ((m = /^ATXHeading([1-6])$/.exec(name))) {
        addLine(from, `cm-h cm-h${m[1]}`)
        return
      }
      if ((m = /^SetextHeading([12])$/.exec(name))) {
        addLines(from, to, `cm-h cm-h${m[1]}`)
        return
      }
      switch (name) {
        case 'Blockquote':
          addLines(from, to, 'cm-quote')
          return
        case 'FencedCode': {
          addLines(from, to, 'cm-codeblock')
          addLine(from, 'cm-codefence cm-codetop')
          const last = doc.lineAt(to)
          if (/^\s*(`{3,}|~{3,})\s*$/.test(last.text) && last.from !== doc.lineAt(from).from) {
            addLine(last.from, 'cm-codefence cm-codebottom')
          }
          const text = n.node.getChild('CodeText')
          if (text && text.to > text.from) {
            const info = n.node.getChild('CodeInfo')
            const lang = info ? state.sliceDoc(info.from, info.to).trim().split(/[\s{]/)[0] : ''
            const code = state.sliceDoc(text.from, text.to)
            let spans: ReturnType<typeof htmlToRanges> = null
            try {
              spans = htmlToRanges(options.highlight(code, lang))
            } catch {
              spans = null
            }
            // Only trust the colors when they line up with the code character for character.
            if (spans && spans.every((s) => s.to <= code.length)) {
              for (const s of spans) {
                mark(text.from + s.from, text.from + s.to, s.cls)
              }
            }
          }
          return false
        }
        case 'InlineCode':
          mark(from, to, 'cm-ic')
          return false
        case 'Emphasis':
        case 'StrongEmphasis':
        case 'Strikethrough': {
          const marks = n.node.getChildren(name === 'Strikethrough' ? 'StrikethroughMark' : 'EmphasisMark')
          const cls = name === 'Emphasis' ? 'cm-em' : name === 'StrongEmphasis' ? 'cm-strong' : 'cm-strike'
          if (marks.length >= 2) {
            mark(marks[0].to, marks[marks.length - 1].from, cls)
            marks.forEach((c) => mark(c.from, c.to, 'cm-syntax'))
          } else {
            mark(from, to, cls)
          }
          return
        }
        case 'Link': {
          const marks = n.node.getChildren('LinkMark')
          const open = marks[0]
          const close = marks[1]
          if (open && close && state.sliceDoc(close.to, close.to + 1) === '(') {
            // A badge or linked picture, [![alt](img)](url), keeps its inner image styled too.
            const hasImage = !!n.node.getChild('Image')
            if (!hasImage) {
              mark(open.to, close.from, 'cm-link')
            }
            mark(open.from, open.to, 'cm-syntax')
            mark(close.from, to, 'cm-syntax')
            return hasImage ? undefined : false
          }
          mark(from, to, 'cm-link')
          return false
        }
        case 'URL':
          if (n.node.parent?.name === 'Autolink' || n.node.parent?.name === 'Paragraph') {
            mark(from, to, 'cm-link')
          }
          return
        case 'ListMark':
          mark(from, to, 'cm-listmark')
          return
        case 'Table':
          addLines(from, to, 'cm-table-line')
          return
        case 'Image':
          mark(from, to, 'cm-syntax')
          return false
        case 'HeaderMark':
        case 'QuoteMark':
        case 'HorizontalRule':
        case 'TaskMarker':
        case 'TableDelimiter':
        case 'CodeInfo':
        case 'CodeMark':
          mark(from, to, 'cm-syntax')
          return
        case 'HTMLBlock':
        case 'HTMLTag':
        case 'Comment':
        case 'CommentBlock':
          mark(from, to, 'cm-html')
          return
        default:
          return
      }
    }
  })

  for (const [start, classes] of lineClasses) {
    items.push(Decoration.line({ class: [...classes].join(' ') }).range(start))
  }
  return Decoration.set(items, true)
}

const colorField = (options: DecoOptions): StateField<DecorationSet> =>
  StateField.define<DecorationSet>({
    create: (state) => buildDecorations(state, options),
    update: (value, tr) =>
      tr.docChanged || syntaxTree(tr.state) !== syntaxTree(tr.startState) ? buildDecorations(tr.state, options) : value,
    provide: (field) => EditorView.decorations.from(field)
  })

// ---------------------------------------------------------------- commands

/** Ctrl/Cmd+B and +I: wrap the selection in the marks, or take them off when already there. */
const toggleWrap =
  (markText: string) =>
  (view: EditorView): boolean => {
    const len = markText.length
    view.dispatch(
      view.state.changeByRange((range) => {
        const before = view.state.sliceDoc(Math.max(0, range.from - len), range.from)
        const after = view.state.sliceDoc(range.to, range.to + len)
        if (before === markText && after === markText) {
          return {
            changes: [
              { from: range.from - len, to: range.from },
              { from: range.to, to: range.to + len }
            ],
            range: EditorSelection.range(range.from - len, range.to - len)
          }
        }
        return {
          changes: [
            { from: range.from, insert: markText },
            { from: range.to, insert: markText }
          ],
          range: EditorSelection.range(range.from + len, range.to + len)
        }
      })
    )
    return true
  }

const LIST_LINE = /^\s*(?:[-*+]|\d+[.)])\s/

/** Tab and Shift+Tab indent or outdent a list item; elsewhere they are left to the browser. */
const listIndent =
  (more: boolean) =>
  (view: EditorView): boolean =>
    LIST_LINE.test(view.state.doc.lineAt(view.state.selection.main.head).text)
      ? more
        ? indentMore(view)
        : indentLess(view)
      : false

// ---------------------------------------------------------------- the editor

export function createLive(parent: HTMLElement, options: LiveOptions): LiveEditor {
  const linkAt = (view: EditorView, event: MouseEvent): string | null => {
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
    if (pos === null) {
      return null
    }
    let url: string | null = null
    syntaxTree(view.state).iterate({
      from: pos,
      to: pos,
      enter: (n) => {
        if (n.name === 'Link' || n.name === 'Autolink') {
          const u = n.node.getChild('URL')
          if (u) {
            url = view.state.sliceDoc(u.from, u.to)
          }
        } else if (n.name === 'URL' && !url) {
          url = view.state.sliceDoc(n.from, n.to)
        }
      }
    })
    return url
  }
  /** Arrow up/down move as usual until the cursor cannot move; then the page moves to the next block. */
  const boundary =
    (direction: 'up' | 'down') =>
    (view: EditorView): boolean => {
      const range = view.state.selection.main
      if (!options.onBoundary || !range.empty) {
        return false
      }
      const before = range.head
      const moved = direction === 'down' ? cursorLineDown(view) : cursorLineUp(view)
      if (view.state.selection.main.head === before) {
        options.onBoundary(direction)
        return true
      }
      return moved
    }
  const leave = (): boolean => {
    options.onExit?.()
    return options.onExit !== undefined
  }
  const extensions: Extension[] = [
    history(),
    drawSelection(),
    EditorView.lineWrapping,
    markdown({ base: markdownLanguage }),
    colorField(options),
    keymap.of([
      { key: 'Escape', run: leave },
      { key: 'Mod-Enter', run: leave },
      { key: 'ArrowDown', run: boundary('down') },
      { key: 'ArrowUp', run: boundary('up') },
      { key: 'Tab', run: listIndent(true), shift: listIndent(false) },
      { key: 'Mod-b', run: toggleWrap('**') },
      { key: 'Mod-i', run: toggleWrap('*') },
      ...defaultKeymap,
      ...historyKeymap
    ]),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        options.onChange(update.state.doc.toString())
      }
    }),
    EditorView.domEventHandlers({
      mousedown: (event, view) => {
        if (event.button === 0 && (event.metaKey || event.ctrlKey)) {
          const url = linkAt(view, event)
          if (url) {
            event.preventDefault()
            options.onOpenLink(url)
            return true
          }
        }
        return false
      }
    })
  ]
  const view = new EditorView({ state: EditorState.create({ doc: options.doc, extensions }), parent })
  return {
    getText: () => view.state.doc.toString(),
    focus: () => view.focus(),
    setCursor(pos) {
      view.dispatch({ selection: { anchor: Math.max(0, Math.min(pos, view.state.doc.length)) } })
    },
    destroy: () => view.destroy()
  }
}

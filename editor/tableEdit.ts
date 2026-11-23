// Tables edited in place. Click a cell and type: the cell shows its Markdown, and the table is
// written to the file as you go. Tab and Shift+Tab move between cells (Tab in the last cell adds a
// row), the up and down arrows move between rows, Enter or Esc leaves. A right-click (or Shift+F10)
// opens a menu to add or delete rows and columns, or to edit the whole table as Markdown. Everything
// between entering a table and leaving it is one undo step.
import { addColumn, addRow, cellText, deleteColumn, deleteRow, parseTable, serializeTable, setCell, type Table } from './table'

type Session = { blk: HTMLElement; table: Table; from: number; length: number; before: string; row: number; col: number; cell: HTMLElement | null }

export type TableEditing = {
  /** Starts editing `cell`; false when its table cannot be edited in place (the caller edits the block). */
  start(cell: HTMLElement): boolean
  /** Opens the row and column menu for `cell` at (x, y); false when it is not an editable table. */
  menu(cell: HTMLElement, x: number, y: number): boolean
  /** Writes what was typed as one undo step and shows the table again. */
  finish(): void
  /** Forgets the session without writing (the file changed somewhere else and the page was redrawn). */
  drop(): void
}

export function mountTableEditing(o: {
  docEl: HTMLElement
  canEdit: () => boolean
  text: () => string
  /** Replaces the file's text (and saves it). */
  write: (next: string) => void
  /** One undo step from `before` to `after`. */
  record: (before: string, after: string) => void
  /** The HTML of a block of Markdown. */
  render: (markdown: string) => string
  /** After a table was drawn again: images, the outline, find. */
  rendered: () => void
  /** Edit the whole block as Markdown. */
  editMarkdown: (blk: HTMLElement) => void
}): TableEditing {
  let s: Session | null = null
  let redrawing = false
  let openMenu: HTMLElement | null = null

  const tableOf = (blk: HTMLElement): HTMLTableElement | null => {
    const tables = blk.querySelectorAll('table')
    return tables.length === 1 ? tables[0] : null
  }

  /** A session for the table in `blk`, when the block is just that table and it matches the page. */
  const open = (blk: HTMLElement): Session | null => {
    if (s?.blk === blk) {
      return s
    }
    finish()
    const from = Number(blk.dataset.from)
    const to = Number(blk.dataset.to)
    const text = o.text()
    const dom = tableOf(blk)
    const table = from >= 0 && to <= text.length ? parseTable(text.slice(from, to)) : null
    if (!dom || !table || dom.rows.length !== table.rows.length || dom.rows[0].cells.length !== table.aligns.length) {
      return null
    }
    s = { blk, table, from, length: to - from, before: text, row: 0, col: 0, cell: null }
    return s
  }

  const position = (cell: HTMLElement): { row: number; col: number } | null => {
    const tr = cell.parentElement as HTMLTableRowElement | null
    const table = tr?.closest('table')
    return tr && table ? { row: Array.from(table.rows).indexOf(tr), col: (cell as HTMLTableCellElement).cellIndex } : null
  }

  /** Writes the table into the file, keeping the block's place in step. */
  const store = (): void => {
    if (!s) return
    const text = o.text()
    const markdown = serializeTable(s.table)
    o.write(text.slice(0, s.from) + markdown + text.slice(s.from + s.length))
    s.length = markdown.length
  }

  /** Draws the table again and puts the cursor in (row, col). */
  const activate = (row: number, col: number): void => {
    if (!s) return
    const session = s
    redrawing = true
    session.blk.innerHTML = o.render(serializeTable(session.table))
    redrawing = false
    o.rendered()
    const dom = tableOf(session.blk)
    const cell = dom?.rows[row]?.cells[col] as HTMLElement | undefined
    if (!cell) {
      finish()
      return
    }
    session.row = row
    session.col = col
    session.cell = cell
    cell.textContent = session.table.rows[row].cells[col]
    cell.classList.add('cell-editing')
    cell.contentEditable = 'plaintext-only'
    cell.spellcheck = true
    cell.addEventListener('input', () => {
      if (s === session && session.cell === cell) {
        setCell(session.table, row, col, cellText(cell.textContent ?? ''))
        store()
      }
    })
    cell.focus()
    const range = document.createRange()
    range.selectNodeContents(cell)
    range.collapse(false)
    const selection = getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  }

  function finish(): void {
    closeMenu()
    if (!s) return
    const session = s
    s = null
    const after = o.text()
    o.record(session.before, after)
    const markdown = after.slice(session.from, session.from + session.length)
    // Blocks after this one moved by however much the table grew or shrank.
    const delta = session.from + session.length - Number(session.blk.dataset.to)
    session.blk.dataset.to = String(session.from + session.length)
    for (let next = session.blk.nextElementSibling as HTMLElement | null; next; next = next.nextElementSibling as HTMLElement | null) {
      if (next.dataset.from !== undefined) {
        next.dataset.from = String(Number(next.dataset.from) + delta)
        next.dataset.to = String(Number(next.dataset.to) + delta)
      }
    }
    if (session.blk.isConnected) {
      const hadFocus = session.blk.contains(document.activeElement)
      redrawing = true
      session.blk.innerHTML = o.render(markdown)
      redrawing = false
      o.rendered()
      if (hadFocus) {
        session.blk.focus() // Enter and Esc keep you in the keyboard flow
      }
    }
  }

  const move = (row: number, col: number): void => {
    if (!s) return
    const rows = s.table.rows.length
    const cols = s.table.aligns.length
    if (col >= cols) {
      row++
      col = 0
    } else if (col < 0) {
      row--
      col = cols - 1
    }
    if (row < 0) return
    if (row >= rows) {
      addRow(s.table, rows) // Tab in the last cell adds a row
      store()
    }
    activate(row, col)
  }

  // ---- the menu ----
  function closeMenu(): void {
    const menu = openMenu
    openMenu = null // first, so the focus leaving the removed menu is not taken for leaving the table
    menu?.remove()
  }

  const showMenu = (row: number, col: number, x: number, y: number): void => {
    closeMenu()
    if (!s) return
    const session = s
    const cols = session.table.aligns.length
    const menu = document.createElement('div')
    menu.className = 'table-menu'
    menu.setAttribute('role', 'menu')
    const act = (label: string, run: () => void, disabled = false): void => {
      const b = document.createElement('button')
      b.type = 'button'
      b.setAttribute('role', 'menuitem')
      b.textContent = label
      b.disabled = disabled
      b.addEventListener('mousedown', (e) => e.preventDefault())
      b.addEventListener('click', () => {
        closeMenu()
        if (s === session) run()
      })
      menu.append(b)
    }
    const change = (edit: () => void): (() => void) => () => {
      edit()
      store()
      finish()
    }
    if (row > 0) {
      act('Add row above', change(() => addRow(session.table, row)))
    }
    act('Add row below', change(() => addRow(session.table, row + 1)))
    act('Delete row', change(() => deleteRow(session.table, row)), row === 0)
    act('Add column left', change(() => addColumn(session.table, col)))
    act('Add column right', change(() => addColumn(session.table, col + 1)))
    act('Delete column', change(() => deleteColumn(session.table, col)), cols <= 1)
    act('Edit as Markdown', () => {
      const blk = session.blk
      finish()
      o.editMarkdown(blk)
    })
    menu.addEventListener('keydown', (e) => {
      const items = Array.from(menu.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
      const at = items.indexOf(document.activeElement as HTMLButtonElement)
      if (e.key === 'Escape') {
        e.preventDefault()
        closeMenu()
        if (session.cell?.isConnected) session.cell.focus()
        else finish()
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        items[(at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus()
      }
    })
    menu.addEventListener('focusout', (e) => {
      const to = e.relatedTarget as Node | null
      if (openMenu === menu && !(to && menu.contains(to))) {
        closeMenu()
        if (!(to && session.blk.contains(to))) finish()
      }
    })
    document.body.append(menu)
    const box = menu.getBoundingClientRect()
    menu.style.left = `${Math.max(4, Math.min(x, innerWidth - box.width - 4))}px`
    menu.style.top = `${Math.max(4, Math.min(y, innerHeight - box.height - 4))}px`
    openMenu = menu
    menu.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
  }

  // ---- keys and focus inside an editing cell ----
  // A cell cannot take focus, so pressing another cell of the table would blur the one being edited
  // and end the session before the click moves there; keep the focus until then.
  o.docEl.addEventListener('mousedown', (e) => {
    const target = e.target as HTMLElement
    if (s?.cell && s.blk.contains(target) && !s.cell.contains(target) && target.closest('td, th')) {
      e.preventDefault()
    }
  })
  o.docEl.addEventListener('keydown', (e) => {
    const cell = e.target as HTMLElement
    if (!s || cell !== s.cell || e.isComposing) return
    if (e.key === 'Tab') {
      e.preventDefault()
      move(s.row, s.col + (e.shiftKey ? -1 : 1))
    } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !e.shiftKey && !e.altKey) {
      const row = s.row + (e.key === 'ArrowDown' ? 1 : -1)
      if (row >= 0 && row < s.table.rows.length) {
        e.preventDefault()
        move(row, s.col)
      }
    } else if (e.key === 'Enter' || e.key === 'Escape') {
      e.preventDefault()
      finish()
    } else if ((e.shiftKey && e.key === 'F10') || e.key === 'ContextMenu') {
      e.preventDefault()
      const r = cell.getBoundingClientRect()
      showMenu(s.row, s.col, r.left, r.bottom + 2)
    }
  })
  o.docEl.addEventListener('focusout', (e) => {
    if (!s || redrawing || !s.blk.contains(e.target as Node)) return
    const to = e.relatedTarget as Node | null
    // Moving to another cell of this table, or to the menu, is not leaving it; nor is leaving the window.
    if ((to && (s.blk.contains(to) || openMenu?.contains(to))) || (to === null && !document.hasFocus())) return
    finish()
  })

  return {
    start(cell) {
      const blk = cell.closest<HTMLElement>('.blk')
      if (!blk || !o.canEdit()) return false
      if (s && s.cell === cell) return true
      const at = position(cell)
      const session = blk && at ? open(blk) : null
      if (!session || !at) return false
      activate(at.row, at.col)
      return true
    },
    menu(cell, x, y) {
      const blk = cell.closest<HTMLElement>('.blk')
      const at = position(cell)
      if (!blk || !at || !o.canEdit() || !open(blk)) return false
      showMenu(at.row, at.col, x, y)
      return true
    },
    finish,
    drop() {
      closeMenu()
      s = null
    }
  }
}

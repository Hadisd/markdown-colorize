// A Markdown table as cells, and back. The cells hold their Markdown as written (`**b**`, `\|`).
// Written back, the table keeps its style: the outer pipes and indent it had, padded columns when
// its columns were lined up, and every row nobody changed exactly as it was.

export type Align = '' | 'left' | 'center' | 'right'
type Row = { cells: string[]; line: string | null } // `line`: the row as written, until it changes

export type Table = {
  indent: string
  lead: boolean
  trail: boolean
  /** Every line was the same length: written back with padded columns. */
  lined: boolean
  aligns: Align[]
  /** Each column's width as written (its --- cell), so columns only ever grow. */
  widths: number[]
  /** Row 0 is the header. */
  rows: Row[]
  delimiter: string | null
}

const splitRow = (line: string): { indent: string; lead: boolean; trail: boolean; cells: string[]; padded: boolean } => {
  const indent = /^[ \t]*/.exec(line)![0]
  let s = line.slice(indent.length).replace(/[ \t]+$/, '')
  const lead = s.startsWith('|')
  if (lead) {
    s = s.slice(1)
  }
  const trail = /(?:^|[^\\])\|$/.test(s)
  if (trail) {
    s = s.slice(0, -1)
  }
  const cells: string[] = []
  let padded = false // a cell with more than one space beside it: the columns were lined up by hand
  const push = (raw: string): void => {
    padded ||= /^[ \t]{2,}\S|\S[ \t]{2,}$/.test(raw)
    cells.push(raw.trim())
  }
  let cell = ''
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && i + 1 < s.length) {
      cell += s[i] + s[i + 1] // an escape, \| included, stays as written
      i++
    } else if (s[i] === '|') {
      push(cell)
      cell = ''
    } else {
      cell += s[i]
    }
  }
  push(cell)
  return { indent, lead, trail, cells, padded }
}

const DELIMITER = /^:?-+:?$/

/** The table `source` is, or null when it is not only a table. */
export function parseTable(source: string): Table | null {
  const lines = source.replace(/\n+$/, '').split('\n')
  if (lines.length < 2 || lines.some((l) => !l.includes('|') || l.length - l.trimStart().length > 3)) {
    return null
  }
  const head = splitRow(lines[0])
  const delimiter = splitRow(lines[1]).cells
  if (delimiter.length !== head.cells.length || !delimiter.every((c) => DELIMITER.test(c))) {
    return null
  }
  const aligns = delimiter.map((c): Align => (c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : c.startsWith(':') ? 'left' : ''))
  const width = head.cells.length
  const fit = (cells: string[]): string[] => Array.from({ length: width }, (_, i) => cells[i] ?? '')
  const split = lines.slice(2).map(splitRow)
  const body = split.map((r, i) => ({ cells: fit(r.cells), line: lines[i + 2] }))
  const ends = lines.map((l) => l.trimEnd().length)
  const padded = head.padded || split.some((r) => r.padded)
  return {
    indent: head.indent,
    lead: head.lead,
    trail: head.trail,
    lined: padded && head.lead && head.trail && ends.every((n) => n === ends[0]),
    aligns,
    widths: delimiter.map((c) => c.length),
    rows: [{ cells: head.cells, line: lines[0] }, ...body],
    delimiter: lines[1]
  }
}

/** A cell's text as one line of Markdown: line breaks become spaces and a bare | is escaped. */
export const cellText = (text: string): string => text.replace(/\s*\r?\n\s*/g, ' ').trim().replace(/(?<!\\)\|/g, '\\|')

const dashes = (align: Align, width: number): string => {
  const n = Math.max(width, 3)
  if (align === 'center') return `:${'-'.repeat(n - 2)}:`
  if (align === 'right') return `${'-'.repeat(n - 1)}:`
  if (align === 'left') return `:${'-'.repeat(n - 1)}`
  return '-'.repeat(n)
}

export function serializeTable(t: Table): string {
  const widths = t.aligns.map((_, c) => Math.max(3, t.widths[c] ?? 0, ...t.rows.map((r) => r.cells[c].length)))
  // Rows nobody changed are kept as written, unless a lined-up column had to grow.
  const keep = !t.lined || widths.every((w, c) => w === t.widths[c])
  // Right-aligned columns (numbers) are padded in front, the rest after, as tables written by hand are.
  const pad = (cell: string, c: number): string => (t.aligns[c] === 'right' ? cell.padStart(widths[c]) : cell.padEnd(widths[c]))
  const format = (cells: string[]): string => {
    const inner = t.lined ? cells.map(pad) : cells
    return `${t.indent}${t.lead ? '| ' : ''}${inner.join(' | ')}${t.trail ? ' |' : ''}`.replace(/[ \t]+$/, '')
  }
  const delimiter = keep && t.delimiter !== null ? t.delimiter : format(t.aligns.map((a, c) => dashes(a, t.lined ? widths[c] : 3)))
  const rows = t.rows.map((r) => (keep && r.line !== null ? r.line : format(r.cells)))
  return [rows[0], delimiter, ...rows.slice(1)].join('\n')
}

// ---- changes; each marks what has to be written again ----

export function setCell(t: Table, row: number, col: number, text: string): void {
  const r = t.rows[row]
  if (r && col < r.cells.length && r.cells[col] !== text) {
    r.cells[col] = text
    r.line = null
  }
}

/** A new empty row at `at` (1 is the first row under the header). */
export function addRow(t: Table, at: number): void {
  t.rows.splice(Math.max(1, Math.min(at, t.rows.length)), 0, { cells: t.aligns.map(() => ''), line: null })
}

export function deleteRow(t: Table, at: number): void {
  if (at >= 1 && at < t.rows.length) {
    t.rows.splice(at, 1)
  }
}

const restyle = (t: Table): void => {
  t.delimiter = null
  for (const r of t.rows) {
    r.line = null
  }
}

export function addColumn(t: Table, at: number): void {
  const c = Math.max(0, Math.min(at, t.aligns.length))
  t.aligns.splice(c, 0, '')
  t.widths.splice(c, 0, 3)
  for (const r of t.rows) {
    r.cells.splice(c, 0, '')
  }
  restyle(t)
}

export function deleteColumn(t: Table, at: number): void {
  if (t.aligns.length > 1 && at >= 0 && at < t.aligns.length) {
    t.aligns.splice(at, 1)
    t.widths.splice(at, 1)
    for (const r of t.rows) {
      r.cells.splice(at, 1)
    }
    restyle(t)
  }
}

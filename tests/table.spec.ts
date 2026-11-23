// Tables edited in place: read into cells and written back in the table's own style, changing as
// few lines as possible. Run with `npm test`.
import test from 'node:test'
import assert from 'node:assert/strict'
import { renderBlocks } from '../src/render.ts'
import { addColumn, addRow, cellText, deleteColumn, deleteRow, parseTable, serializeTable, setCell } from '../editor/table.ts'

const LINED = [
  '| Language   | Kind       |  Year |',
  '| ---------- | :--------: | ----: |',
  '| TypeScript | typed      |  2012 |',
  '| Python     | dynamic    |  1991 |'
].join('\n')
const COMPACT = '| a | b |\n|---|:-:|\n| 1 | 2 |\n| 3 | 4 |'
const BARE = 'a | b\n--|--\n1 | 2'

const edit = (source: string, change: (t: NonNullable<ReturnType<typeof parseTable>>) => void): string => {
  const t = parseTable(source)
  assert.ok(t, source)
  change(t)
  return serializeTable(t)
}
const changedLines = (a: string, b: string): number[] =>
  b.split('\n').flatMap((line, i) => (line === a.split('\n')[i] ? [] : [i]))

test('reads cells, alignment and style; unchanged tables are written back as they were', () => {
  for (const source of [LINED, COMPACT, BARE, '  | x |\n  |---|\n  | y |', '| a \\| b | `c` |\n|---|---|\n| 1 | 2 |']) {
    assert.equal(edit(source, () => {}), source)
  }
  const t = parseTable(LINED)!
  assert.deepEqual(t.aligns, ['', 'center', 'right'])
  assert.deepEqual(t.rows[1].cells, ['TypeScript', 'typed', '2012'])
  assert.equal(t.lined, true)
  assert.deepEqual(parseTable('| a \\| b | c |\n|---|---|')!.rows[0].cells, ['a \\| b', 'c'])
  assert.deepEqual(parseTable('| a | b |\n|---|---|\n| only |')!.rows[1].cells, ['only', ''])
})

test('not a table: no delimiter row, wrong cell count, a quote, or code-indented', () => {
  for (const source of ['| a |\n| b |', '| a | b |\n|---|', '> | a |\n> |---|', '    | a |\n    |---|', 'text\n|---|']) {
    assert.equal(parseTable(source), null, source)
  }
})

test('one changed cell rewrites one line, unless a lined-up column has to grow', () => {
  const same = edit(LINED, (t) => setCell(t, 2, 0, 'Go'))
  assert.deepEqual(changedLines(LINED, same), [3])
  assert.equal(same.split('\n')[3], '| Go         | dynamic    |  1991 |') // padded, right column right-aligned
  const grown = edit(LINED, (t) => setCell(t, 1, 0, 'JavaScript and TypeScript'))
  const lengths = new Set(grown.split('\n').map((l) => l.length))
  assert.equal(lengths.size, 1, grown) // still lined up
  assert.match(grown, /\| :-+: \| -+: \|$/m)
  assert.deepEqual(changedLines(COMPACT, edit(COMPACT, (t) => setCell(t, 2, 1, 'four'))), [3])
  assert.equal(edit(BARE, (t) => setCell(t, 1, 0, 'one')), 'a | b\n--|--\none | 2')
})

test('rows and columns', () => {
  assert.equal(edit(COMPACT, (t) => addRow(t, 1)), '| a | b |\n|---|:-:|\n|  |  |\n| 1 | 2 |\n| 3 | 4 |')
  assert.equal(edit(COMPACT, (t) => deleteRow(t, 2)), '| a | b |\n|---|:-:|\n| 1 | 2 |')
  assert.equal(edit(COMPACT, (t) => deleteRow(t, 0)), COMPACT) // the header stays
  assert.equal(edit(COMPACT, (t) => addColumn(t, 1)), '| a |  | b |\n| --- | --- | :-: |\n| 1 |  | 2 |\n| 3 |  | 4 |')
  assert.equal(edit(COMPACT, (t) => deleteColumn(t, 0)), '| b |\n| :-: |\n| 2 |\n| 4 |')
  assert.equal(edit('| a |\n|---|', (t) => deleteColumn(t, 0)), '| a |\n|---|') // the last column stays
  const lined = edit(LINED, (t) => addColumn(t, 3))
  assert.equal(new Set(lined.split('\n').map((l) => l.length)).size, 1, lined)
})

test('a cell is one line of Markdown with its pipes escaped', () => {
  assert.equal(cellText('  a | b\nc  '), 'a \\| b c')
  assert.equal(cellText('kept \\| as is'), 'kept \\| as is')
})

test('what is written is still the same table to the Markdown parser', () => {
  const out = edit(LINED, (t) => {
    setCell(t, 1, 1, cellText('a | b'))
    addRow(t, 3)
    setCell(t, 3, 0, '**Rust**')
    addColumn(t, 1)
  })
  const again = parseTable(out)!
  assert.deepEqual(again.rows.map((r) => r.cells), [
    ['Language', '', 'Kind', 'Year'],
    ['TypeScript', '', 'a \\| b', '2012'],
    ['Python', '', 'dynamic', '1991'],
    ['**Rust**', '', '', '']
  ])
  const html = renderBlocks(out).blocks[0].html
  assert.equal((html.match(/<tr>/g) ?? []).length, 4)
  assert.match(html, /<td align="center">a \| b<\/td>/)
  assert.match(html, /<strong>Rust<\/strong>/)
})

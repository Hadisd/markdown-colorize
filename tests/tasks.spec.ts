// Task boxes: each drawn box must match the character it changes in the file. Run with `npm test`.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { renderBlocks } from '../src/render.ts'
import { taskMarks, toggleTask } from '../editor/tasks.ts'

const chars = (text: string): string[] => taskMarks(text).map((at) => text[at])

test('finds the box in bullets, numbers and quotes', () => {
  const text = '- [ ] a\n- [x] b\n* [X] c\n+ [ ] d\n1. [ ] e\n2) [x] f\n  - [ ] nested\n> - [ ] quoted\n'
  assert.deepEqual(chars(text), [' ', 'x', 'X', ' ', ' ', 'x', ' ', ' '])
  for (const at of taskMarks(text)) {
    assert.equal(text[at - 1], '[')
    assert.equal(text[at + 1], ']')
  }
})

test('not a box: no list marker, no space after it, or inside fenced code', () => {
  assert.deepEqual(taskMarks('[ ] plain\n- [ ]\n- [ ]x\n- [y] other\ntext - [ ] mid-line\n'), [])
  const fenced = '- [ ] real\n\n  ```md\n  - [ ] sample\n  ```\n- [x] real too\n~~~\n- [ ] sample\n~~~\n'
  assert.deepEqual(chars(fenced), [' ', 'x'])
})

test('toggles one character and refuses anything that is not a box', () => {
  const text = '- [ ] a\n- [X] b\n'
  const [a, b] = taskMarks(text)
  assert.equal(toggleTask(text, a), '- [x] a\n- [X] b\n')
  assert.equal(toggleTask(text, b), '- [ ] a\n- [ ] b\n')
  assert.equal(toggleTask(text, 0), null)
  assert.equal(toggleTask(text, a + 2), null)
})

test('render: a box is a button that says whether it is done', () => {
  const html = renderBlocks('- [ ] open\n- [x] done\n').blocks[0].html
  assert.match(html, /<button type="button" class="task todo" aria-pressed="false" aria-label="To do"><\/button>\s+open/)
  assert.match(html, /<button type="button" class="task done" aria-pressed="true" aria-label="Done"><\/button>\s+done/)
})

test('every block draws exactly the boxes the Markdown has, in the same state', () => {
  const tricky = [
    '# Tasks',
    '- [ ] one\n- [x] two\n  - [ ] nested\n  - [X] nested done\n1. [ ] numbered\n',
    '> - [ ] quoted\n> - [x] quoted done\n',
    '- [ ] with code\n\n  ```md\n  - [ ] not a box\n  ```\n\n- [x] after code\n',
    '- not a task\n- [ ]\n- [ ]x\n',
    '<details>\n<summary>More</summary>\n\n- [ ] inside HTML\n\n</details>\n'
  ].join('\n\n')
  const docs = [tricky, ...readdirSync('examples').map((f) => readFileSync(`examples/${f}`, 'utf8').replace(/\r\n?/g, '\n'))]
  let total = 0
  for (const text of docs) {
    for (const block of renderBlocks(text).blocks) {
      const drawn = [...block.html.matchAll(/<button type="button" class="task (done|todo)"/g)].map((m) => m[1])
      const found = chars(text.slice(block.from, block.to)).map((c) => (c === ' ' ? 'todo' : 'done'))
      assert.deepEqual(drawn, found, text.slice(block.from, block.to))
      total += drawn.length
    }
  }
  assert.ok(total >= 12, `checked ${total} boxes`)
})

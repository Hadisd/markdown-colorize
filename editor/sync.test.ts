import { assert, mockEditorHost, test } from 'orca/testing'
import { mergeText, start } from './sync'

test('shows the file and follows a write made outside the editor', async () => {
  const host = mockEditorHost({ text: '# one' })
  const doc = await start()
  assert.equal(doc.value, '# one')
  let seen = ''
  doc.onReplace((value) => {
    seen = value
  })
  host.replace('# two') // an agent or another editor writes the file
  await host.flush()
  assert.equal(seen, '# two')
  doc.dispose()
  host.dispose()
})

test('keeps your typing when the file changes somewhere else', async () => {
  const host = mockEditorHost({ text: 'top\nmiddle\nbottom' })
  const doc = await start()
  doc.change('top\nmiddle\nbottom!') // you type at the end
  host.replace('TOP\nmiddle\nbottom') // an agent edits the start
  await host.flush()
  assert.equal(host.text, 'TOP\nmiddle\nbottom!')
  doc.dispose()
  host.dispose()
})

test('merge: separate changes are both kept, in either order', () => {
  const base = 'one\ntwo\nthree'
  assert.equal(mergeText(base, 'ONE\ntwo\nthree', 'one\ntwo\nTHREE'), 'ONE\ntwo\nTHREE')
  assert.equal(mergeText(base, 'one\ntwo\nTHREE', 'ONE\ntwo\nthree'), 'ONE\ntwo\nTHREE')
})

test('merge: when only one side changed, that side is used', () => {
  assert.equal(mergeText('a', 'b', 'a'), 'b')
  assert.equal(mergeText('a', 'a', 'c'), 'c')
})

test('merge: overlapping changes keep the file on disk', () => {
  assert.equal(mergeText('hello world', 'hello there', 'hello brave'), 'hello there')
})

test('merge: two insertions at the same spot are both kept', () => {
  assert.equal(mergeText('hello world', 'hello brave world', 'hello big world'), 'hello brave big world')
})

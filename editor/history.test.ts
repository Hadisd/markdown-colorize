import { assert, test } from 'orca/testing'
import { PageHistory, patchBetween } from './history'

test('a patch is the smallest single change', () => {
  assert.deepEqual(patchBetween('hello world', 'hello brave world'), { from: 6, removed: '', inserted: 'brave ' })
  assert.deepEqual(patchBetween('abcd', 'ad'), { from: 1, removed: 'bc', inserted: '' })
})

test('undo and redo walk back and forward through editing sessions', () => {
  const h = new PageHistory()
  const v0 = '# One\n\nSecond\n'
  const v1 = '# One\n\nSecond edited\n'
  const v2 = '# One\n\nSecond edited\n\nThird\n'
  h.record(v0, v1)
  h.record(v1, v2)
  assert.equal(h.canUndo, true)
  const a = h.undo(v2)
  assert.equal(a?.text, v1)
  const b = h.undo(v1)
  assert.equal(b?.text, v0)
  assert.equal(h.undo(v0), null)
  assert.equal(h.redo(v0)?.text, v1)
  assert.equal(h.redo(v1)?.text, v2)
  assert.equal(h.canRedo, false)
})

test('a new edit clears redo', () => {
  const h = new PageHistory()
  h.record('a', 'ab')
  h.undo('ab')
  assert.equal(h.canRedo, true)
  h.record('a', 'ac')
  assert.equal(h.canRedo, false)
})

test('no change is not a step', () => {
  const h = new PageHistory()
  h.record('same', 'same')
  assert.equal(h.canUndo, false)
})

test('undo refuses and clears when the text is no longer what the step made', () => {
  const h = new PageHistory()
  h.record('one two', 'one TWO')
  assert.equal(h.undo('something else entirely'), null)
  assert.equal(h.canUndo, false)
})

test('undo works after a change elsewhere in the file', () => {
  const h = new PageHistory()
  h.record('alpha\nbeta', 'alpha\nBETA')
  // an unrelated edit made later, before the step's location is not touched
  assert.equal(h.undo('alpha\nBETA')?.text, 'alpha\nbeta')
})

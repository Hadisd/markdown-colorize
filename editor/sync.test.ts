import { assert, mockEditorHost, test } from 'orca/testing'
import { start } from './sync'

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

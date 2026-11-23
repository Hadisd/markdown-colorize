// Runs the built worker.mjs (what Orca runs) over Orca's stand-in host, which refuses a method the
// manifest's capabilities do not allow. Run with `orca plugin test`; the logic is covered in
// tests/images.spec.ts (`npm test`).
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { assert, mockHost, mountWorker, test } from 'orca/testing'
import * as main from '../../worker.mjs'

test('finds the open file and reads the image next to it', async () => {
  const root = mkdtempSync(join(tmpdir(), 'md-colorize-worker-'))
  mkdirSync(join(root, 'img'))
  writeFileSync(join(root, 'readme.md'), '# Hi\n\n![a](img/a.png)\n')
  writeFileSync(join(root, 'img', 'a.png'), 'png bytes')
  const host = mockHost({
    results: {
      'workspace.list': { workspaces: [{ id: 'w1', kind: 'folder', name: 'repo', path: root, branch: null, hostId: 'local' }], truncated: false },
      'workspace.readContext': null
    }
  })
  const worker = await mountWorker(main, { host })
  const { fingerprintText } = await import('../../editor/fingerprint')
  const text = '# Hi\n\n![a](img/a.png)\n'
  const where = (await worker.request('colorize.locate', { ...fingerprintText(text), bytes: text.length })) as { files: string[]; root: string }
  assert.deepEqual(where, { root, files: [join(root, 'readme.md')] })
  const image = (await worker.request('colorize.image', { src: 'img/a.png', ...where, offset: 0, etag: null })) as { status: string; data: string }
  assert.equal(image.status, 'data')
  assert.equal(Buffer.from(image.data, 'base64').toString(), 'png bytes')
  assert.deepEqual(host.refusals, [])
  await worker.deactivate()
})

test('web images are off when the setting is off', async () => {
  const host = mockHost({ settings: { remoteImages: false }, results: { 'workspace.list': { workspaces: [], truncated: false }, 'workspace.readContext': null } })
  const worker = await mountWorker(main, { host })
  assert.deepEqual(await worker.request('colorize.image', { src: 'https://example.com/a.png', offset: 0 }), { status: 'missing' })
  await worker.deactivate()
})

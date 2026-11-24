// Images: the placeholders render.ts draws, the worker that finds and reads them (src/worker), and
// the frame's loader (editor/images.ts) talking to that worker. Run with `npm test`.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { renderBlocks } from '../src/render.ts'
import { fingerprintText, textSize } from '../editor/fingerprint.ts'
import { createImageLoader } from '../editor/images.ts'
import { createImageService, type ImageAnswer } from '../src/worker/main.ts'
import { CHUNK_BYTES } from '../src/worker/local.ts'
import { downloadImage, isPublicAddress } from '../src/worker/remote.ts'

const html = (md: string): string => renderBlocks(md).blocks.map((b) => b.html).join('')

test('render: images become placeholders the editor can load', () => {
  assert.match(html('![Logo](img/logo.png)'), /class="img-ph" data-img="img\/logo.png" data-alt="Logo"/)
  assert.match(html('![Web](https://example.com/a.png)'), /data-img="https:\/\/example.com\/a.png"/)
  assert.match(html('<img src="//cdn.example.com/a.png" width="120" alt="x">'), /data-img="https:\/\/cdn.example.com\/a.png" data-alt="x" data-w="120"/)
  assert.doesNotMatch(html('<img src="logo.png" width="12em;color:red">'), /data-w/)
  assert.doesNotMatch(html('![x](javascript:alert(1))'), /data-img/)
  assert.match(html('![d](data:image/png;base64,AAAA)'), /<span class="md-fig"><img class="md-img" src="data:image\/png;base64,AAAA" alt="d"><span class="md-cap">d<\/span><\/span>/)
  assert.doesNotMatch(html('![](data:image/png;base64,AAAA)'), /md-cap/) // no alt text, no caption
  // A badge whose address says what it shows stays a pill; a live one loads the real badge.
  assert.doesNotMatch(html('![b](https://img.shields.io/badge/build-passing-green.svg)'), /data-img/)
  assert.match(html('![CI](https://github.com/o/r/actions/workflows/ci.yml/badge.svg)'), /class="badge" data-img=/)
})

test('render: HTML that wraps blocks stays one element, as on GitHub', () => {
  const centered = '<p align="center">\n\n  <img src=".claude-plugin/icon.png" alt="icon" width="128" height="128">\n\n</p>\n\n# Title\n'
  const { blocks } = renderBlocks(centered)
  assert.equal(blocks.length, 2)
  assert.equal(centered.slice(blocks[0].from, blocks[0].to), centered.slice(0, centered.indexOf('</p>') + 4))
  assert.match(blocks[0].html, /^<p align="center">[\s\S]*data-img="\.claude-plugin\/icon\.png"[\s\S]*<\/p>$/)
  // Markdown inside: a <details> with a list, a centered <div> with badges.
  const details = renderBlocks('<details>\n<summary>More</summary>\n\n- a\n- b\n\n</details>\n').blocks
  assert.equal(details.length, 1)
  assert.match(details[0].html, /<details>[\s\S]*<li>a<\/li>[\s\S]*<\/details>/)
  assert.equal(renderBlocks('<div align="center">\n\n**Bold**\n\n</div>\n\nAfter\n').blocks.length, 2)
  // Never closed: left as separate blocks rather than swallowing the rest of the page.
  assert.equal(renderBlocks('<div>\n\nOne\n\nTwo\n').blocks.length, 3)
})

test('fingerprint ignores line endings and a byte order mark', () => {
  assert.deepEqual(fingerprintText('\uFEFFa\r\nb\r\n'), fingerprintText('a\nb\n'))
  assert.notDeepEqual(fingerprintText('a\nb\n'), fingerprintText('a\nc\n'))
})

/** A workspace with a document, an image bigger than one chunk, and things that must not be read. */
const workspace = () => {
  const base = mkdtempSync(join(tmpdir(), 'md-colorize-img-'))
  const root = join(base, 'repo')
  mkdirSync(join(root, 'docs', 'img'), { recursive: true })
  mkdirSync(join(root, '.github'), { recursive: true })
  mkdirSync(join(base, 'outside'), { recursive: true })
  const text = '# Doc\r\n\r\n![a](img/a.png)\r\n'
  writeFileSync(join(root, 'docs', 'readme.md'), text)
  writeFileSync(join(root, 'docs', 'other.md'), '# Other\n')
  const png = Buffer.alloc(CHUNK_BYTES * 2 + 1000)
  for (let i = 0; i < png.length; i++) {
    png[i] = (i * 31) & 255
  }
  writeFileSync(join(root, 'docs', 'img', 'a.png'), png)
  writeFileSync(join(root, '.github', 'logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>')
  writeFileSync(join(root, 'docs', 'secret.txt'), 'secret')
  writeFileSync(join(base, 'outside', 'x.png'), 'x')
  const host = {
    call: async (method: string) =>
      method === 'workspace.list'
        ? { workspaces: [{ id: 'w1', name: 'repo', path: root, branch: 'main', hostId: 'local' }] }
        : { workspaceId: 'w1', displayName: 'repo', branch: 'main' }
  }
  let remoteOn = true
  const downloads: string[] = []
  const service = createImageService({
    host,
    remoteAllowed: async () => remoteOn,
    remote: {
      get: async (url) => {
        downloads.push(url)
        return { bytes: new Uint8Array([1, 2, 3]), mime: 'image/png', etag: 'remote:1' }
      }
    }
  })
  return { root, text, png, service, downloads, setRemote: (on: boolean) => (remoteOn = on) }
}

const bytesOf = (text: string): number => Buffer.byteLength(text)

test('worker: finds the open document by its text', async () => {
  const { root, text, service } = workspace()
  const where = await service.locate({ ...fingerprintText(text), bytes: bytesOf(text) })
  assert.deepEqual(where, { root, files: [join(root, 'docs', 'readme.md')] })
  const none = await service.locate({ ...fingerprintText('not here'), bytes: 8 })
  assert.deepEqual(none, { root, files: [] })
})

test('worker: reads images inside the workspace only', async () => {
  const { root, png, service } = workspace()
  const files = [join(root, 'docs', 'readme.md')]
  const ask = (src: string, extra: Record<string, unknown> = {}): Promise<ImageAnswer> =>
    service.image({ src, files, root, offset: 0, etag: null, ...extra })

  const first = await ask('img/a.png')
  assert.equal(first.status, 'data')
  if (first.status !== 'data') return
  assert.equal(first.mime, 'image/png')
  assert.equal(first.size, png.length)
  assert.equal(first.done, false)
  assert.deepEqual(await ask('img/a.png', { etag: first.etag }), { status: 'unchanged', etag: first.etag })

  assert.equal((await ask('/docs/img/a.png')).status, 'data') // from the workspace root
  assert.equal((await ask('img/a%2Epng')).status, 'data') // percent-encoded, as marked writes it
  assert.equal((await ask('../.github/logo.svg')).status, 'data')
  assert.equal((await ask('img/a.png', { files: [] })).status, 'data') // unknown document: by path suffix
  assert.equal((await ask('secret.txt')).status, 'missing') // not an image
  assert.equal((await ask('../../outside/x.png')).status, 'missing') // outside every workspace
  assert.equal((await ask('img/a.png', { files: ['/etc/passwd.md'], root: '/' })).status, 'missing')
  assert.equal((await ask('img/missing.png')).status, 'missing')
})

test('worker: finds the file whatever line endings the editor was given', async () => {
  const { root, text, service } = workspace() // the file on disk has \r\n
  const where = { root, files: [join(root, 'docs', 'readme.md')] }
  for (const given of [text, text.replace(/\r\n/g, '\n'), `\uFEFF${text}`]) {
    assert.deepEqual(await service.locate({ ...fingerprintText(given), ...textSize(given) }), where)
  }
})

test('worker: a symbolic link is followed only to an image inside a workspace', async () => {
  const { root, service } = workspace()
  const img = join(root, 'docs', 'img')
  symlinkSync(join(root, '..', 'outside', 'x.png'), join(img, 'out.png'))
  symlinkSync(join(root, 'docs', 'secret.txt'), join(img, 'secret.png'))
  symlinkSync(join(img, 'a.png'), join(img, 'in.png'))
  const ask = (src: string): Promise<ImageAnswer> =>
    service.image({ src, files: [join(root, 'docs', 'readme.md')], root, offset: 0, etag: null })
  assert.equal((await ask('img/out.png')).status, 'missing') // leads out of the workspace
  assert.equal((await ask('img/secret.png')).status, 'missing') // leads to a file that is not an image
  assert.equal((await ask('img/in.png')).status, 'data')
  // git-annex keeps the picture in .git and links to it: fine, though .git is never named directly.
  const object = join(root, '.git', 'annex', 'objects', 'Xx', 'Yy', 'SHA256E-s3--abc.png')
  mkdirSync(object, { recursive: true })
  writeFileSync(join(object, 'SHA256E-s3--abc.png'), 'png')
  symlinkSync(join(object, 'SHA256E-s3--abc.png'), join(img, 'annexed.png'))
  assert.equal((await ask('img/annexed.png')).status, 'data')
  assert.equal((await ask('../.git/annex/objects/Xx/Yy/SHA256E-s3--abc.png/SHA256E-s3--abc.png')).status, 'missing')
  // A workspace that is itself reached through a link still works.
  const alias = join(root, '..', 'alias')
  symlinkSync(root, alias)
  const linked = createImageService({
    host: { call: async (method: string) => (method === 'workspace.list' ? { workspaces: [{ path: alias, hostId: 'local' }] } : null) },
    remoteAllowed: async () => false
  })
  const answer = await linked.image({ src: 'img/a.png', files: [join(alias, 'docs', 'readme.md')], root: alias, offset: 0 })
  assert.equal(answer.status, 'data')
})

test('worker: web images follow the setting', async () => {
  const { service, downloads, setRemote } = workspace()
  const web = await service.image({ src: 'https://example.com/a.png', offset: 0 })
  assert.equal(web.status, 'data')
  setRemote(false)
  assert.equal((await service.image({ src: 'https://example.com/b.png', offset: 0 })).status, 'missing')
  assert.deepEqual(downloads, ['https://example.com/a.png'])
})

test('frame loader: assembles an image from the worker in chunks', async () => {
  const { root, text, png, service } = workspace()
  const blobs: Blob[] = []
  const requests: string[] = []
  const loader = createImageLoader({
    request: async (name, input) => {
      requests.push(name)
      return name === 'colorize.locate' ? service.locate(input) : service.image(input)
    },
    text: () => text,
    createUrl: (blob) => {
      blobs.push(blob)
      return `blob:${blobs.length}`
    },
    revokeUrl: () => {}
  })
  assert.equal(await loader.load('img/a.png'), 'blob:1')
  assert.deepEqual(Buffer.from(await blobs[0].arrayBuffer()), png)
  assert.equal(blobs[0].type, 'image/png')
  assert.equal(loader.cached('img/a.png'), 'blob:1')
  assert.deepEqual(requests, ['colorize.locate', 'colorize.image', 'colorize.image', 'colorize.image'])
  assert.equal(await loader.load('img/nope.png'), null)
  assert.equal(await loader.load('img/nope.png'), null)
  assert.equal(requests.filter((r) => r === 'colorize.locate').length, 1)
  assert.equal(requests.length, 5) // a missing image is not asked about again right away
  void root
})

test('frame loader: rechecks files after a few seconds, keeps web images, looks for the document rarely', async () => {
  let clock = 0
  const requests: { name: string; src?: unknown }[] = []
  const answers: Record<string, unknown> = {
    'img/a.png': { status: 'data', mime: 'image/png', size: 1, etag: 'e1', data: 'AA==', done: true },
    'https://example.com/a.png': { status: 'data', mime: 'image/png', size: 1, etag: 'r1', data: 'AA==', done: true }
  }
  const loader = createImageLoader({
    request: async (name, input) => {
      requests.push({ name, src: input.src })
      if (name === 'colorize.locate') return { files: [], root: null } // the document is not found
      return input.etag ? { status: 'unchanged', etag: input.etag } : answers[input.src as string]
    },
    text: () => '# doc',
    now: () => clock,
    createUrl: () => `blob:${requests.length}`,
    revokeUrl: () => {}
  })
  await loader.load('img/a.png')
  await loader.load('https://example.com/a.png')
  const count = (name: string): number => requests.filter((r) => r.name === name).length
  assert.equal(count('colorize.image'), 2)
  clock = 10_000 // past the recheck time: the file is asked about (unchanged), the web image is not
  await loader.load('img/a.png')
  await loader.load('https://example.com/a.png')
  assert.equal(count('colorize.image'), 3)
  assert.equal(count('colorize.locate'), 1) // not found, but not looked for again yet
  clock = 70_000
  await loader.load('img/a.png')
  assert.equal(count('colorize.locate'), 2)
})

test('worker: an image request does not ask Orca which workspace is focused', async () => {
  const calls: string[] = []
  const root = mkdtempSync(join(tmpdir(), 'md-colorize-calls-'))
  writeFileSync(join(root, 'a.png'), 'x')
  const service = createImageService({
    host: { call: async (method: string) => (calls.push(method), method === 'workspace.list' ? { workspaces: [{ path: root, hostId: 'local' }] } : null) },
    remoteAllowed: async () => false
  })
  for (let i = 0; i < 3; i++) {
    assert.equal((await service.image({ src: 'a.png', files: [join(root, 'doc.md')], root, offset: 0 })).status, 'data')
  }
  assert.deepEqual(calls, ['workspace.list']) // listed once (cached), never workspace.readContext
})

test('remote: only public addresses', () => {
  for (const a of ['127.0.0.1', '10.1.2.3', '169.254.169.254', '192.168.1.1', '172.20.0.1', '100.64.0.1', '0.0.0.0', '::1', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1', '::ffff:7f00:1', 'localhost']) {
    assert.equal(isPublicAddress(a), false, a)
  }
  for (const a of ['8.8.8.8', '1.1.1.1', '::ffff:8.8.8.8', '2606:4700::1111']) {
    assert.equal(isPublicAddress(a), true, a)
  }
})

test('remote: downloads images, refuses the local network, follows redirects and caps the size', async () => {
  const png = Buffer.from('not really a png, any bytes will do')
  const server = createServer((req, res) => {
    if (req.url === '/a.png') {
      res.writeHead(200, { 'content-type': 'image/png', etag: '"v1"' })
      res.end(png)
    } else if (req.url === '/moved') {
      res.writeHead(302, { location: '/a.png' })
      res.end()
    } else if (req.url === '/page') {
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end('<html>')
    } else {
      res.writeHead(200, { 'content-type': 'image/png' })
      res.end(Buffer.alloc(5000))
    }
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as { port: number }
  const base = `http://127.0.0.1:${port}`
  const anyAddress = { allowed: () => true }
  try {
    await assert.rejects(downloadImage(`${base}/a.png`), /not a public address/)
    await assert.rejects(downloadImage(`http://localhost:${port}/a.png`), /not a public address/)
    const image = await downloadImage(`${base}/a.png`, anyAddress)
    assert.deepEqual(Buffer.from(image.bytes), png)
    assert.equal(image.mime, 'image/png')
    assert.equal(image.etag, 'remote:"v1"')
    assert.equal((await downloadImage(`${base}/moved`, anyAddress)).mime, 'image/png')
    await assert.rejects(downloadImage(`${base}/moved`, { ...anyAddress, maxRedirects: 0 }), /Too many redirects/)
    await assert.rejects(downloadImage(`${base}/page`, anyAddress), /Not an image/)
    await assert.rejects(downloadImage(`${base}/big`, { ...anyAddress, maxBytes: 1000 }), /too large/)
    await assert.rejects(downloadImage('file:///etc/passwd'), /Only http and https/)
  } finally {
    server.close()
  }
})

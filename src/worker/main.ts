// The plugin's worker, which Orca runs in Node.js. The editor frame has no file system and no
// network, so it asks the worker for images:
//
//   colorize.locate { hash, length, bytes, lines }
//     -> { files, root }: the files the open document may be (see locate.ts) and its workspace.
//   colorize.image { src, files, root, offset, etag }
//     -> { status: 'missing' } | { status: 'unchanged', etag }
//      | { status: 'data', mime, size, etag, data (base64 of one chunk), done }
//
// Only workspaces on this machine are searched, and paths the frame sends back are checked
// against them again before anything is read. Bundled to worker.mjs by tools/build.mjs.
import path from 'node:path'
import { createFileIndex, isInside, isMarkdownPath, type ListFiles } from './files'
import { CHUNK_BYTES, findLocalImage, imageMime, isRemote, MAX_IMAGE_BYTES, readChunk } from './local'
import { locateDocument } from './locate'
import { createRemoteCache, type RemoteImage } from './remote'

// Other workspaces searched after the focused one, for a document opened from elsewhere.
const MAX_OTHER_WORKSPACES = 8

type Host = { call(method: string, params?: unknown): Promise<unknown> }
type Workspace = { id?: string; name?: string; path?: unknown; branch?: string | null; hostId?: string | null }
type Context = { workspaceId?: string; displayName?: string; branch?: string } | null

export type ImageAnswer =
  | { status: 'missing' }
  | { status: 'unchanged'; etag: string }
  | { status: 'data'; mime: string; size: number; etag: string; data: string; done: boolean }

const MISSING: ImageAnswer = { status: 'missing' }

const record = (input: unknown): Record<string, unknown> =>
  input && typeof input === 'object' && !Array.isArray(input) ? (input as Record<string, unknown>) : {}

export function createImageService(deps: {
  host: Host
  remoteAllowed: () => Promise<boolean>
  listFiles?: ListFiles
  remote?: { get(url: string): Promise<RemoteImage> }
  workspaceTtlMs?: number
  now?: () => number
}) {
  const { host, remoteAllowed, listFiles = createFileIndex().list, remote = createRemoteCache(), workspaceTtlMs = 10_000, now = Date.now } = deps
  let workspaces: { at: number; value: Promise<Workspace[]> } | null = null

  const localWorkspaces = (): Promise<Workspace[]> => {
    if (!workspaces || now() - workspaces.at >= workspaceTtlMs) {
      const value = host
        .call('workspace.list')
        .then((r) =>
          (((r as { workspaces?: Workspace[] } | null)?.workspaces ?? []) as Workspace[]).filter(
            (w) => (w.hostId === 'local' || w.hostId == null) && typeof w.path === 'string' && path.isAbsolute(w.path)
          )
        )
        .catch(() => [])
      workspaces = { at: now(), value }
    }
    return workspaces.value
  }

  const rootsOf = (list: Workspace[]): string[] => [...new Set(list.map((w) => path.resolve(w.path as string)))]

  /** Every local workspace, and the focused one to search first (only finding the document needs it). */
  const workspaceRoots = async (): Promise<{ roots: string[]; focused: string | null }> => {
    const [list, context] = await Promise.all([
      localWorkspaces(),
      host.call('workspace.readContext').then((c) => c as Context, () => null)
    ])
    const focused =
      list.find((w) => context?.workspaceId && w.id === context.workspaceId) ??
      list.find((w) => context && w.name === context.displayName && (w.branch ?? '') === (context.branch ?? ''))
    return { roots: rootsOf(list), focused: focused ? path.resolve(focused.path as string) : null }
  }

  async function locate(input: unknown): Promise<{ files: string[]; root: string | null }> {
    const { hash, length, bytes, lines } = record(input)
    const { roots, focused } = await workspaceRoots()
    if (typeof hash !== 'string' || !Number.isInteger(length) || !Number.isInteger(bytes)) {
      return { files: [], root: focused }
    }
    const order = [...(focused ? [focused] : []), ...roots.filter((r) => r !== focused).slice(0, MAX_OTHER_WORKSPACES)]
    const found = await locateDocument({
      roots: order,
      fingerprint: { hash, length: length as number },
      bytes: bytes as number,
      lines: Number.isInteger(lines) && (lines as number) >= 0 ? (lines as number) : 0,
      listFiles
    })
    return found ?? { files: [], root: focused }
  }

  async function image(input: unknown): Promise<ImageAnswer> {
    const args = record(input)
    const src = typeof args.src === 'string' ? args.src.trim() : ''
    if (!src || src.length > 4096) {
      return MISSING
    }
    const offset = Number.isInteger(args.offset) && (args.offset as number) >= 0 ? (args.offset as number) : 0
    const known = typeof args.etag === 'string' ? args.etag : null

    if (isRemote(src)) {
      if (!(await remoteAllowed())) {
        return MISSING
      }
      let img: RemoteImage
      try {
        img = await remote.get(src.replace(/^<|>$/g, ''))
      } catch {
        return MISSING
      }
      return answer({ etag: img.etag, mime: img.mime, size: img.bytes.length, offset, known, read: async () => img.bytes.subarray(offset, offset + CHUNK_BYTES) })
    }

    const roots = rootsOf(await localWorkspaces()) // cached; asked once per chunk, so no focus lookup here
    const root = typeof args.root === 'string' && roots.includes(args.root) ? args.root : null
    const files = (Array.isArray(args.files) ? args.files : []).filter(
      (f): f is string => typeof f === 'string' && isMarkdownPath(f) && roots.some((r) => isInside(f, r))
    )
    const found = await findLocalImage({ src, files, root, roots, listFiles })
    const mime = found && imageMime(found.path)
    if (!found || !mime || found.size > MAX_IMAGE_BYTES) {
      return MISSING
    }
    return answer({ etag: `${found.mtimeMs}-${found.size}`, mime, size: found.size, offset, known, read: () => readChunk(found.path, offset) })
  }

  return { locate, image }
}

async function answer(a: {
  etag: string
  mime: string
  size: number
  offset: number
  known: string | null
  read: () => Promise<Uint8Array>
}): Promise<ImageAnswer> {
  if (a.offset === 0 && a.known === a.etag) {
    return { status: 'unchanged', etag: a.etag }
  }
  const bytes = await a.read()
  return {
    status: 'data',
    mime: a.mime,
    size: a.size,
    etag: a.etag,
    data: Buffer.from(bytes).toString('base64'),
    done: a.offset + bytes.length >= a.size
  }
}

type Orca = {
  host: Host
  settings: {
    get(key: string): Promise<unknown>
    onDidChange(listener: (change: { key: string }) => void): unknown
  }
  panels: { handle(name: string, handler: (input: unknown) => unknown): unknown }
}

export default function activate(orca: Orca): void {
  // Read once and again when it changes, so a request never waits on Settings.
  const readRemote = (): Promise<boolean> => orca.settings.get('remoteImages').then((v) => v !== false, () => true)
  let remoteOn = readRemote()
  orca.settings.onDidChange((change) => {
    if (change.key === 'remoteImages') {
      remoteOn = readRemote()
    }
  })
  const service = createImageService({ host: orca.host, remoteAllowed: () => remoteOn })
  orca.panels.handle('colorize.locate', (input) => service.locate(input))
  orca.panels.handle('colorize.image', (input) => service.image(input))
}

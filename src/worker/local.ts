// Image files on this machine. A source is a path relative to the document, a path from the
// workspace root ("/docs/a.png", as documentation sites write it), an absolute path or a file: URL.
// Only image file types are read, only inside a local workspace, and never named through a .git
// folder; a symbolic link must lead to an image inside a workspace too (git-annex's lead into .git).
import { open, realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isInside, type ListFiles } from './files'

// A multiple of 3, so each chunk's base64 can be joined as is; its base64 (512 KiB) stays under
// Orca's 1 MiB limit for a request's answer.
export const CHUNK_BYTES = 3 * 128 * 1024
export const MAX_IMAGE_BYTES = 32 * 1024 * 1024

const TYPES: Record<string, string> = {
  '.apng': 'image/apng',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp'
}

export const imageMime = (file: string): string | null => TYPES[path.extname(file).toLowerCase()] ?? null

export const isRemote = (src: string): boolean => /^https?:\/\//i.test(src.trim().replace(/^</, ''))

/** The file path in an image source, or null for a URL of another kind. */
function parseImagePath(src: string): string | null {
  const s = src.trim().replace(/^<|>$/g, '')
  if (/^file:/i.test(s)) {
    try {
      return fileURLToPath(s.split('#')[0])
    } catch {
      return null
    }
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(s) && !/^[a-z]:[\\/]/i.test(s)) {
    return null
  }
  const part = s.split(/[?#]/)[0]
  if (!part) {
    return null
  }
  try {
    return decodeURIComponent(part)
  } catch {
    return part
  }
}

const toPosix = (p: string): string => p.split(path.sep).join('/')

async function candidates(src: string, files: string[], root: string | null, listFiles: ListFiles): Promise<string[]> {
  const p = parseImagePath(src)
  if (!p) {
    return []
  }
  if (path.isAbsolute(p)) {
    return root ? [p, path.join(root, p)] : [p]
  }
  if (files.length > 0) {
    return files.map((file) => path.resolve(path.dirname(file), p))
  }
  // The document's file is unknown (new and unsaved, or outside every workspace): take the
  // workspace file whose path ends the same way, the shortest first.
  const wanted = toPosix(path.normalize(p)).replace(/^(?:\.\.?\/)+/, '')
  if (!root || !wanted) {
    return []
  }
  return (await listFiles(root)).filter((f) => toPosix(f).endsWith(`/${wanted}`)).sort((a, b) => a.length - b.length)
}

/**
 * The image `src` names, or null. `files` are the files the open document may be, `root` its
 * workspace, `roots` every local workspace (nothing outside them is read).
 */
export async function findLocalImage(options: {
  src: string
  files: string[]
  root: string | null
  roots: string[]
  listFiles: ListFiles
}): Promise<{ path: string; size: number; mtimeMs: number } | null> {
  const { src, files, root, roots, listFiles } = options
  const allowed = (file: string, within: string[]): boolean => imageMime(file) !== null && within.some((r) => isInside(file, r))
  let realRoots: string[] | null = null
  for (const candidate of await candidates(src, files, root, listFiles)) {
    if (!allowed(candidate, roots) || candidate.split(/[\\/]/).some((part) => part.toLowerCase() === '.git')) {
      continue
    }
    const info = await stat(candidate).catch(() => null)
    if (!info?.isFile()) {
      continue
    }
    // The name is checked above; a link (logo.png -> ~/.ssh/id_rsa) can point anywhere, so where it
    // really leads is checked too, against the workspaces as they really are.
    const real = await realpath(candidate).catch(() => null)
    realRoots ??= await Promise.all(roots.map((r) => realpath(r).catch(() => r)))
    if (real !== null && allowed(real, realRoots)) {
      return { path: real, size: info.size, mtimeMs: info.mtimeMs }
    }
  }
  return null
}

export async function readChunk(file: string, offset: number, length = CHUNK_BYTES): Promise<Uint8Array> {
  const handle = await open(file, 'r')
  try {
    const buffer = Buffer.alloc(length)
    const { bytesRead } = await handle.read(buffer, 0, length, offset)
    return buffer.subarray(0, bytesRead)
  } finally {
    await handle.close()
  }
}

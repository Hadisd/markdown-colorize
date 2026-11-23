// The files of a workspace folder, so the worker can find the open document and images by name.
// Walked breadth first (files near the root come first), skipping hidden folders and node_modules,
// and cached for a few seconds so a page's burst of image requests walks the folder once.
import { readdir } from 'node:fs/promises'
import path from 'node:path'

const SKIPPED = new Set(['node_modules'])

export type ListFiles = (root: string) => Promise<string[]>

export function createFileIndex({ maxEntries = 60_000, ttlMs = 10_000, now = Date.now } = {}): { list: ListFiles } {
  const cache = new Map<string, { at: number; files: Promise<string[]> }>()
  return {
    list(root) {
      const hit = cache.get(root)
      if (hit && now() - hit.at < ttlMs) {
        return hit.files
      }
      const files = walk(root, maxEntries).catch(() => [])
      cache.set(root, { at: now(), files })
      return files
    }
  }
}

async function walk(root: string, maxEntries: number): Promise<string[]> {
  const files: string[] = []
  const queue = [root]
  let seen = 0
  for (let i = 0; i < queue.length && seen < maxEntries; i++) {
    let entries
    try {
      entries = await readdir(queue[i], { withFileTypes: true })
    } catch {
      continue
    }
    entries.sort((a, b) => a.name.localeCompare(b.name))
    for (const entry of entries) {
      if (++seen > maxEntries) {
        break
      }
      if (entry.name.startsWith('.')) {
        continue
      }
      const full = path.join(queue[i], entry.name)
      if (entry.isDirectory()) {
        if (!SKIPPED.has(entry.name)) {
          queue.push(full)
        }
      } else if (entry.isFile()) {
        files.push(full)
      }
    }
  }
  return files
}

/** Whether `file` is `root` or inside it. */
export function isInside(file: string, root: string): boolean {
  const rel = path.relative(root, file)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

export const isMarkdownPath = (file: string): boolean => /\.(?:md|markdown|mdx)$/i.test(file)

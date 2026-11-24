// Finds the file an editor frame has open. Orca gives the frame the text but not the path, so the
// frame sends a fingerprint of the text (editor/fingerprint.ts) with its size, and this looks for
// Markdown files of that size whose text has the same fingerprint. Every copy is returned (the same
// README in several worktrees is common); images are looked up next to each in turn.
import { readFile, stat } from 'node:fs/promises'
import { fingerprintText, type Fingerprint } from '../../editor/fingerprint'
import { isMarkdownPath, type ListFiles } from './files'

const BOM_BYTES = 3
const MAX_MATCHES = 8

/**
 * `roots` in search order (the focused workspace first); the first root with a match wins. `bytes`
 * and `lines` are the size and line breaks of the text with \n endings and no byte order mark
 * (editor/fingerprint.ts textSize): the fingerprint ignores both, so a file may be bigger by one
 * byte per \r\n and by a byte order mark.
 */
export async function locateDocument(options: {
  roots: string[]
  fingerprint: Fingerprint
  bytes: number
  lines?: number
  listFiles: ListFiles
}): Promise<{ root: string; files: string[] } | null> {
  const { roots, fingerprint, bytes, lines = 0, listFiles } = options
  for (const root of roots) {
    const markdown = (await listFiles(root)).filter(isMarkdownPath)
    const sizes = await Promise.all(markdown.map((file) => stat(file).then((s) => s.size, () => -1)))
    const files: string[] = []
    for (const [i, file] of markdown.entries()) {
      if (sizes[i] < bytes || sizes[i] > bytes + lines + BOM_BYTES) {
        continue
      }
      let text: string
      try {
        text = await readFile(file, 'utf8')
      } catch {
        continue
      }
      const other = fingerprintText(text)
      if (other.length === fingerprint.length && other.hash === fingerprint.hash) {
        files.push(file)
        if (files.length >= MAX_MATCHES) {
          break
        }
      }
    }
    if (files.length > 0) {
      return { root, files }
    }
  }
  return null
}

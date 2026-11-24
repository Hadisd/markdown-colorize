// A short fingerprint of a document's text, used to find which file it came from.
//
// Orca gives a custom editor the file's text but not its path, and relative images need that path.
// The frame sends this fingerprint and the worker (src/worker) compares it with the Markdown files
// in the workspace. A byte order mark and line endings do not count, so the text Orca decoded and
// the file's own bytes compare equal. Shared by the frame and the worker.

export type Fingerprint = { length: number; hash: string }

const normalizeText = (text: string): string => text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')

const hex = (n: number): string => (n >>> 0).toString(16).padStart(8, '0')

/** The normalized text's size in UTF-8 bytes and its number of line breaks. The file holding the
 *  text is that size, plus one byte per break written \r\n and three for a byte order mark. */
export function textSize(text: string): { bytes: number; lines: number } {
  const t = normalizeText(text)
  let lines = 0
  for (let i = t.indexOf('\n'); i >= 0; i = t.indexOf('\n', i + 1)) {
    lines++
  }
  return { bytes: new TextEncoder().encode(t).length, lines }
}

/** The normalized text's length and a 64-bit hash of it (two 32-bit lanes), as 16 hex digits. */
export function fingerprintText(text: string): Fingerprint {
  const t = normalizeText(text)
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507)
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507)
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return { length: t.length, hash: hex(h2) + hex(h1) }
}

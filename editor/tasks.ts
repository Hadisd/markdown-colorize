// Task lists: `- [ ] todo` and `1. [x] done`. render.ts draws each box as a button; clicking it
// changes the one character between the brackets in the file.

// A list item (inside quotes too) that starts with a box. marked, like GitHub, needs a space after
// the box, and a list marker before it.
const TASK = /^((?:[ \t]*>)*[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+\[)([ xX])\] /
const FENCE = /^(?:[ \t]*>)*[ \t]*(?:[-*+][ \t]+|\d{1,9}[.)][ \t]+)?(`{3,}|~{3,})(.*)$/

/**
 * Where the boxes of a block's Markdown are: the offset of the character between the brackets of
 * each task, in the order they are drawn. Fenced code is skipped, so a `- [ ]` shown in a code
 * sample is not a box.
 */
export function taskMarks(source: string): number[] {
  const marks: number[] = []
  let fence = ''
  let offset = 0
  for (const line of source.split('\n')) {
    const f = FENCE.exec(line)
    if (fence) {
      // A fence closes with the same character, at least as many times, and nothing after it.
      if (f && f[1][0] === fence[0] && f[1].length >= fence.length && f[2].trim() === '') {
        fence = ''
      }
    } else if (f && !(f[1][0] === '`' && f[2].includes('`'))) {
      fence = f[1]
    } else {
      const m = TASK.exec(line)
      if (m) {
        marks.push(offset + m[1].length)
      }
    }
    offset += line.length + 1
  }
  return marks
}

/** The text with the box at `at` ticked or cleared, or null when `at` is not a box any more. */
export function toggleTask(text: string, at: number): string | null {
  const c = text[at]
  if (!(c === ' ' || c === 'x' || c === 'X') || text[at - 1] !== '[' || text[at + 1] !== ']') {
    return null
  }
  return text.slice(0, at) + (c === ' ' ? 'x' : ' ') + text.slice(at + 1)
}

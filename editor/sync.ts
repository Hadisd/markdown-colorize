/** The one stretch of `base` that `changed` replaced: base[from, to) became changed[from, toNew). */
function changedSpan(base: string, changed: string): { from: number; to: number; toNew: number } {
  let from = 0
  while (from < base.length && from < changed.length && base[from] === changed[from]) {
    from++
  }
  let to = base.length
  let toNew = changed.length
  while (to > from && toNew > from && base[to - 1] === changed[toNew - 1]) {
    to--
    toNew--
  }
  return { from, to, toNew }
}

/**
 * Three-way merge for text that changed on disk (`outside`) while you typed (`mine`), both made
 * from `base`. When the two changes are in different places both are kept; when they overlap the
 * file on disk wins, because it is what other tools see.
 */
export function mergeText(base: string, outside: string, mine: string): string {
  if (mine === base) {
    return outside
  }
  if (outside === base) {
    return mine
  }
  const o = changedSpan(base, outside)
  const m = changedSpan(base, mine)
  if (o.to <= m.from) {
    return base.slice(0, o.from) + outside.slice(o.from, o.toNew) + base.slice(o.to, m.from) + mine.slice(m.from, m.toNew) + base.slice(m.to)
  }
  if (m.to <= o.from) {
    return base.slice(0, m.from) + mine.slice(m.from, m.toNew) + base.slice(m.to, o.from) + outside.slice(o.from, o.toNew) + base.slice(o.to)
  }
  return outside
}

/** The only code that talks to Orca: gives the file's text, sends edits, and merges outside writes. */
export function start() {
  const document = orca.document
  if (!document) {
    throw new Error('this file runs as a custom editor')
  }
  return document.session<string>({ merge: mergeText })
}

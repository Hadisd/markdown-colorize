// Undo and redo for the whole page. Orca keeps no undo history for plugin editors, and a block's own
// editor forgets its history when you leave the block, so each editing session is recorded here as
// one small change (what was replaced, and what replaced it).

type Patch = { from: number; removed: string; inserted: string }

/** The smallest single change that turns `a` into `b`. */
export function patchBetween(a: string, b: string): Patch {
  let from = 0
  while (from < a.length && from < b.length && a[from] === b[from]) {
    from++
  }
  let endA = a.length
  let endB = b.length
  while (endA > from && endB > from && a[endA - 1] === b[endB - 1]) {
    endA--
    endB--
  }
  return { from, removed: a.slice(from, endA), inserted: b.slice(from, endB) }
}

const MAX_STEPS = 300

export class PageHistory {
  private undoSteps: Patch[] = []
  private redoSteps: Patch[] = []

  get canUndo(): boolean {
    return this.undoSteps.length > 0
  }
  get canRedo(): boolean {
    return this.redoSteps.length > 0
  }

  /** Records one editing session that turned `before` into `after`. */
  record(before: string, after: string): void {
    if (before === after) {
      return
    }
    this.undoSteps.push(patchBetween(before, after))
    if (this.undoSteps.length > MAX_STEPS) {
      this.undoSteps.shift()
    }
    this.redoSteps = []
  }

  /** The text with the last session taken back, or null when there is nothing (safe) to undo. */
  undo(current: string): { text: string; at: number } | null {
    const step = this.undoSteps.pop()
    if (!step) {
      return null
    }
    if (current.slice(step.from, step.from + step.inserted.length) !== step.inserted) {
      this.clear() // the text is no longer what this step made; stop rather than damage it
      return null
    }
    this.redoSteps.push(step)
    return { text: current.slice(0, step.from) + step.removed + current.slice(step.from + step.inserted.length), at: step.from }
  }

  redo(current: string): { text: string; at: number } | null {
    const step = this.redoSteps.pop()
    if (!step) {
      return null
    }
    if (current.slice(step.from, step.from + step.removed.length) !== step.removed) {
      this.clear()
      return null
    }
    this.undoSteps.push(step)
    return { text: current.slice(0, step.from) + step.inserted + current.slice(step.from + step.removed.length), at: step.from }
  }

  /** Forget everything, for when the file changed somewhere else and old steps no longer apply. */
  clear(): void {
    this.undoSteps = []
    this.redoSteps = []
  }
}

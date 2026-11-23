// Images for the page. The frame can load nothing itself (no files, no network), so the plugin's
// worker (src/worker/main.ts) finds the open file, reads the image next to it or downloads a web
// one, and sends it back in base64 chunks, which become a blob: URL here.
//
// render.ts draws each image as a placeholder with its address in data-img; showImages swaps the
// placeholder for the picture once it arrives, and puts it back if the picture goes away.
import { fingerprintText } from './fingerprint'

type Answer =
  | { status: 'missing' }
  | { status: 'unchanged'; etag: string }
  | { status: 'data'; mime: string; size: number; etag: string; data: string; done: boolean }
type Where = { files: string[]; root: string | null }
type Request = (name: string, input: Record<string, unknown>) => Promise<unknown>

// A file shown in the last few seconds is reused as is; after that the worker is asked whether it
// changed (same etag: keep it), so an image someone rewrites shows up on the next redraw. A web
// image is kept for as long as the page is open: asking again would download it again.
const RECHECK_MS = 4000
// A picture that could not be found is asked about again after this long, not on every redraw.
const RETRY_MS = 15_000
// The same for the document's own file: looking for it walks every workspace.
const RELOCATE_MS = 60_000
// Long enough for anything still showing an old copy to be redrawn.
const REVOKE_MS = 30_000
const PARALLEL = 4

const isRemote = (src: string): boolean => /^https?:\/\//i.test(src)

// No return type: `new Uint8Array(n)` infers the ArrayBuffer-backed kind a Blob accepts.
const decode = (data: string) => {
  const binary = atob(data)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

export type ImageLoader = {
  /** The picture for `src` when one is already here; it may be rechecked by `load`. */
  cached(src: string): string | null
  /** A blob: URL for `src`, or null when the worker cannot find it. */
  load(src: string): Promise<string | null>
}

export function createImageLoader(deps: {
  request: Request
  /** The document's text as Orca has it, line endings and all, to find its file. */
  text: () => string
  now?: () => number
  createUrl?: (blob: Blob) => string
  revokeUrl?: (url: string) => void
}): ImageLoader {
  const { request, text, now = Date.now } = deps
  const createUrl = deps.createUrl ?? ((blob: Blob) => URL.createObjectURL(blob))
  const revokeUrl = deps.revokeUrl ?? ((url: string) => URL.revokeObjectURL(url))
  const entries = new Map<string, { url: string; etag: string; checkedAt: number }>()
  const misses = new Map<string, number>()
  const pending = new Map<string, Promise<string | null>>()

  let where: Where | null = null
  let whereAt = 0
  let locating: Promise<Where> | null = null
  const locate = (): Promise<Where> => {
    if (where && (where.files.length > 0 || now() - whereAt < RELOCATE_MS)) {
      return Promise.resolve(where)
    }
    locating ??= (async () => {
      const t = text()
      let found: Where = { files: [], root: null }
      try {
        const r = (await request('colorize.locate', { ...fingerprintText(t), bytes: new TextEncoder().encode(t).length })) as Partial<Where> | null
        found = { files: Array.isArray(r?.files) ? r.files.filter((f) => typeof f === 'string') : [], root: typeof r?.root === 'string' ? r.root : null }
      } catch (error) {
        console.warn('[Markdown Colorize] could not find the open file for its images', error)
      }
      where = found
      whereAt = now()
      return found
    })().finally(() => {
      locating = null
    })
    return locating
  }

  let active = 0
  const waiting: (() => void)[] = []
  const queued = async <T>(job: () => Promise<T>): Promise<T> => {
    if (active >= PARALLEL) {
      await new Promise<void>((resolve) => waiting.push(resolve))
    }
    active++
    try {
      return await job()
    } finally {
      active--
      waiting.shift()?.()
    }
  }

  const fetchImage = async (src: string): Promise<string | null> => {
    const previous = entries.get(src)
    const base = { src, ...(isRemote(src) ? { files: [], root: null } : await locate()) }
    const ask = async (offset: number, etag: string | null): Promise<Answer> =>
      ((await request('colorize.image', { ...base, offset, etag })) as Answer | null) ?? { status: 'missing' }

    const first = await ask(0, previous?.etag ?? null)
    if (first.status === 'unchanged' && previous) {
      previous.checkedAt = now()
      return previous.url
    }
    if (first.status !== 'data') {
      return null
    }
    const chunks = [decode(first.data)]
    let received = chunks[0].length
    let done = first.done
    while (!done && received < first.size) {
      const next = await ask(received, null)
      if (next.status !== 'data' || next.etag !== first.etag) {
        return null // the file changed between chunks; the next redraw starts over
      }
      const chunk = decode(next.data)
      if (chunk.length === 0) {
        break
      }
      chunks.push(chunk)
      received += chunk.length
      done = next.done
    }
    const url = createUrl(new Blob(chunks, { type: first.mime }))
    entries.set(src, { url, etag: first.etag, checkedAt: now() })
    if (previous) {
      setTimeout(() => revokeUrl(previous.url), REVOKE_MS)
    }
    return url
  }

  return {
    cached: (src) => entries.get(src)?.url ?? null,
    load(src) {
      const entry = entries.get(src)
      if (entry && (isRemote(src) || now() - entry.checkedAt < RECHECK_MS)) {
        return Promise.resolve(entry.url)
      }
      const missed = misses.get(src)
      if (!entry && missed !== undefined && now() - missed < RETRY_MS) {
        return Promise.resolve(null)
      }
      let p = pending.get(src)
      if (!p) {
        p = queued(() => fetchImage(src))
          .catch(() => null)
          .then((url) => {
            if (url === null) {
              const gone = entries.get(src)
              entries.delete(src)
              misses.set(src, now())
              if (gone) {
                setTimeout(() => revokeUrl(gone.url), REVOKE_MS)
              }
            } else {
              misses.delete(src)
            }
            return url
          })
          .finally(() => pending.delete(src))
        pending.set(src, p)
      }
      return p
    }
  }
}

const SIZE = /^\d{1,4}(?:px|%)?$/

/** The picture, with its alt text as a caption below it (badges and empty alt text have none).
 *  The same markup as render.ts draws for a data: image. */
const pictureFor = (placeholder: HTMLElement, url: string): { el: HTMLElement; img: HTMLImageElement } => {
  const badge = placeholder.classList.contains('badge')
  const alt = placeholder.dataset.alt ?? ''
  const img = document.createElement('img')
  img.className = badge ? 'md-img badge-img' : 'md-img'
  img.alt = alt
  // As attributes, the way GitHub draws them: with a width the height follows the picture's shape
  // (.md-img has height: auto), so a narrow page shrinks it without stretching it. A height alone
  // is a style, since height: auto would ignore the attribute.
  const w = placeholder.dataset.w && SIZE.test(placeholder.dataset.w) ? placeholder.dataset.w.replace(/px$/, '') : ''
  const h = placeholder.dataset.h && SIZE.test(placeholder.dataset.h) ? placeholder.dataset.h.replace(/px$/, '') : ''
  if (w) {
    img.setAttribute('width', w)
    if (h) {
      img.setAttribute('height', h)
    }
  } else if (h) {
    img.style.height = /\d$/.test(h) ? `${h}px` : h
  }
  img.src = url
  let el: HTMLElement = img
  if (!badge && alt.trim()) {
    el = document.createElement('span')
    el.className = 'md-fig'
    const caption = document.createElement('span')
    caption.className = 'md-cap'
    caption.textContent = alt.trim()
    el.append(img, caption)
  }
  // Not a picture after all (a web page behind a .png address): back to the placeholder.
  img.addEventListener('error', () => el.replaceWith(placeholder), { once: true })
  return { el, img }
}

/** Swaps every image placeholder under `root` for its picture as it arrives. */
export function showImages(root: HTMLElement, loader: ImageLoader): void {
  for (const placeholder of root.querySelectorAll<HTMLElement>('.img-ph[data-img], .badge[data-img]')) {
    const src = placeholder.dataset.img ?? ''
    if (!src || placeholder.dataset.imgWait) {
      continue
    }
    placeholder.dataset.imgWait = '1'
    const cached = loader.cached(src)
    let shown: { el: HTMLElement; img: HTMLImageElement | null } = { el: placeholder, img: null }
    if (cached) {
      shown = pictureFor(placeholder, cached)
      placeholder.replaceWith(shown.el)
    }
    void loader.load(src).then((url) => {
      if (!shown.el.isConnected) {
        return
      }
      if (url && shown.img) {
        if (shown.img.getAttribute('src') !== url) {
          shown.img.src = url
        }
      } else if (url) {
        const picture = pictureFor(placeholder, url)
        shown.el.replaceWith(picture.el)
      } else if (shown.img) {
        shown.el.replaceWith(placeholder)
      }
    })
  }
}

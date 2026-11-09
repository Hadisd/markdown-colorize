// Draws ```mermaid blocks, taking colors from the same CSS variables as the rest of the page, so
// diagrams follow Auto, Dark, Light and Dim. Mermaid is imported statically: Orca's frame loader
// never finished a dynamic import() of it, so a lazy load left every diagram as plain source.

import mermaid from './vendor/mermaid.js'

type Rgb = [number, number, number]

const canvas = document.createElement('canvas')
canvas.width = canvas.height = 1
const ctx = canvas.getContext('2d', { willReadFrequently: true })

/** Any CSS color (hex, hsl, oklch, color-mix) as [r, g, b], by painting one pixel. */
const toRgb = (css: string, fallback: Rgb): Rgb => {
  if (!ctx || css.trim() === '') {
    return fallback
  }
  ctx.clearRect(0, 0, 1, 1)
  ctx.fillStyle = '#000'
  ctx.fillStyle = css
  ctx.fillRect(0, 0, 1, 1)
  const d = ctx.getImageData(0, 0, 1, 1).data
  return [d[0], d[1], d[2]]
}

const hex = ([r, g, b]: Rgb): string => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`
const mix = (a: Rgb, b: Rgb, t: number): string =>
  hex([0, 1, 2].map((i) => Math.round(a[i] * t + b[i] * (1 - t))) as Rgb)

const luminance = ([r, g, b]: Rgb): number => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255

const themeVariables = (): Record<string, unknown> => {
  const style = getComputedStyle(document.documentElement)
  const color = (name: string, fallback: Rgb): Rgb => toRgb(style.getPropertyValue(name), fallback)
  const bg = color('--bg', [22, 24, 35])
  const fg = color('--fg', [180, 188, 194])
  const pink = color('--pink', [246, 138, 155])
  const orange = color('--orange', [251, 164, 111])
  const yellow = color('--yellow', [207, 202, 124])
  const green = color('--green', [200, 238, 152])
  const cyan = color('--cyan', [166, 219, 230])
  const blue = color('--blue', [170, 184, 242])
  const lav = color('--lav', [203, 174, 227])
  const mint = color('--mint', [179, 228, 203])
  const text = hex(fg)
  const tint = (c: Rgb, t = 0.2): string => mix(c, bg, t)
  return {
    darkMode: luminance(bg) < 0.5,
    background: hex(bg),
    fontFamily: getComputedStyle(document.body).fontFamily,
    textColor: text,
    primaryColor: tint(lav, 0.22), primaryTextColor: text, primaryBorderColor: hex(lav),
    secondaryColor: tint(cyan), secondaryTextColor: text, secondaryBorderColor: hex(cyan),
    tertiaryColor: tint(pink), tertiaryTextColor: text, tertiaryBorderColor: hex(pink),
    lineColor: mix(fg, bg, 0.6), nodeBorder: hex(lav), mainBkg: tint(lav, 0.22),
    clusterBkg: mix(fg, bg, 0.06), clusterBorder: mix(fg, bg, 0.25),
    titleColor: text, edgeLabelBackground: hex(bg),
    noteBkgColor: tint(yellow), noteTextColor: text, noteBorderColor: hex(yellow),
    actorBkg: tint(lav, 0.22), actorBorder: hex(lav), actorTextColor: text, actorLineColor: mix(fg, bg, 0.45),
    signalColor: text, signalTextColor: text,
    labelBoxBkgColor: tint(cyan), labelBoxBorderColor: hex(cyan), labelTextColor: text, loopTextColor: text,
    activationBkgColor: tint(lav, 0.35), activationBorderColor: hex(lav), sequenceNumberColor: hex(bg),
    pie1: hex(pink), pie2: hex(orange), pie3: hex(yellow), pie4: hex(green),
    pie5: hex(cyan), pie6: hex(blue), pie7: hex(lav), pie8: hex(mint),
    pieStrokeColor: hex(bg), pieTitleTextColor: text, pieLegendTextColor: text, pieSectionTextColor: hex(bg),
    pieOuterStrokeColor: mix(fg, bg, 0.25)
  }
}

let run = 0

/** Draws every diagram under `root`; a newer call cancels an older one that is still going. */
export async function renderDiagrams(root: HTMLElement): Promise<void> {
  const blocks = Array.from(root.querySelectorAll<HTMLElement>('.diagram[data-src]'))
  const mine = ++run
  if (blocks.length === 0) {
    return
  }
  try {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'base',
      themeVariables: themeVariables(),
      flowchart: { htmlLabels: true }
    })
    let n = 0
    for (const block of blocks) {
      if (mine !== run) {
        return
      }
      const source = block.getAttribute('data-src') ?? ''
      const id = `mmd-${mine}-${n++}`
      try {
        const { svg } = await mermaid.render(id, source)
        if (mine !== run) {
          return
        }
        block.innerHTML = svg
        block.classList.add('drawn')
        block.classList.remove('failed')
      } catch (error) {
        document.getElementById(`d${id}`)?.remove() // Mermaid can leave its error drawing in <body>
        const note = document.createElement('div')
        note.className = 'diagram-error'
        note.textContent = `Diagram error: ${String(error instanceof Error ? error.message : error).split('\n')[0]}`
        const code = document.createElement('code')
        code.className = 'hljs'
        code.textContent = source
        const pre = document.createElement('pre')
        pre.append(code)
        block.replaceChildren(note, pre)
        block.classList.add('failed')
      }
    }
  } catch (error) {
    // The library would not load or start: say so above the source, which stays visible.
    for (const block of blocks) {
      if (!block.querySelector('.diagram-error')) {
        const note = document.createElement('div')
        note.className = 'diagram-error'
        note.textContent = `Diagrams are unavailable: ${String(error instanceof Error ? error.message : error).split('\n')[0]}`
        block.prepend(note)
      }
    }
  }
}

export type TocEntry = { depth: number; text: string; id: string }
export type RenderOptions = { mdx?: boolean }
export type Block = { from: number; to: number; html: string }
export type BlockRender = { blocks: Block[]; toc: TocEntry[]; words: number }
export function renderBlocks(source: string, options?: RenderOptions): BlockRender
export function highlightCode(code: string, lang: string): string

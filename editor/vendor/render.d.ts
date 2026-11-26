export type TocEntry = { depth: number; text: string; id: string }
export type RenderOptions = { mdx?: boolean; definitions?: string; metaOnly?: boolean }
export type Block = { from: number; to: number; html: string }
export type BlockRender = { blocks: Block[]; toc: TocEntry[]; words: number; definitions: string }
export const ANCHOR_PREFIX: string
export function renderBlocks(source: string, options?: RenderOptions): BlockRender
export function highlightCode(code: string, lang: string): string

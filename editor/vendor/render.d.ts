export type TocEntry = { depth: number; text: string; id: string }
export type Rendered = { html: string; toc: TocEntry[]; words: number }
export type RenderOptions = { mdx?: boolean }
export function renderMarkdown(source: string, options?: RenderOptions): Rendered

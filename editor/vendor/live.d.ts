export type LiveOptions = {
  doc: string
  highlight: (code: string, lang: string) => string
  onChange: (text: string) => void
  onOpenLink: (url: string) => void
  onExit?: () => void
  onBoundary?: (direction: 'up' | 'down') => void
}
export type LiveEditor = {
  getText(): string
  focus(): void
  setCursor(pos: number): void
  destroy(): void
}
export function createLive(parent: HTMLElement, options: LiveOptions): LiveEditor

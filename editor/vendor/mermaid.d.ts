type MermaidApi = {
  initialize(config: Record<string, unknown>): void
  render(id: string, text: string): Promise<{ svg: string }>
}
declare const mermaid: MermaidApi
export default mermaid

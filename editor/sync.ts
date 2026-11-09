/** This viewer never writes the file, so when the file changes outside the editor the new text wins. */
export function mergeText(_base: string, outside: string, _mine: string): string {
  return outside
}

/** The only code that talks to Orca: gives the file's text and tells us when it changes. */
export function start() {
  const document = orca.document
  if (!document) {
    throw new Error('this file runs as a custom editor')
  }
  return document.session<string>({ merge: mergeText })
}

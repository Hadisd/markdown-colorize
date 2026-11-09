import { mountViewer } from './app'
import { createLive } from './vendor/live.js'

await mountViewer({ mdx: true, editor: createLive })

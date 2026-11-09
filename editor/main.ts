import { mountViewer } from './app'
import { createLive } from './vendor/live.js'

await mountViewer({ mdx: false, editor: createLive })

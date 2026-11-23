// Web images, which the editor frame cannot fetch itself (it has no network).
//
// The addresses come from document text, which may not be the reader's own (a cloned repository,
// a file an agent downloaded), so the worker must not become a way into the reader's machine or
// network:
// - only http and https, and only public addresses: an IP literal is checked before connecting and
//   a host name when it resolves, so a name pointing at 127.0.0.1 or 169.254.169.254 is refused;
// - redirects are followed one by one, each target checked the same way;
// - the body is counted as it arrives and stops at the size limit, whatever Content-Length says;
// - only images are kept.
import dns from 'node:dns'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import { imageMime, MAX_IMAGE_BYTES } from './local'

export type RemoteImage = { bytes: Uint8Array; mime: string; etag: string }

const BLOCKED = new net.BlockList()
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]
] as const) {
  BLOCKED.addSubnet(address, prefix, 'ipv4')
}
for (const [address, prefix] of [
  ['::', 128], ['::1', 128], ['64:ff9b::', 96], ['100::', 64], ['2001:db8::', 32],
  ['fc00::', 7], ['fe80::', 10], ['ff00::', 8]
] as const) {
  BLOCKED.addSubnet(address, prefix, 'ipv6')
}

/** Whether `address` (an IP literal) is a public unicast address. BlockList checks an IPv4-mapped
 *  IPv6 address (::ffff:127.0.0.1, ::ffff:7f00:1) against the IPv4 ranges itself. */
export function isPublicAddress(address: string): boolean {
  const family = net.isIP(address)
  return family !== 0 && !BLOCKED.check(address, family === 4 ? 'ipv4' : 'ipv6')
}

const refused = (host: string): Error => new Error(`Refused ${host}: not a public address.`)

type LookupCallback = (error: Error | null, address?: string | dns.LookupAddress[], family?: number) => void

/** A dns.lookup that refuses a name if any address it resolves to is not allowed, so the check
 *  holds for the address the socket really connects to. */
const guardedLookup =
  (allowed: (address: string) => boolean) =>
  (hostname: string, options: dns.LookupOptions, callback: LookupCallback): void => {
    dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
      if (error) {
        callback(error)
        return
      }
      if (addresses.length === 0 || !addresses.every((a) => allowed(a.address))) {
        callback(refused(hostname))
        return
      }
      if (options.all) {
        callback(null, addresses)
      } else {
        callback(null, addresses[0].address, addresses[0].family)
      }
    })
  }

export function downloadImage(
  url: string,
  { allowed = isPublicAddress, maxBytes = MAX_IMAGE_BYTES, maxRedirects = 5, timeoutMs = 15_000 } = {}
): Promise<RemoteImage> {
  return new Promise((resolve, reject) => {
    let active: http.ClientRequest | null = null
    let settled = false
    const deadline = setTimeout(() => fail(new Error('Timed out.')), timeoutMs)
    const fail = (error: Error): void => {
      if (!settled) {
        settled = true
        clearTimeout(deadline)
        active?.destroy()
        reject(error)
      }
    }
    const succeed = (image: RemoteImage): void => {
      if (!settled) {
        settled = true
        clearTimeout(deadline)
        resolve(image)
      }
    }

    const attempt = (target: string, redirectsLeft: number): void => {
      let parsed: URL
      try {
        parsed = new URL(target)
      } catch {
        fail(new Error('Not a URL.'))
        return
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        fail(new Error('Only http and https images are loaded.'))
        return
      }
      if (parsed.username || parsed.password) {
        fail(new Error('Addresses with credentials are not loaded.'))
        return
      }
      // Node connects to an IP literal without a lookup, so check it here.
      const host = parsed.hostname.replace(/^\[|\]$/g, '')
      if (net.isIP(host) && !allowed(host)) {
        fail(refused(host))
        return
      }
      const client = parsed.protocol === 'https:' ? https : http
      active = client.get(
        parsed,
        { lookup: guardedLookup(allowed) as never, headers: { accept: 'image/*', 'user-agent': 'markdown-colorize' } },
        (response) => {
          const status = response.statusCode ?? 0
          if (status >= 300 && status < 400 && response.headers.location) {
            response.resume()
            if (redirectsLeft <= 0) {
              fail(new Error('Too many redirects.'))
              return
            }
            let next: string
            try {
              next = new URL(response.headers.location, parsed).href // a bad Location must not throw here
            } catch {
              fail(new Error('Bad redirect.'))
              return
            }
            attempt(next, redirectsLeft - 1)
            return
          }
          if (status < 200 || status >= 300) {
            response.resume()
            fail(new Error(`HTTP ${status}`))
            return
          }
          const type = String(response.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase()
          const mime = type.startsWith('image/') ? type : imageMime(parsed.pathname)
          if (!mime) {
            response.resume()
            fail(new Error('Not an image.'))
            return
          }
          if (Number(response.headers['content-length']) > maxBytes) {
            response.resume()
            fail(new Error('Image is too large.'))
            return
          }
          const chunks: Buffer[] = []
          let received = 0
          response.on('data', (chunk: Buffer) => {
            received += chunk.length
            if (received > maxBytes) {
              fail(new Error('Image is too large.'))
              return
            }
            chunks.push(chunk)
          })
          response.on('end', () => {
            const bytes = Buffer.concat(chunks)
            const tag = response.headers.etag ?? response.headers['last-modified'] ?? String(bytes.length)
            succeed({ bytes, mime, etag: `remote:${tag}` })
          })
          response.on('error', fail)
        }
      )
      active.on('error', fail)
    }

    attempt(url, maxRedirects)
  })
}

/**
 * Downloads kept for a minute, so the chunks of one image (and a badge used several times) come
 * from one download. Together they stay under `maxTotalBytes`.
 */
export function createRemoteCache({
  download = (url: string) => downloadImage(url),
  ttlMs = 60_000,
  maxEntries = 64,
  maxTotalBytes = 64 * 1024 * 1024,
  now = Date.now
} = {}): { get(url: string): Promise<RemoteImage> } {
  type Entry = { at: number; image: Promise<RemoteImage>; size: number }
  const cache = new Map<string, Entry>()

  // Drops the oldest images, never the one just asked for.
  const trim = (keep: Entry): void => {
    let total = 0
    for (const e of cache.values()) {
      total += e.size
    }
    for (const [url, e] of cache) {
      if (cache.size <= maxEntries && total <= maxTotalBytes) {
        break
      }
      if (e !== keep) {
        cache.delete(url)
        total -= e.size
      }
    }
  }

  return {
    get(url) {
      const hit = cache.get(url)
      if (hit && now() - hit.at < ttlMs) {
        return hit.image
      }
      const entry: Entry = { at: now(), image: download(url), size: 0 }
      cache.set(url, entry)
      entry.image.then(
        (image) => {
          entry.size = image.bytes.length
          trim(entry)
        },
        () => {
          if (cache.get(url) === entry) {
            cache.delete(url)
          }
        }
      )
      trim(entry)
      return entry.image
    }
  }
}

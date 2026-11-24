// Markdown Colorize worker, built from src/worker by tools/build.mjs. Do not edit.

// src/worker/main.ts
import path3 from "node:path";

// src/worker/files.ts
import { readdir } from "node:fs/promises";
import path from "node:path";
var SKIPPED = /* @__PURE__ */ new Set(["node_modules"]);
function createFileIndex({ maxEntries = 6e4, ttlMs = 1e4, now = Date.now } = {}) {
  const cache = /* @__PURE__ */ new Map();
  return {
    list(root) {
      const hit = cache.get(root);
      if (hit && now() - hit.at < ttlMs) {
        return hit.files;
      }
      const files = walk(root, maxEntries).catch(() => []);
      cache.set(root, { at: now(), files });
      return files;
    }
  };
}
async function walk(root, maxEntries) {
  const files = [];
  const queue = [root];
  let seen = 0;
  for (let i = 0; i < queue.length && seen < maxEntries; i++) {
    let entries;
    try {
      entries = await readdir(queue[i], { withFileTypes: true });
    } catch {
      continue;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (++seen > maxEntries) {
        break;
      }
      if (entry.name.startsWith(".")) {
        continue;
      }
      const full = path.join(queue[i], entry.name);
      if (entry.isDirectory()) {
        if (!SKIPPED.has(entry.name)) {
          queue.push(full);
        }
      } else if (entry.isFile()) {
        files.push(full);
      }
    }
  }
  return files;
}
function isInside(file, root) {
  const rel = path.relative(root, file);
  return rel === "" || !rel.startsWith("..") && !path.isAbsolute(rel);
}
var isMarkdownPath = (file) => /\.(?:md|markdown|mdx)$/i.test(file);

// src/worker/local.ts
import { open, realpath, stat } from "node:fs/promises";
import path2 from "node:path";
import { fileURLToPath } from "node:url";
var CHUNK_BYTES = 3 * 128 * 1024;
var MAX_IMAGE_BYTES = 32 * 1024 * 1024;
var TYPES = {
  ".apng": "image/apng",
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp"
};
var imageMime = (file) => TYPES[path2.extname(file).toLowerCase()] ?? null;
var isRemote = (src) => /^https?:\/\//i.test(src.trim().replace(/^</, ""));
function parseImagePath(src) {
  const s = src.trim().replace(/^<|>$/g, "");
  if (/^file:/i.test(s)) {
    try {
      return fileURLToPath(s.split("#")[0]);
    } catch {
      return null;
    }
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(s) && !/^[a-z]:[\\/]/i.test(s)) {
    return null;
  }
  const part = s.split(/[?#]/)[0];
  if (!part) {
    return null;
  }
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}
var toPosix = (p) => p.split(path2.sep).join("/");
async function candidates(src, files, root, listFiles) {
  const p = parseImagePath(src);
  if (!p) {
    return [];
  }
  if (path2.isAbsolute(p)) {
    return root ? [p, path2.join(root, p)] : [p];
  }
  if (files.length > 0) {
    return files.map((file) => path2.resolve(path2.dirname(file), p));
  }
  const wanted = toPosix(path2.normalize(p)).replace(/^(?:\.\.?\/)+/, "");
  if (!root || !wanted) {
    return [];
  }
  return (await listFiles(root)).filter((f) => toPosix(f).endsWith(`/${wanted}`)).sort((a, b) => a.length - b.length);
}
async function findLocalImage(options) {
  const { src, files, root, roots, listFiles } = options;
  const allowed = (file, within) => imageMime(file) !== null && within.some((r) => isInside(file, r));
  let realRoots = null;
  for (const candidate of await candidates(src, files, root, listFiles)) {
    if (!allowed(candidate, roots) || candidate.split(/[\\/]/).some((part) => part.toLowerCase() === ".git")) {
      continue;
    }
    const info = await stat(candidate).catch(() => null);
    if (!info?.isFile()) {
      continue;
    }
    const real = await realpath(candidate).catch(() => null);
    realRoots ??= await Promise.all(roots.map((r) => realpath(r).catch(() => r)));
    if (real !== null && allowed(real, realRoots)) {
      return { path: real, size: info.size, mtimeMs: info.mtimeMs };
    }
  }
  return null;
}
async function readChunk(file, offset, length = CHUNK_BYTES) {
  const handle = await open(file, "r");
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, offset);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

// src/worker/locate.ts
import { readFile, stat as stat2 } from "node:fs/promises";

// editor/fingerprint.ts
var normalizeText = (text) => text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
var hex = (n) => (n >>> 0).toString(16).padStart(8, "0");
function fingerprintText(text) {
  const t = normalizeText(text);
  let h1 = 3735928559;
  let h2 = 1103547991;
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ h1 >>> 16, 2246822507);
  h1 ^= Math.imul(h2 ^ h2 >>> 13, 3266489909);
  h2 = Math.imul(h2 ^ h2 >>> 16, 2246822507);
  h2 ^= Math.imul(h1 ^ h1 >>> 13, 3266489909);
  return { length: t.length, hash: hex(h2) + hex(h1) };
}

// src/worker/locate.ts
var BOM_BYTES = 3;
var MAX_MATCHES = 8;
async function locateDocument(options) {
  const { roots, fingerprint, bytes, lines = 0, listFiles } = options;
  for (const root of roots) {
    const markdown = (await listFiles(root)).filter(isMarkdownPath);
    const sizes = await Promise.all(markdown.map((file) => stat2(file).then((s) => s.size, () => -1)));
    const files = [];
    for (const [i, file] of markdown.entries()) {
      if (sizes[i] < bytes || sizes[i] > bytes + lines + BOM_BYTES) {
        continue;
      }
      let text;
      try {
        text = await readFile(file, "utf8");
      } catch {
        continue;
      }
      const other = fingerprintText(text);
      if (other.length === fingerprint.length && other.hash === fingerprint.hash) {
        files.push(file);
        if (files.length >= MAX_MATCHES) {
          break;
        }
      }
    }
    if (files.length > 0) {
      return { root, files };
    }
  }
  return null;
}

// src/worker/remote.ts
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
var BLOCKED = new net.BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4]
]) {
  BLOCKED.addSubnet(address, prefix, "ipv4");
}
for (const [address, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["100::", 64],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8]
]) {
  BLOCKED.addSubnet(address, prefix, "ipv6");
}
function isPublicAddress(address) {
  const family = net.isIP(address);
  return family !== 0 && !BLOCKED.check(address, family === 4 ? "ipv4" : "ipv6");
}
var refused = (host) => new Error(`Refused ${host}: not a public address.`);
var guardedLookup = (allowed) => (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) {
      callback(error);
      return;
    }
    if (addresses.length === 0 || !addresses.every((a) => allowed(a.address))) {
      callback(refused(hostname));
      return;
    }
    if (options.all) {
      callback(null, addresses);
    } else {
      callback(null, addresses[0].address, addresses[0].family);
    }
  });
};
function downloadImage(url, { allowed = isPublicAddress, maxBytes = MAX_IMAGE_BYTES, maxRedirects = 5, timeoutMs = 15e3 } = {}) {
  return new Promise((resolve, reject) => {
    let active = null;
    let settled = false;
    const deadline = setTimeout(() => fail(new Error("Timed out.")), timeoutMs);
    const fail = (error) => {
      if (!settled) {
        settled = true;
        clearTimeout(deadline);
        active?.destroy();
        reject(error);
      }
    };
    const succeed = (image) => {
      if (!settled) {
        settled = true;
        clearTimeout(deadline);
        resolve(image);
      }
    };
    const attempt = (target, redirectsLeft) => {
      let parsed;
      try {
        parsed = new URL(target);
      } catch {
        fail(new Error("Not a URL."));
        return;
      }
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        fail(new Error("Only http and https images are loaded."));
        return;
      }
      if (parsed.username || parsed.password) {
        fail(new Error("Addresses with credentials are not loaded."));
        return;
      }
      const host = parsed.hostname.replace(/^\[|\]$/g, "");
      if (net.isIP(host) && !allowed(host)) {
        fail(refused(host));
        return;
      }
      const client = parsed.protocol === "https:" ? https : http;
      active = client.get(
        parsed,
        { lookup: guardedLookup(allowed), headers: { accept: "image/*", "user-agent": "markdown-colorize" } },
        (response) => {
          const status = response.statusCode ?? 0;
          if (status >= 300 && status < 400 && response.headers.location) {
            response.resume();
            if (redirectsLeft <= 0) {
              fail(new Error("Too many redirects."));
              return;
            }
            let next;
            try {
              next = new URL(response.headers.location, parsed).href;
            } catch {
              fail(new Error("Bad redirect."));
              return;
            }
            attempt(next, redirectsLeft - 1);
            return;
          }
          if (status < 200 || status >= 300) {
            response.resume();
            fail(new Error(`HTTP ${status}`));
            return;
          }
          const type = String(response.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
          const mime = type.startsWith("image/") ? type : imageMime(parsed.pathname);
          if (!mime) {
            response.resume();
            fail(new Error("Not an image."));
            return;
          }
          if (Number(response.headers["content-length"]) > maxBytes) {
            response.resume();
            fail(new Error("Image is too large."));
            return;
          }
          const chunks = [];
          let received = 0;
          response.on("data", (chunk) => {
            received += chunk.length;
            if (received > maxBytes) {
              fail(new Error("Image is too large."));
              return;
            }
            chunks.push(chunk);
          });
          response.on("end", () => {
            const bytes = Buffer.concat(chunks);
            const tag = response.headers.etag ?? response.headers["last-modified"] ?? String(bytes.length);
            succeed({ bytes, mime, etag: `remote:${tag}` });
          });
          response.on("error", fail);
        }
      );
      active.on("error", fail);
    };
    attempt(url, maxRedirects);
  });
}
function createRemoteCache({
  download = (url) => downloadImage(url),
  ttlMs = 6e4,
  maxEntries = 64,
  maxTotalBytes = 64 * 1024 * 1024,
  now = Date.now
} = {}) {
  const cache = /* @__PURE__ */ new Map();
  const trim = (keep) => {
    let total = 0;
    for (const e of cache.values()) {
      total += e.size;
    }
    for (const [url, e] of cache) {
      if (cache.size <= maxEntries && total <= maxTotalBytes) {
        break;
      }
      if (e !== keep) {
        cache.delete(url);
        total -= e.size;
      }
    }
  };
  return {
    get(url) {
      const hit = cache.get(url);
      if (hit && now() - hit.at < ttlMs) {
        return hit.image;
      }
      const entry = { at: now(), image: download(url), size: 0 };
      cache.set(url, entry);
      entry.image.then(
        (image) => {
          entry.size = image.bytes.length;
          trim(entry);
        },
        () => {
          if (cache.get(url) === entry) {
            cache.delete(url);
          }
        }
      );
      trim(entry);
      return entry.image;
    }
  };
}

// src/worker/main.ts
var MAX_OTHER_WORKSPACES = 8;
var MISSING = { status: "missing" };
var record = (input) => input && typeof input === "object" && !Array.isArray(input) ? input : {};
function createImageService(deps) {
  const { host, remoteAllowed, listFiles = createFileIndex().list, remote = createRemoteCache(), workspaceTtlMs = 1e4, now = Date.now } = deps;
  let workspaces = null;
  const localWorkspaces = () => {
    if (!workspaces || now() - workspaces.at >= workspaceTtlMs) {
      const value = host.call("workspace.list").then(
        (r) => (r?.workspaces ?? []).filter(
          (w) => (w.hostId === "local" || w.hostId == null) && typeof w.path === "string" && path3.isAbsolute(w.path)
        )
      ).catch(() => []);
      workspaces = { at: now(), value };
    }
    return workspaces.value;
  };
  const rootsOf = (list) => [...new Set(list.map((w) => path3.resolve(w.path)))];
  const workspaceRoots = async () => {
    const [list, context] = await Promise.all([
      localWorkspaces(),
      host.call("workspace.readContext").then((c) => c, () => null)
    ]);
    const focused = list.find((w) => context?.workspaceId && w.id === context.workspaceId) ?? list.find((w) => context && w.name === context.displayName && (w.branch ?? "") === (context.branch ?? ""));
    return { roots: rootsOf(list), focused: focused ? path3.resolve(focused.path) : null };
  };
  async function locate(input) {
    const { hash, length, bytes, lines } = record(input);
    const { roots, focused } = await workspaceRoots();
    if (typeof hash !== "string" || !Number.isInteger(length) || !Number.isInteger(bytes)) {
      return { files: [], root: focused };
    }
    const order = [...focused ? [focused] : [], ...roots.filter((r) => r !== focused).slice(0, MAX_OTHER_WORKSPACES)];
    const found = await locateDocument({
      roots: order,
      fingerprint: { hash, length },
      bytes,
      lines: Number.isInteger(lines) && lines >= 0 ? lines : 0,
      listFiles
    });
    return found ?? { files: [], root: focused };
  }
  async function image(input) {
    const args = record(input);
    const src = typeof args.src === "string" ? args.src.trim() : "";
    if (!src || src.length > 4096) {
      return MISSING;
    }
    const offset = Number.isInteger(args.offset) && args.offset >= 0 ? args.offset : 0;
    const known = typeof args.etag === "string" ? args.etag : null;
    if (isRemote(src)) {
      if (!await remoteAllowed()) {
        return MISSING;
      }
      let img;
      try {
        img = await remote.get(src.replace(/^<|>$/g, ""));
      } catch {
        return MISSING;
      }
      return answer({ etag: img.etag, mime: img.mime, size: img.bytes.length, offset, known, read: async () => img.bytes.subarray(offset, offset + CHUNK_BYTES) });
    }
    const roots = rootsOf(await localWorkspaces());
    const root = typeof args.root === "string" && roots.includes(args.root) ? args.root : null;
    const files = (Array.isArray(args.files) ? args.files : []).filter(
      (f) => typeof f === "string" && isMarkdownPath(f) && roots.some((r) => isInside(f, r))
    );
    const found = await findLocalImage({ src, files, root, roots, listFiles });
    const mime = found && imageMime(found.path);
    if (!found || !mime || found.size > MAX_IMAGE_BYTES) {
      return MISSING;
    }
    return answer({ etag: `${found.mtimeMs}-${found.size}`, mime, size: found.size, offset, known, read: () => readChunk(found.path, offset) });
  }
  return { locate, image };
}
async function answer(a) {
  if (a.offset === 0 && a.known === a.etag) {
    return { status: "unchanged", etag: a.etag };
  }
  const bytes = await a.read();
  return {
    status: "data",
    mime: a.mime,
    size: a.size,
    etag: a.etag,
    data: Buffer.from(bytes).toString("base64"),
    done: a.offset + bytes.length >= a.size
  };
}
function activate(orca) {
  const readRemote = () => orca.settings.get("remoteImages").then((v) => v !== false, () => true);
  let remoteOn = readRemote();
  orca.settings.onDidChange((change) => {
    if (change.key === "remoteImages") {
      remoteOn = readRemote();
    }
  });
  const service = createImageService({ host: orca.host, remoteAllowed: () => remoteOn });
  orca.panels.handle("colorize.locate", (input) => service.locate(input));
  orca.panels.handle("colorize.image", (input) => service.image(input));
}
export {
  createImageService,
  activate as default
};

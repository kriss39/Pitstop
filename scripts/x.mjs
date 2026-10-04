#!/usr/bin/env node
// Posts to Pitstop's X account (@pitstop_agents) with OAuth 1.0a user keys from the repo-root .env:
//   X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET
//
//   node scripts/x.mjs whoami                          read-only check of the keys
//   node scripts/x.mjs thread <file> [--media <png>]   preview a thread (posts separated by lines of ---)
//   node scripts/x.mjs thread <file> --yes [...]       publish it
//
// Nothing is posted without --yes.
import { createHmac, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function loadEnv() {
  const env = {}
  for (const line of readFileSync(join(root, '.env'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '').trim()
  }
  for (const k of ['X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_SECRET'])
    if (!env[k]) throw new Error(`${k} is missing from .env`)
  return env
}

const pct = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)

/** OAuth 1.0a header. `params` are the query/form fields that take part in the signature (not JSON or multipart bodies). */
function oauthHeader(env, method, url, params = {}) {
  const oauth = {
    oauth_consumer_key: env.X_API_KEY,
    oauth_nonce: randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_token: env.X_ACCESS_TOKEN,
    oauth_version: '1.0',
  }
  const all = { ...params, ...oauth }
  const paramString = Object.keys(all)
    .sort()
    .map((k) => `${pct(k)}=${pct(all[k])}`)
    .join('&')
  const base = [method, pct(url), pct(paramString)].join('&')
  const key = `${pct(env.X_API_SECRET)}&${pct(env.X_ACCESS_SECRET)}`
  oauth.oauth_signature = createHmac('sha1', key).update(base).digest('base64')
  return 'OAuth ' + Object.keys(oauth).map((k) => `${pct(k)}="${pct(oauth[k])}"`).join(', ')
}

async function call(env, method, url, { json, form } = {}) {
  const headers = { authorization: oauthHeader(env, method, url) }
  let body
  if (json) {
    headers['content-type'] = 'application/json'
    body = JSON.stringify(json)
  } else if (form) body = form
  const res = await fetch(url, { method, headers, body })
  const text = await res.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    data = text
  }
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`)
  return data
}

/** X's weighted length: most Latin text counts 1, emoji and CJK count 2, every link counts 23. */
function xLength(text) {
  const urls = text.match(/https?:\/\/\S+|\b[a-z0-9-]+(\.[a-z0-9-]+)*\.(dev|xyz|com|io|fi|ai|net|org)(\/\S*)?/gi) ?? []
  let rest = text
  for (const u of urls) rest = rest.replace(u, '')
  let n = urls.length * 23
  for (const ch of rest) {
    const c = ch.codePointAt(0)
    const light = c <= 4351 || (c >= 8192 && c <= 8205) || (c >= 8208 && c <= 8223) || (c >= 8242 && c <= 8247)
    n += light ? 1 : 2
  }
  return n
}

async function uploadImage(env, file) {
  const bytes = readFileSync(file)
  const type = file.endsWith('.png') ? 'image/png' : 'image/jpeg'
  const form = new FormData()
  form.append('media', new Blob([bytes], { type }), basename(file))
  form.append('media_category', 'tweet_image')
  try {
    const r = await call(env, 'POST', 'https://api.x.com/2/media/upload', { form })
    return r.data?.id ?? r.id
  } catch (e) {
    // Older endpoint, still used by some access levels.
    const legacy = new FormData()
    legacy.append('media', new Blob([bytes], { type }), basename(file))
    const r = await call(env, 'POST', 'https://upload.twitter.com/1.1/media/upload.json', { form: legacy }).catch(() => {
      throw e
    })
    return r.media_id_string
  }
}

const [cmd, ...args] = process.argv.slice(2)
const env = loadEnv()

if (cmd === 'whoami') {
  const me = await call(env, 'GET', 'https://api.x.com/2/users/me')
  console.log(`Signed in as @${me.data.username} (${me.data.name}), id ${me.data.id}`)
} else if (cmd === 'thread') {
  const file = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--media')
  const media = args.includes('--media') ? join(root, args[args.indexOf('--media') + 1]) : undefined
  const publish = args.includes('--yes')
  const posts = readFileSync(join(root, file), 'utf8')
    .split(/^---\s*$/m)
    .map((p) => p.trim())
    .filter(Boolean)
  let ok = true
  posts.forEach((p, i) => {
    const len = xLength(p)
    if (len > 280) ok = false
    console.log(`\n── ${i + 1}/${posts.length} · ${len}/280${len > 280 ? '  TOO LONG' : ''}${i === 0 && media ? ` · image ${basename(media)}` : ''}\n${p}`)
  })
  if (!ok) throw new Error('A post is over 280 characters.')
  if (!publish) {
    console.log('\nPreview only. Add --yes to publish.')
  } else {
    const mediaId = media ? await uploadImage(env, media) : undefined
    let replyTo
    for (const [i, text] of posts.entries()) {
      const r = await call(env, 'POST', 'https://api.x.com/2/tweets', {
        json: { text, ...(replyTo ? { reply: { in_reply_to_tweet_id: replyTo } } : {}), ...(i === 0 && mediaId ? { media: { media_ids: [mediaId] } } : {}) },
      })
      replyTo = r.data.id
      console.log(`posted ${i + 1}/${posts.length}: https://x.com/pitstop_agents/status/${r.data.id}`)
    }
  }
} else {
  console.log('Usage: node scripts/x.mjs whoami | thread <file> [--media <image>] [--yes]')
}

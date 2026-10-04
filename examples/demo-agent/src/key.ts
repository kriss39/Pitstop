import { GUARD_URL, store } from './agent-key.js'

// Creates the agent's access key once; `pnpm key --new` replaces a revoked one.
// Prints only public data.
const rotate = process.argv.includes('--new')
const existing = store.loadAccessKey()
const key = existing && !rotate ? existing : store.createAccessKey({ rotate })

console.log(existing && !rotate ? 'Access key already exists.' : rotate ? 'Created a new access key (old one kept as retired).' : 'Created a new access key.')
console.log(`Stored in     ${store.accessKeyFile} (never commit or share this file)`)
console.log(`Key address   ${key.address}`)
console.log(`Key type      ${key.type}`)
console.log()
console.log('Ask the owner to authorize it on the Guard page:')
console.log(`  ${GUARD_URL}/guard?key=${key.address}`)

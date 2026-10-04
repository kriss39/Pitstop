import { createKey, GUARD_URL, KEY_FILE, loadKey } from './agent-key.js'

// Creates the agent's access key once. Prints only public data.
const existing = loadKey()
const key = existing ?? createKey()

console.log(existing ? 'Access key already exists.' : 'Created a new access key.')
console.log(`Stored in     ${KEY_FILE} (never commit or share this file)`)
console.log(`Key address   ${key.address}`)
console.log(`Key type      ${key.type}`)
console.log()
console.log('Ask the owner to authorize it on the Guard page:')
console.log(`  ${GUARD_URL}/guard?key=${key.address}`)

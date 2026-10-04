import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'apps/*/test/**/*.test.ts'],
    // Tests never touch the network: LI.FI, RPCs and wallets are mocked.
    environment: 'node',
  },
})

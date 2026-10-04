import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))

export default defineConfig(({ mode }) => {
  // Reads the repo-root .env on the dev server only. Nothing here is sent to the
  // browser except the public agent address.
  const env = loadEnv(mode, repoRoot, '')
  const lifiHeaders: Record<string, string> = env.LIFI_API_KEY ? { 'x-lifi-api-key': env.LIFI_API_KEY } : {}

  return {
    plugins: [react()],
    define: {
      __DEFAULT_AGENT__: JSON.stringify(env.AGENT_ADDRESS ?? ''),
      __LIFI_INTEGRATOR__: JSON.stringify(env.LIFI_INTEGRATOR ?? 'pitstop'),
    },
    server: {
      proxy: {
        // The browser calls /lifi/v1/...; the dev server adds the API key and forwards to LI.FI.
        '/lifi': {
          target: 'https://li.quest',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/lifi/, ''),
          headers: lifiHeaders,
        },
      },
    },
  }
})

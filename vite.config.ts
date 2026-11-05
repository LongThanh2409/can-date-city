import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

// Vercel builds have no .git folder, so its commit variable comes first.
function commitHash() {
  const vercelCommit = process.env.VERCEL_GIT_COMMIT_SHA
  if (vercelCommit) return vercelCommit.slice(0, 7)
  try {
    return execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return 'unknown'
  }
}

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __APP_COMMIT__: JSON.stringify(commitHash()),
    __APP_BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  test: { environment: 'node' },
})

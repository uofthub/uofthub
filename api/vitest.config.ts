import { defineConfig } from 'vitest/config'
import { testDatabaseUrl } from './src/test/env.js'

export default defineConfig({
  test: {
    globalSetup: ['./src/test/globalSetup.ts'],
    env: {
      // Set before any test module (and therefore before Prisma) loads, so
      // the client picks this up instead of the .env dev database.
      DATABASE_URL: testDatabaseUrl(),
      JWT_SECRET: 'test-secret',
      // @fastify/oauth2 refuses to register without credentials; the OAuth
      // routes are never exercised here, so placeholders are enough.
      MICROSOFT_CLIENT_ID: 'test-client-id',
      MICROSOFT_CLIENT_SECRET: 'test-client-secret',
      WEB_URL: 'http://localhost:5173',
      // Explicitly empty so the suite can never spend model credits, even on a
      // machine where the key happens to be exported. /discover's keyword
      // fallback is what gets tested.
      OPENAI_API_KEY: '',
    },
    // One database, shared by every file: running files in parallel would
    // have them truncating each other's rows mid-test.
    fileParallelism: false,
    include: ['src/**/*.test.ts'],
  },
})

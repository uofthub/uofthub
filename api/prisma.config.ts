import { existsSync } from 'node:fs'
import { defineConfig, env } from 'prisma/config'

// Prisma 7 no longer reads .env itself. The server gets it from tsx's
// --env-file, but the CLI (migrate, generate, studio) comes through here.
// CI and the Docker build have no .env and set DATABASE_URL directly.
if (existsSync('.env')) process.loadEnvFile('.env')

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
})

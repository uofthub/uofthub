import { buildApp } from './app.js'
import { installProcessHandlers } from './lib/monitoring.js'

const app = await buildApp()

// Registered here rather than in buildApp(): these are process-global, and the
// test suite builds an app per run without wanting to own the process.
installProcessHandlers((err, msg) => app.log.error(err, msg))

await app.listen({ port: Number(process.env.PORT ?? 3001), host: '0.0.0.0' })
console.log(`API running on http://localhost:${process.env.PORT ?? 3001}`)

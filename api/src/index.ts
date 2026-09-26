import { buildApp } from './app.js'
import { startAnnouncementSweep } from './lib/announcements.js'

const app = await buildApp()

// Registered here rather than in buildApp(): the test suite builds apps
// without wanting a timer.
startAnnouncementSweep((err) => app.log.error(err, 'announcement sweep failed'))

await app.listen({ port: Number(process.env.PORT ?? 3001), host: '0.0.0.0' })
console.log(`API running on http://localhost:${process.env.PORT ?? 3001}`)

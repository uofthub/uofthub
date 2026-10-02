import { buildApp } from './app.js'
import { db } from './db/client.js'
import { startAnnouncementSweep } from './lib/announcements.js'
import { stopListening } from './lib/live.js'
import { startMaintenance } from './lib/maintenance.js'
import { startScanSweep } from './lib/imageScan.js'

const app = await buildApp()

// Registered here rather than in buildApp(): the test suite builds apps
// without wanting a timer.
const stopSweep = startAnnouncementSweep((err) => app.log.error(err, 'announcement sweep failed'))
const stopMaintenance = startMaintenance((err) => app.log.error(err, 'maintenance failed'))
// Warn, not error: a pass that finds the free scanner asleep fails by design.
const stopScans = startScanSweep((err) => app.log.warn(err, 'image scan pass stopped early'))

await app.listen({ port: Number(process.env.PORT ?? 3001), host: '0.0.0.0' })

/**
 * A deploy stops the old container with SIGTERM. Closing in order — stop
 * taking requests and end the open live streams (app.close), drop the LISTEN
 * connection, then the query pool — lets in-flight requests finish instead of
 * being cut off. If anything hangs, the timeout exits anyway.
 */
let closing = false
async function shutdown(signal: string) {
  if (closing) return
  closing = true
  app.log.info({ signal }, 'shutting down')
  setTimeout(() => process.exit(1), 10_000).unref()
  stopSweep()
  stopMaintenance()
  stopScans()
  try {
    await app.close()
    await stopListening()
    await db.$disconnect()
    process.exit(0)
  } catch (err) {
    app.log.error(err, 'shutdown failed')
    process.exit(1)
  }
}
process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))

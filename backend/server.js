import { connectDatabase } from './config/database.js'
import { configurationPresence, sanitizeMongoFailure, startupFailureCategory } from './services/startupDiagnostics.js'

function logConfigurationPresence() {
  const presence = configurationPresence(process.env)
  const summary = Object.entries(presence).map(([name, present]) => `${name}=${present ? 'present' : 'missing'}`).join(', ')
  console.info(`Startup configuration presence: ${summary}.`)
}

async function startServer() {
  let phase = 'configuration-validation'
  try {
    // Dynamic imports allow configuration and service initialization failures to be
    // reported by the guarded startup path instead of bypassing its diagnostics.
    const { env } = await import('./config/env.js')
    logConfigurationPresence()

    phase = 'database-connection'
    await connectDatabase(env.mongoUri)
    console.info('MongoDB connected.')

    phase = 'storage-initialization'
    if (env.storageDriver === 'b2') await import('./services/storage/backblazeB2Client.js')

    phase = 'scanner-initialization'
    const { scanStoredFile } = await import('./services/scanners/index.js')
    try {
      await scanStoredFile.check()
      console.info('ClamAV daemon connected and virus definitions are ready.')
    } catch (error) {
      const category = typeof error?.code === 'string' && /^CLAMAV_[A-Z_]+$/.test(error.code)
        ? error.code.toLowerCase().replaceAll('_', '-')
        : 'clamav-unavailable'
      console.warn(`ClamAV startup check failed (${category}). Uploads will remain blocked until scanning is available.`)
    }

    phase = 'application-initialization'
    const { createApp } = await import('./app.js')
    const app = createApp()

    phase = 'http-listener'
    const server = app.listen(env.port, '0.0.0.0', () => {
      console.info(`ShareSafe API listening on port ${env.port}.`)
    })
    server.once('error', (error) => {
      console.error(`ShareSafe startup failed. Category: ${startupFailureCategory(phase, error)}.`)
      process.exitCode = 1
    })
  } catch (error) {
    logConfigurationPresence()
    console.error(`ShareSafe startup failed. Category: ${startupFailureCategory(phase, error)}.`)
    if (phase === 'database-connection') {
      console.error(`MongoDB startup diagnostic: ${JSON.stringify(sanitizeMongoFailure(error))}`)
    }
    if (phase === 'configuration-validation' && error instanceof Error) {
      // env.js throws fixed validation messages that name settings but never echo values.
      console.error(`Configuration validation: ${error.message}`)
    }
    process.exitCode = 1
  }
}

startServer()

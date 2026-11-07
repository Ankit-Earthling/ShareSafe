import { createApp } from './app.js'
import { connectDatabase } from './config/database.js'
import { env } from './config/env.js'

async function startServer() {
  await connectDatabase(env.mongoUri)
  console.info('MongoDB connected.')

  createApp().listen(env.port, '0.0.0.0', () => {
    console.info(`ShareSafe API listening on port ${env.port}.`)
  })
}

startServer().catch(() => {
  console.error('ShareSafe startup failed. Verify the backend database, storage, and scanner configuration.')
  process.exitCode = 1
})

import { createApp } from './app.js'
import { connectDatabase } from './config/database.js'
import { env } from './config/env.js'

async function startServer() {
  try {
    await connectDatabase(env.mongoUri)
    console.info('MongoDB connected.')
  } catch {
    console.error('MongoDB connection failed. Check MONGODB_URI and the database service.')
  }

  createApp().listen(env.port, () => {
    console.info(`ShareSafe API listening on port ${env.port}.`)
  })
}

startServer()

import 'dotenv/config'

function required(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

const port = Number(required('PORT'))
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.')
}

const frontendUrl = required('FRONTEND_URL')
let frontendOrigin
try {
  const parsedFrontendUrl = new URL(frontendUrl)
  if (!['http:', 'https:'].includes(parsedFrontendUrl.protocol)) throw new Error()
  if (parsedFrontendUrl.username || parsedFrontendUrl.password || parsedFrontendUrl.search || parsedFrontendUrl.hash || (parsedFrontendUrl.pathname !== '/' && parsedFrontendUrl.pathname !== '')) throw new Error()
  frontendOrigin = parsedFrontendUrl.origin
} catch {
  throw new Error('FRONTEND_URL must be an HTTP or HTTPS origin without a path.')
}

const mongoUri = required('MONGODB_URI')
if (!/^mongodb(?:\+srv)?:\/\//i.test(mongoUri)) {
  throw new Error('MONGODB_URI must be a MongoDB connection URI.')
}

const jwtSecret = required('JWT_SECRET')
if (jwtSecret.length < 32 || jwtSecret.toLowerCase().startsWith('replace-with-')) {
  throw new Error('JWT_SECRET must be a private value of at least 32 characters, not the example placeholder.')
}

export const env = Object.freeze({
  port,
  mongoUri,
  frontendUrl: frontendOrigin,
  jwtSecret,
})

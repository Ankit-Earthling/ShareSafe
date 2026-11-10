import 'dotenv/config'

function required(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

const port = Number(process.env.PORT || 3000)
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.')
}

const frontendUrl = process.env.FRONTEND_URL?.trim() || 'http://localhost:5173'
let frontendOrigin
try {
  const parsedFrontendUrl = new URL(frontendUrl)
  if (!['http:', 'https:'].includes(parsedFrontendUrl.protocol)) throw new Error()
  if (parsedFrontendUrl.username || parsedFrontendUrl.password || parsedFrontendUrl.search || parsedFrontendUrl.hash || (parsedFrontendUrl.pathname !== '/' && parsedFrontendUrl.pathname !== '')) throw new Error()
  frontendOrigin = parsedFrontendUrl.origin
} catch {
  throw new Error('FRONTEND_URL must be an HTTP or HTTPS origin without a path.')
}

const mongoUri = process.env.MONGODB_URI?.trim() || 'mongodb://127.0.0.1:27017/sharesafe'
if (!/^mongodb(?:\+srv)?:\/\//i.test(mongoUri)) {
  throw new Error('MONGODB_URI must be a MongoDB connection URI.')
}

const jwtSecret = required('JWT_SECRET')
if (jwtSecret.length < 32 || jwtSecret.toLowerCase().startsWith('replace-with-')) {
  throw new Error('JWT_SECRET must be a private value of at least 32 characters, not the example placeholder.')
}

const shareTokenSecret = required('SHARE_TOKEN_SECRET')
if (shareTokenSecret.length < 32 || shareTokenSecret.toLowerCase().startsWith('replace-with-') || shareTokenSecret === jwtSecret) {
  throw new Error('SHARE_TOKEN_SECRET must be a separate private value of at least 32 characters, not the example placeholder.')
}

const defaultStorageQuotaBytes = Number(process.env.DEFAULT_STORAGE_QUOTA_BYTES || 524288000)
if (!Number.isSafeInteger(defaultStorageQuotaBytes) || defaultStorageQuotaBytes < 1) {
  throw new Error('DEFAULT_STORAGE_QUOTA_BYTES must be a positive safe integer.')
}
const clamavHost = process.env.CLAMAV_HOST?.trim() || '127.0.0.1'
const clamavPort = Number(process.env.CLAMAV_PORT || 3310)
const clamavConnectTimeoutMs = Number(process.env.CLAMAV_CONNECT_TIMEOUT_MS || 5000)
const clamavTimeoutMs = Number(process.env.CLAMAV_TIMEOUT_MS || 120000)
if (!Number.isInteger(clamavPort) || clamavPort < 1 || clamavPort > 65535) {
  throw new Error('CLAMAV_PORT must be an integer between 1 and 65535.')
}
if (!Number.isSafeInteger(clamavConnectTimeoutMs) || clamavConnectTimeoutMs < 100 || clamavConnectTimeoutMs > 60000) {
  throw new Error('CLAMAV_CONNECT_TIMEOUT_MS must be between 100 and 60000.')
}
if (!Number.isSafeInteger(clamavTimeoutMs) || clamavTimeoutMs < 1000 || clamavTimeoutMs > 600000) {
  throw new Error('CLAMAV_TIMEOUT_MS must be between 1000 and 600000.')
}
const storageDriver = (process.env.STORAGE_DRIVER || 'local').trim().toLowerCase()
if (!['local', 'b2'].includes(storageDriver)) {
  throw new Error('STORAGE_DRIVER must be either local or b2.')
}
const b2Endpoint = process.env.B2_ENDPOINT?.trim() || ''
const b2Region = process.env.B2_REGION?.trim() || ''
const b2Bucket = process.env.B2_BUCKET?.trim() || ''
const b2KeyId = process.env.B2_KEY_ID?.trim() || ''
const b2ApplicationKey = process.env.B2_APPLICATION_KEY?.trim() || ''
if (storageDriver === 'b2') {
  let endpoint
  try {
    endpoint = new URL(b2Endpoint)
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error()
  } catch {
    throw new Error('B2_ENDPOINT must be a valid HTTPS endpoint URL without credentials, query, or fragment.')
  }
  if (!b2Region || !b2Bucket || !b2KeyId || !b2ApplicationKey) {
    throw new Error('B2_REGION, B2_BUCKET, B2_KEY_ID, and B2_APPLICATION_KEY are required when STORAGE_DRIVER=b2.')
  }
}

export const env = Object.freeze({
  port,
  mongoUri,
  frontendUrl: frontendOrigin,
  jwtSecret,
  shareTokenSecret,
  defaultStorageQuotaBytes,
  clamavHost,
  clamavPort,
  clamavConnectTimeoutMs,
  clamavTimeoutMs,
  storageDriver,
  b2Endpoint,
  b2Region,
  b2Bucket,
  b2KeyId,
  b2ApplicationKey,
})

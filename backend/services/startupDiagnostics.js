const BASE_CONFIGURATION = [
  'PORT',
  'FRONTEND_URL',
  'MONGODB_URI',
  'JWT_SECRET',
  'SHARE_TOKEN_SECRET',
  'STORAGE_DRIVER',
  'MALWARE_SCANNER',
]

const B2_CONFIGURATION = ['B2_ENDPOINT', 'B2_REGION', 'B2_BUCKET', 'B2_KEY_ID', 'B2_APPLICATION_KEY']

export function configurationPresence(environment = process.env) {
  const names = [...BASE_CONFIGURATION]
  const scanner = (environment.MALWARE_SCANNER || 'clamav').trim().toLowerCase()
  const storage = (environment.STORAGE_DRIVER || 'local').trim().toLowerCase()
  if (scanner === 'bouncer') names.push('BOUNCER_API_KEY')
  if (storage === 'b2') names.push(...B2_CONFIGURATION)
  return Object.fromEntries([...new Set(names)].map((name) => [name, Boolean(environment[name]?.trim())]))
}

function mongoFailureCategory(error) {
  const causes = [error, error?.cause, error?.cause?.cause].filter(Boolean)
  if (causes.some((cause) => cause.name === 'MongoParseError')) return 'database-uri-parse'
  if (causes.some((cause) => cause.code === 18 || cause.code === 8000)) return 'database-authentication'
  if (causes.some((cause) => ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET', 'EHOSTUNREACH'].includes(cause.code))) {
    return 'database-network'
  }
  if (causes.some((cause) => cause.name === 'MongoServerSelectionError')) return 'database-server-selection'
  return 'database-connection'
}

export function startupFailureCategory(phase, error) {
  if (phase === 'configuration-validation') return 'configuration-validation'
  if (phase === 'database-connection') return mongoFailureCategory(error)
  if (phase === 'storage-initialization') return 'storage-client-initialization'
  if (phase === 'scanner-initialization') return 'scanner-client-initialization'
  if (phase === 'application-initialization') return 'application-initialization'
  if (phase === 'http-listener') {
    if (error?.code === 'EADDRINUSE') return 'http-listener-port-in-use'
    return 'http-listener'
  }
  return 'unknown-startup-phase'
}

const PRIVATE_CONFIGURATION = ['JWT_SECRET', 'SHARE_TOKEN_SECRET']

const B2_CONFIGURATION = ['B2_ENDPOINT', 'B2_REGION', 'B2_BUCKET', 'B2_KEY_ID', 'B2_APPLICATION_KEY']

export function configurationPresence(environment = process.env) {
  const names = [...PRIVATE_CONFIGURATION]
  const storage = (environment.STORAGE_DRIVER || 'local').trim().toLowerCase()
  if (storage === 'b2') names.push(...B2_CONFIGURATION)
  return {
    PORT: Boolean(environment.PORT?.trim() || '3000'),
    FRONTEND_URL: Boolean(environment.FRONTEND_URL?.trim() || 'http://localhost:5173'),
    MONGODB_URI: Boolean(environment.MONGODB_URI?.trim() || 'mongodb://127.0.0.1:27017/sharesafe'),
    STORAGE_DRIVER: Boolean(environment.STORAGE_DRIVER?.trim() || 'local'),
    CLAMAV_HOST: Boolean(environment.CLAMAV_HOST?.trim() || '127.0.0.1'),
    CLAMAV_PORT: Boolean(environment.CLAMAV_PORT?.trim() || '3310'),
    ...Object.fromEntries(names.map((name) => [name, Boolean(environment[name]?.trim())])),
  }
}

function collectMongoErrors(root) {
  const found = []
  const pending = [root]
  const visited = new Set()

  while (pending.length && found.length < 50) {
    const current = pending.shift()
    if (!current || (typeof current !== 'object' && typeof current !== 'function') || visited.has(current)) continue
    visited.add(current)
    found.push(current)

    for (const key of ['cause', 'reason', 'error', 'errors']) {
      const nested = current[key]
      if (nested instanceof Map) pending.push(...nested.values())
      else if (Array.isArray(nested)) pending.push(...nested)
      else if (nested && typeof nested === 'object') pending.push(nested)
    }

    const servers = current.servers
    if (servers instanceof Map) {
      for (const server of servers.values()) {
        if (server?.error) pending.push(server.error)
        if (server?.description?.error) pending.push(server.description.error)
      }
    }
  }

  return found
}

function mongoFailureCategory(errors) {
  const has = (predicate) => errors.some(predicate)
  if (has((error) => error.name === 'MongoParseError')) return 'database-uri-parse'
  if (has((error) => error.code === 18 || error.code === 8000 || error.codeName === 'AuthenticationFailed' || /authentication failed|bad auth|unable to authenticate/i.test(error.message || ''))) {
    return 'database-authentication'
  }
  if (has((error) => /TLS|SSL|Certificate/i.test(error.name || '') || /^(ERR_TLS_|ERR_SSL_|CERT_)/.test(error.code || '') || /tls|ssl|certificate|x509/i.test(error.message || ''))) {
    return 'database-tls'
  }
  if (has((error) => ['ENOTFOUND', 'EAI_AGAIN', 'ESERVFAIL', 'ENODATA'].includes(error.code) || /getaddrinfo|querysrv|dns lookup|name resolution/i.test(error.message || ''))) {
    return 'database-dns'
  }
  if (has((error) => error.code === 'ETIMEDOUT' || error.name === 'MongoNetworkTimeoutError' || /network timed out|connection timed out/i.test(error.message || ''))) {
    return 'database-network-timeout'
  }
  if (has((error) => ['ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH', 'ENETUNREACH'].includes(error.code))) return 'database-ip-network'
  if (has((error) => error.name === 'MongoServerSelectionError' && /server selection timed out/i.test(error.message || ''))) return 'database-server-selection-timeout'
  if (has((error) => error.name === 'MongoServerSelectionError')) return 'database-server-selection'
  return 'database-connection'
}

const safeCodeNames = new Set([
  'AuthenticationFailed', 'AtlasError', 'BadValue', 'HostUnreachable', 'NetworkTimeout',
  'NotYetInitialized', 'ShutdownInProgress', 'Unauthorized',
])
const safeErrorNames = new Set([
  'Error', 'MongoNetworkError', 'MongoNetworkTimeoutError', 'MongoParseError', 'MongoServerError',
  'MongoServerSelectionError', 'MongoSystemError', 'MongoWaitQueueTimeoutError', 'TypeError',
])

function safeMongoCode(code) {
  if (Number.isInteger(code) && code >= 0 && code <= 999999) return code
  if (typeof code === 'string' && /^(?:E[A-Z0-9_]{1,40}|ERR_[A-Z0-9_]{1,60}|CERT_[A-Z0-9_]{1,40})$/.test(code)) return code
  return 'unrecognized'
}

function safeMongoErrorName(name) {
  return safeErrorNames.has(name) ? name : 'MongoError'
}

function safeMongoCodeName(codeName) {
  return safeCodeNames.has(codeName) ? codeName : 'unrecognized'
}

const safeMongoMessages = {
  'database-uri-parse': 'MongoDB rejected the connection URI format. Check the URI scheme and option syntax.',
  'database-authentication': 'MongoDB rejected authentication. Verify the database user, password URL encoding, and authSource.',
  'database-tls': 'MongoDB TLS negotiation failed. Verify the Atlas endpoint and TLS compatibility; do not disable TLS.',
  'database-dns': 'MongoDB hostname or SRV lookup failed. Verify the Atlas hostname, cluster state, and DNS resolution.',
  'database-network-timeout': 'MongoDB network connection timed out. Check that the local service is running and reachable.',
  'database-ip-network': 'MongoDB network connection was refused or unreachable. Check the local service and network routing.',
  'database-server-selection-timeout': 'MongoDB server selection timed out. Check service availability, network access, and DNS resolution.',
  'database-server-selection': 'MongoDB could not select a server. Check service availability and network connectivity.',
  'database-connection': 'MongoDB connection failed for an unclassified driver or server error.',
}

export function sanitizeMongoFailure(error) {
  const errors = collectMongoErrors(error)
  const category = mongoFailureCategory(errors)
  const informative = errors.find((item) => item !== error && (item.code !== undefined || item.codeName || item.name)) || error || {}

  return {
    category,
    name: safeMongoErrorName(informative.name || error?.name),
    code: safeMongoCode(informative.code ?? error?.code),
    codeName: safeMongoCodeName(informative.codeName || error?.codeName),
    message: safeMongoMessages[category],
  }
}

export function startupFailureCategory(phase, error) {
  if (phase === 'configuration-validation') return 'configuration-validation'
  if (phase === 'database-connection') return sanitizeMongoFailure(error).category
  if (phase === 'storage-initialization') return 'storage-client-initialization'
  if (phase === 'scanner-initialization') return 'scanner-client-initialization'
  if (phase === 'application-initialization') return 'application-initialization'
  if (phase === 'http-listener') {
    if (error?.code === 'EADDRINUSE') return 'http-listener-port-in-use'
    return 'http-listener'
  }
  return 'unknown-startup-phase'
}

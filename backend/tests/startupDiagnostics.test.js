import assert from 'node:assert/strict'
import { test } from 'node:test'
import { configurationPresence, sanitizeMongoFailure, startupFailureCategory } from '../services/startupDiagnostics.js'

test('configuration diagnostics expose only presence for mode-required variables', () => {
  const diagnostics = configurationPresence({
    STORAGE_DRIVER: 'b2',
    B2_REGION: 'us-west-004',
  })

  assert.equal(diagnostics.MONGODB_URI, true)
  assert.equal(diagnostics.B2_REGION, true)
  assert.equal(diagnostics.B2_ENDPOINT, false)
  assert.equal(JSON.stringify(diagnostics).includes('private'), false)
  assert.deepEqual(Object.keys(configurationPresence({ STORAGE_DRIVER: 'local' })), [
    'PORT', 'FRONTEND_URL', 'MONGODB_URI', 'STORAGE_DRIVER', 'CLAMAV_HOST', 'CLAMAV_PORT', 'JWT_SECRET', 'SHARE_TOKEN_SECRET',
  ])
})

test('startup failure categories identify database and service initialization failures safely', () => {
  assert.equal(startupFailureCategory('database-connection', { name: 'MongoParseError', message: 'uri includes password' }), 'database-uri-parse')
  assert.equal(startupFailureCategory('database-connection', { name: 'MongoServerError', code: 18, message: 'credential detail' }), 'database-authentication')
  assert.equal(startupFailureCategory('database-connection', { name: 'MongoServerSelectionError', cause: { code: 'ENOTFOUND' } }), 'database-dns')
  assert.equal(startupFailureCategory('storage-initialization', new Error('private storage detail')), 'storage-client-initialization')
  assert.equal(startupFailureCategory('scanner-initialization', new Error('private scanner detail')), 'scanner-client-initialization')
  assert.equal(startupFailureCategory('http-listener', { code: 'EADDRINUSE' }), 'http-listener-port-in-use')
})

test('Mongo diagnostics sanitize nested DNS errors and never return credentials, hosts, or raw messages', () => {
  const nestedDnsError = Object.assign(new Error(
    'querySrv ENOTFOUND mongodb+srv://db-user:db-password@private-cluster.example/?token=private-token provider_api_key_private-value',
  ), { name: 'MongoNetworkError', code: 'ENOTFOUND', codeName: 'private-cluster.example' })
  const selectionError = Object.assign(new Error('Server selection timed out for private-cluster.example'), {
    name: 'MongoServerSelectionError',
    reason: { servers: new Map([['private-cluster.example', { error: nestedDnsError }]]) },
  })

  const diagnostic = sanitizeMongoFailure(selectionError)
  const serialized = JSON.stringify(diagnostic)
  assert.equal(diagnostic.category, 'database-dns')
  assert.equal(diagnostic.name, 'MongoNetworkError')
  assert.equal(diagnostic.code, 'ENOTFOUND')
  assert.equal(diagnostic.codeName, 'unrecognized')
  assert.match(diagnostic.message, /hostname or SRV lookup failed/)
  for (const secret of ['db-user', 'db-password', 'private-cluster.example', 'private-token', 'private-key', 'mongodb+srv://']) {
    assert.equal(serialized.includes(secret), false)
  }
})

test('Mongo diagnostics distinguish authentication, IP/network, TLS, and selection timeouts', () => {
  const make = (message, name, fields = {}) => Object.assign(new Error(message), { name, ...fields })
  const cases = [
    [make('Authentication failed for private-user on private-host', 'MongoServerError', { code: 18, codeName: 'AuthenticationFailed' }), 'database-authentication', 18, 'AuthenticationFailed'],
    [make('connect ETIMEDOUT private-host', 'MongoNetworkTimeoutError', { code: 'ETIMEDOUT' }), 'database-network-timeout', 'ETIMEDOUT', 'unrecognized'],
    [make('connect EHOSTUNREACH private-ip', 'MongoNetworkError', { code: 'EHOSTUNREACH' }), 'database-ip-network', 'EHOSTUNREACH', 'unrecognized'],
    [make('TLS certificate validation failed for private-host', 'MongoNetworkError', { code: 'ERR_TLS_CERT_ALTNAME_INVALID' }), 'database-tls', 'ERR_TLS_CERT_ALTNAME_INVALID', 'unrecognized'],
    [make('Server selection timed out after 5000 ms for private-host', 'MongoServerSelectionError'), 'database-server-selection-timeout', 'unrecognized', 'unrecognized'],
  ]

  for (const [error, category, code, codeName] of cases) {
    const diagnostic = sanitizeMongoFailure(error)
    assert.equal(diagnostic.category, category)
    assert.equal(diagnostic.code, code)
    assert.equal(diagnostic.codeName, codeName)
    assert.equal(diagnostic.message.includes('private-host'), false)
    assert.equal(diagnostic.message.includes('private-user'), false)
  }
})

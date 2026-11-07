import assert from 'node:assert/strict'
import { test } from 'node:test'
import { configurationPresence, startupFailureCategory } from '../services/startupDiagnostics.js'

test('configuration diagnostics expose only presence for mode-required variables', () => {
  const diagnostics = configurationPresence({
    PORT: '3000',
    MONGODB_URI: 'mongodb://private-connection-string',
    STORAGE_DRIVER: 'b2',
    MALWARE_SCANNER: 'bouncer',
    B2_REGION: 'us-west-004',
    BOUNCER_API_KEY: 'private-api-key',
  })

  assert.equal(diagnostics.MONGODB_URI, true)
  assert.equal(diagnostics.BOUNCER_API_KEY, true)
  assert.equal(diagnostics.B2_REGION, true)
  assert.equal(diagnostics.B2_ENDPOINT, false)
  assert.equal(JSON.stringify(diagnostics).includes('private'), false)
  assert.deepEqual(Object.keys(configurationPresence({ STORAGE_DRIVER: 'local', MALWARE_SCANNER: 'clamav' })), [
    'PORT', 'FRONTEND_URL', 'MONGODB_URI', 'JWT_SECRET', 'SHARE_TOKEN_SECRET', 'STORAGE_DRIVER', 'MALWARE_SCANNER',
  ])
})

test('startup failure categories identify database and service initialization failures safely', () => {
  assert.equal(startupFailureCategory('database-connection', { name: 'MongoParseError', message: 'uri includes password' }), 'database-uri-parse')
  assert.equal(startupFailureCategory('database-connection', { name: 'MongoServerError', code: 18, message: 'credential detail' }), 'database-authentication')
  assert.equal(startupFailureCategory('database-connection', { name: 'MongoServerSelectionError', cause: { code: 'ENOTFOUND' } }), 'database-network')
  assert.equal(startupFailureCategory('storage-initialization', new Error('private storage detail')), 'storage-client-initialization')
  assert.equal(startupFailureCategory('scanner-initialization', new Error('private scanner detail')), 'scanner-client-initialization')
  assert.equal(startupFailureCategory('http-listener', { code: 'EADDRINUSE' }), 'http-listener-port-in-use')
})

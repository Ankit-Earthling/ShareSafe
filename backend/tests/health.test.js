import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createReadinessHandler } from '../controllers/healthController.js'
import { startTestServer } from './helpers.js'

let context
let storageChecks = 0
let scannerChecks = 0

before(async () => {
  const readinessHandler = createReadinessHandler({
    isDatabaseConnected: () => true,
    storageDriver: 'b2',
    storageTimeoutMs: 20,
    storageCheck: ({ signal }) => new Promise((_resolve, reject) => {
      storageChecks += 1
      signal.addEventListener('abort', () => reject(new Error('simulated stalled storage check')), { once: true })
    }),
    scannerCheck: async () => { scannerChecks += 1 },
  })
  context = await startTestServer('sharesafe_health_test', { readinessHandler })
})

after(async () => context?.close())

test('GET /api/health is public, returns JSON, and is not behind the general API rate limit', async () => {
  const start = performance.now()
  const responses = await Promise.all(Array.from({ length: 125 }, () => fetch(`${context.baseUrl}/api/health`)))
  const elapsed = performance.now() - start
  assert.ok(responses.every((response) => response.status === 200))
  assert.ok(responses.every((response) => response.headers.get('content-type')?.includes('application/json')))
  const result = await responses.at(-1).json()
  assert.deepEqual(result, { status: 'ok' })
  assert.ok(elapsed < 1000, `liveness checks took ${elapsed.toFixed(1)} ms`)
  assert.equal(storageChecks, 0, 'liveness must not probe B2')
})

test('GET /api/ready reports a stalled B2 dependency honestly without blocking liveness', async () => {
  const start = performance.now()
  const response = await fetch(`${context.baseUrl}/api/ready`, { signal: AbortSignal.timeout(500) })
  const elapsed = performance.now() - start
  assert.equal(response.status, 503)
  assert.deepEqual(await response.json(), {
    status: 'unavailable', database: 'connected', storage: 'disconnected', scanner: 'connected',
  })
  assert.equal(storageChecks, 1)
  assert.equal(scannerChecks, 1)
  assert.ok(elapsed < 500, `readiness timeout took ${elapsed.toFixed(1)} ms`)
})

test('local readiness fails while the ClamAV daemon is unavailable', async () => {
  const readiness = createReadinessHandler({
    isDatabaseConnected: () => true,
    storageDriver: 'local',
    storageCheck: async () => 'local',
    scannerCheck: async () => { throw new Error('daemon unavailable') },
  })
  let statusCode
  let body
  await readiness({}, {
    status(code) { statusCode = code; return this },
    json(value) { body = value; return this },
  })
  assert.equal(statusCode, 503)
  assert.deepEqual(body, {
    status: 'unavailable', database: 'connected', storage: 'local', scanner: 'disconnected',
  })
})

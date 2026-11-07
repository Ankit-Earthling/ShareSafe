import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createReadinessHandler } from '../controllers/healthController.js'
import { startTestServer } from './helpers.js'

let context
let storageChecks = 0

before(async () => {
  const readinessHandler = createReadinessHandler({
    isDatabaseConnected: () => true,
    storageDriver: 'b2',
    malwareScanner: 'bouncer',
    storageTimeoutMs: 20,
    storageAdapter: {
      check: ({ signal }) => new Promise((_resolve, reject) => {
        storageChecks += 1
        signal.addEventListener('abort', () => reject(new Error('simulated stalled B2 probe')), { once: true })
      }),
    },
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
    status: 'unavailable', database: 'connected', storage: 'disconnected', scanner: 'bouncer',
  })
  assert.equal(storageChecks, 1)
  assert.ok(elapsed < 500, `readiness timeout took ${elapsed.toFixed(1)} ms`)
})

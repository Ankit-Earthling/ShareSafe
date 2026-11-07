import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createHealthHandler } from '../controllers/healthController.js'
import { startTestServer } from './helpers.js'

let context

before(async () => {
  context = await startTestServer('sharesafe_health_test')
})

after(async () => context?.close())

test('GET /api/health is public, returns JSON, and is not behind the general API rate limit', async () => {
  const responses = await Promise.all(Array.from({ length: 125 }, () => fetch(`${context.baseUrl}/api/health`)))
  assert.ok(responses.every((response) => response.status === 200))
  assert.ok(responses.every((response) => response.headers.get('content-type')?.includes('application/json')))
  const result = await responses.at(-1).json()
  assert.deepEqual({ status: result.status, database: result.database, storage: result.storage }, {
    status: 'ok', database: 'connected', storage: 'local',
  })
  assert.ok(['clamav', 'bouncer'].includes(result.scanner))
})

test('B2 health probe aborts on timeout and reports unavailable instead of hanging or passing', async () => {
  let receivedSignal
  const handler = createHealthHandler({
    isDatabaseConnected: () => true,
    storageDriver: 'b2',
    malwareScanner: 'bouncer',
    storageTimeoutMs: 10,
    storageAdapter: {
      check: ({ signal }) => new Promise((_resolve, reject) => {
        receivedSignal = signal
        signal.addEventListener('abort', () => reject(new Error('storage probe aborted')), { once: true })
      }),
    },
  })
  const response = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this },
  }

  await handler({}, response)
  assert.equal(receivedSignal.aborted, true)
  assert.equal(response.statusCode, 503)
  assert.deepEqual(response.body, { status: 'unavailable', database: 'connected', storage: 'disconnected', scanner: 'bouncer' })
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { backendStatusFromHealth } from '../src/services/backendAvailability.js'

test('liveness response keeps backend status connected with production API payloads', () => {
  const health = { status: 'ok' }
  const files = { files: [], storage: { usedBytes: 0, quotaBytes: 524288000 } }
  const shares = { shares: [] }

  assert.equal(health.database === 'connected' ? 'connected' : 'unavailable', 'unavailable')
  assert.equal(backendStatusFromHealth(health), 'connected')
  assert.deepEqual(files, { files: [], storage: { usedBytes: 0, quotaBytes: 524288000 } })
  assert.deepEqual(shares, { shares: [] })
})

test('malformed or unavailable liveness responses remain unavailable', () => {
  assert.equal(backendStatusFromHealth(null), 'unavailable')
  assert.equal(backendStatusFromHealth({ status: 'unavailable' }), 'unavailable')
  assert.equal(backendStatusFromHealth({ database: 'connected' }), 'unavailable')
})

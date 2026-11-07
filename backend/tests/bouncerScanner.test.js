import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { after, test } from 'node:test'
import {
  Bouncer,
  BouncerAuthError,
  BouncerQuotaError,
  BouncerTimeoutError,
} from '@usebouncer/sdk'
import { createBouncerScanner } from '../services/scanners/bouncerScanner.js'
import { storagePath } from '../services/fileStorage.js'

const testKeys = []

async function createFixture(bytes = Buffer.from('scanner fixture')) {
  const key = randomBytes(32).toString('hex')
  testKeys.push(key)
  await mkdir(path.dirname(storagePath(key)), { recursive: true })
  await writeFile(storagePath(key), bytes)
  return key
}

after(async () => {
  await Promise.all(testKeys.map((key) => rm(storagePath(key), { force: true })))
})

test('Bouncer adapter accepts only a completed exact clean verdict', async () => {
  const key = await createFixture()
  class FakeBouncer {
    constructor(apiKey, options) {
      assert.equal(apiKey, 'test-only-dummy-key')
      assert.equal(options.timeoutMs, 15000)
      assert.equal(options.uploadTimeoutMs, 120000)
    }
    async scan(filePath, options) {
      assert.equal(filePath, storagePath(key))
      assert.equal(options.waitTimeoutMs, 120000)
      return { status: 'completed', verdict: 'clean' }
    }
  }

  const scan = createBouncerScanner({ apiKey: 'test-only-dummy-key', BouncerClient: FakeBouncer })
  assert.equal(await scan(key), 'clean')
})

test('Bouncer suspicious and malicious verdicts map to blocked statuses', async () => {
  const key = await createFixture()
  for (const [verdict, expected] of [['suspicious', 'suspicious'], ['malicious', 'infected']]) {
    class FakeBouncer {
      constructor() {}
      async scan() { return { status: 'completed', verdict } }
    }
    const scan = createBouncerScanner({ apiKey: 'test-only-dummy-key', BouncerClient: FakeBouncer })
    assert.equal(await scan(key), expected)
  }
})

test('pending and unknown SDK responses stay failed and blocked', async () => {
  const key = await createFixture()
  for (const result of [
    { status: 'pending', verdict: 'clean' },
    { status: 'completed' },
    { status: 'completed', verdict: 'CLEAN' },
    null,
  ]) {
    class FakeBouncer {
      constructor() {}
      async scan() { return result }
    }
    const scan = createBouncerScanner({ apiKey: 'test-only-dummy-key', BouncerClient: FakeBouncer })
    assert.equal(await scan(key), 'failed')
  }
})

test('timeouts, invalid credentials, and exhausted quota fail with safe errors', async () => {
  const key = await createFixture()
  for (const cause of [
    new BouncerTimeoutError('timeout with provider details'),
    new BouncerAuthError('invalid key provider detail'),
    new BouncerQuotaError('quota details'),
  ]) {
    class FakeBouncer {
      constructor() {}
      async scan() { throw cause }
    }
    const scan = createBouncerScanner({ apiKey: 'test-only-dummy-key', BouncerClient: FakeBouncer })
    await assert.rejects(scan(key), (error) => {
      assert.equal(error.message, 'Bouncer malware scanning did not complete.')
      assert.equal(error.message.includes('test-only-dummy-key'), false)
      assert.equal(error.message.includes('provider detail'), false)
      return true
    })
  }
})

test('installed SDK API timeout and scan-wait timeout are contained and fail closed', async () => {
  const key = await createFixture()
  const apiTimeoutScanner = createBouncerScanner({
    apiKey: 'test-only-dummy-key',
    BouncerClient: Bouncer,
    clientOptions: {
      baseUrl: 'https://api.test',
      timeoutMs: 5,
      maxRetries: 1,
      fetch: (_url, { signal }) => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true })
      }),
    },
  })
  await assert.rejects(apiTimeoutScanner(key), /Bouncer malware scanning did not complete/)

  const pendingFetch = async (url, options = {}) => {
    if (options.method === 'POST' && new URL(url).pathname === '/v1/scan') {
      return Response.json({ status: 'success', data: { scan_id: 'scan_pending', status: 'pending' } }, { status: 202 })
    }
    return Response.json({ status: 'success', data: { scan_id: 'scan_pending', status: 'pending' } })
  }
  const waitTimeoutScanner = createBouncerScanner({
    apiKey: 'test-only-dummy-key',
    BouncerClient: Bouncer,
    waitTimeoutMs: 5,
    clientOptions: { baseUrl: 'https://api.test', timeoutMs: 1000, maxRetries: 1, fetch: pendingFetch },
  })
  await assert.rejects(waitTimeoutScanner(key), /Bouncer malware scanning did not complete/)
})

test('installed SDK uses v2 for a 10 MB upload and returns the documented verdict structure', async () => {
  const key = await createFixture(Buffer.alloc(10 * 1024 * 1024, 0x41))
  const requests = []
  const fakeFetch = async (url, options = {}) => {
    const target = new URL(url)
    requests.push({ url: target, method: options.method || 'GET' })
    if (target.pathname === '/v2/scan' && options.method === 'POST') {
      return Response.json({
        status: 'success',
        data: {
          scan_id: 'scan_test_10mb',
          status: 'pending',
          max_file_size: 25 * 1024 * 1024,
          upload: { url: 'https://upload.test/target', fields: { key: 'test-upload-field', policy: 'test-policy' } },
        },
      }, { status: 201 })
    }
    if (target.hostname === 'upload.test' && options.method === 'POST') return new Response(null, { status: 204 })
    if (target.pathname === '/v2/scan/scan_test_10mb') {
      return Response.json({ status: 'success', data: { scan_id: 'scan_test_10mb', status: 'completed', verdict: 'clean' } })
    }
    throw new Error('Unexpected mocked SDK request.')
  }
  const scan = createBouncerScanner({
    apiKey: 'test-only-dummy-key',
    BouncerClient: Bouncer,
    clientOptions: { baseUrl: 'https://api.test', fetch: fakeFetch, maxRetries: 1 },
  })

  assert.equal(await scan(key), 'clean')
  assert.ok(requests.some(({ url, method }) => url.pathname === '/v2/scan' && method === 'POST'))
  assert.ok(requests.some(({ url }) => url.hostname === 'upload.test'))
  assert.ok(requests.some(({ url, method }) => url.pathname === '/v2/scan/scan_test_10mb' && method === 'GET'))
  assert.equal(requests.some(({ url }) => url.pathname === '/v1/scan'), false)
})

test('installed SDK maps mocked invalid-key and quota HTTP responses to safe blocked failures', async () => {
  const key = await createFixture()
  for (const [status, code] of [[401, 'invalid_api_key'], [429, 'rate_limit_exceeded']]) {
    const fakeFetch = async () => Response.json({ status: 'error', error: { code, message: 'sensitive provider response' } }, { status })
    const scan = createBouncerScanner({
      apiKey: 'test-only-dummy-key',
      BouncerClient: Bouncer,
      clientOptions: { baseUrl: 'https://api.test', fetch: fakeFetch, maxRetries: 1 },
    })
    await assert.rejects(scan(key), (error) => {
      assert.equal(error.message, 'Bouncer malware scanning did not complete.')
      assert.equal(error.message.includes('sensitive'), false)
      return true
    })
  }
})

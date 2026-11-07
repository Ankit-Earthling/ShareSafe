import assert from 'node:assert/strict'
import { once } from 'node:events'
import express from 'express'
import { after, afterEach, test } from 'node:test'
import {
  createAuthenticatedRateLimiter,
  createIpRateLimiter,
  rateLimitAuthenticatedUserKey,
  rateLimitClientKey,
} from '../middleware/ipRateLimiter.js'
import { RATE_LIMITS, RATE_LIMIT_WINDOW_MS } from '../middleware/rateLimiters.js'

const originalRenderValue = process.env.RENDER
let server
let baseUrl

async function startRateLimitServer(limit = 1) {
  const app = express()
  app.get('/limited', createIpRateLimiter({
    windowMs: 60_000,
    limit,
    standardHeaders: false,
    legacyHeaders: false,
  }), (request, response) => response.status(200).json({
    allowed: true,
    ip: request.ip,
    socketAddress: request.socket.remoteAddress,
    trustProxy: request.app.get('trust proxy'),
  }))
  server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  baseUrl = `http://127.0.0.1:${server.address().port}`
}

async function stopRateLimitServer() {
  if (server) {
    server.closeAllConnections?.()
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    server = undefined
  }
}

afterEach(stopRateLimitServer)

after(() => {
  if (originalRenderValue === undefined) delete process.env.RENDER
  else process.env.RENDER = originalRenderValue
})

test('IPv4 and IPv6 peer addresses use express-rate-limit ipKeyGenerator', () => {
  assert.equal(rateLimitClientKey({ socket: { remoteAddress: '198.51.100.10' } }), '198.51.100.10')
  assert.equal(rateLimitClientKey({ socket: { remoteAddress: '2001:db8:1200:ab00::1' } }), '2001:db8:1200:ab00::/56')
  assert.equal(rateLimitClientKey({ socket: { remoteAddress: '2001:db8:1200:ab7f::2' } }), '2001:db8:1200:ab00::/56')
  assert.equal(rateLimitClientKey({ socket: { remoteAddress: '::ffff:192.0.2.1' } }), '192.0.2.1')
})

test('local and Render modes leave trust proxy disabled and rate-limit a normal request by its socket', async () => {
  for (const renderMode of [false, true]) {
    if (renderMode) process.env.RENDER = 'true'
    else delete process.env.RENDER

    await startRateLimitServer()
    const first = await fetch(`${baseUrl}/limited`)
    const firstResult = await first.json()
    const second = await fetch(`${baseUrl}/limited`)

    assert.equal(first.status, 200)
    assert.equal(firstResult.trustProxy, false)
    assert.equal(firstResult.ip, firstResult.socketAddress)
    assert.equal(second.status, 429)
    await stopRateLimitServer()
  }
})

test('forwarded requests through the expected Render chain use the shared socket-peer bucket', async () => {
  process.env.RENDER = 'true'
  await startRateLimitServer()

  const first = await fetch(`${baseUrl}/limited`, {
    headers: { 'X-Forwarded-For': '198.51.100.10, 172.70.1.20, 10.0.0.5' },
  })
  const second = await fetch(`${baseUrl}/limited`, {
    headers: { 'X-Forwarded-For': '198.51.100.11, 172.70.1.21, 10.0.0.6' },
  })

  assert.equal(first.status, 200)
  assert.equal(second.status, 429, 'end-client identity is not inferred from an unverified proxy chain')
})

test('forged X-Forwarded-For, including multiple values, cannot create new buckets', async () => {
  process.env.RENDER = 'true'
  await startRateLimitServer()

  assert.equal((await fetch(`${baseUrl}/limited`, { headers: { 'X-Forwarded-For': '192.0.2.1' } })).status, 200)
  assert.equal((await fetch(`${baseUrl}/limited`, { headers: { 'X-Forwarded-For': '192.0.2.2, 192.0.2.3' } })).status, 429)
  assert.equal((await fetch(`${baseUrl}/limited`, { headers: { 'X-Forwarded-For': '203.0.113.50, 203.0.113.51, 203.0.113.52' } })).status, 429)
})

test('forged CF-Connecting-IP cannot create new buckets, with or without X-Forwarded-For', async () => {
  process.env.RENDER = 'true'
  await startRateLimitServer()

  assert.equal((await fetch(`${baseUrl}/limited`, { headers: { 'CF-Connecting-IP': '198.51.100.10' } })).status, 200)
  assert.equal((await fetch(`${baseUrl}/limited`, {
    headers: { 'CF-Connecting-IP': '198.51.100.11', 'X-Forwarded-For': '198.51.100.11' },
  })).status, 429)
  assert.equal((await fetch(`${baseUrl}/limited`, {
    headers: { 'CF-Connecting-IP': '198.51.100.12', 'X-Forwarded-For': '198.51.100.12, 10.0.0.8' },
  })).status, 429)
})

test('requests without forwarded headers are keyed by the direct socket peer', async () => {
  delete process.env.RENDER
  await startRateLimitServer()

  const response = await fetch(`${baseUrl}/limited`)
  const result = await response.json()
  assert.equal(response.status, 200)
  assert.ok(result.socketAddress)
  assert.equal(result.ip, result.socketAddress)
  assert.equal(result.trustProxy, false)
})

test('authenticated requests use the authenticated user ID, not either forwarded header', async () => {
  const app = express()
  const userLimiter = createAuthenticatedRateLimiter({
    windowMs: 60_000,
    limit: 1,
    standardHeaders: false,
    legacyHeaders: false,
  })
  const authenticateAs = (id) => (request, _response, next) => {
    request.user = { _id: id }
    next()
  }
  app.get('/alice', authenticateAs('user-a'), userLimiter, (_request, response) => response.sendStatus(200))
  app.get('/bob', authenticateAs('user-b'), userLimiter, (_request, response) => response.sendStatus(200))
  server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  baseUrl = `http://127.0.0.1:${server.address().port}`

  const aliceFirst = await fetch(`${baseUrl}/alice`)
  const aliceRepeat = await fetch(`${baseUrl}/alice`, {
    headers: { 'X-Forwarded-For': '192.0.2.200', 'CF-Connecting-IP': '198.51.100.200' },
  })
  const bobFirst = await fetch(`${baseUrl}/bob`, {
    headers: { 'X-Forwarded-For': '192.0.2.200', 'CF-Connecting-IP': '198.51.100.200' },
  })
  const bobRepeat = await fetch(`${baseUrl}/bob`, {
    headers: { 'X-Forwarded-For': '192.0.2.201', 'CF-Connecting-IP': '198.51.100.201' },
  })

  assert.equal(aliceFirst.status, 200)
  assert.equal(aliceRepeat.status, 429)
  assert.equal(bobFirst.status, 200)
  assert.equal(bobRepeat.status, 429)
  assert.equal(rateLimitAuthenticatedUserKey({ user: { _id: 'user-a' }, socket: { remoteAddress: '127.0.0.1' } }), 'user:user-a')
  assert.equal(rateLimitAuthenticatedUserKey({ user: { id: 'user-b' }, socket: { remoteAddress: '127.0.0.1' } }), 'user:user-b')
})

test('production limiter budgets retain brute-force and public-share protection', () => {
  assert.equal(RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000)
  assert.deepEqual(RATE_LIMITS, {
    api: 120,
    authenticatedApi: 120,
    login: 10,
    registration: 10,
    publicShare: 30,
  })
})

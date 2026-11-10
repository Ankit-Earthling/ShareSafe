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

const originalNodeEnv = process.env.NODE_ENV
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
  if (!server) return
  server.closeAllConnections?.()
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  server = undefined
}

afterEach(stopRateLimitServer)

after(() => {
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV
  else process.env.NODE_ENV = originalNodeEnv
})

test('IPv4 and IPv6 peer addresses use express-rate-limit ipKeyGenerator', () => {
  assert.equal(rateLimitClientKey({ socket: { remoteAddress: '198.51.100.10' } }), '198.51.100.10')
  assert.equal(rateLimitClientKey({ socket: { remoteAddress: '2001:db8:1200:ab00::1' } }), '2001:db8:1200:ab00::/56')
  assert.equal(rateLimitClientKey({ socket: { remoteAddress: '2001:db8:1200:ab7f::2' } }), '2001:db8:1200:ab00::/56')
  assert.equal(rateLimitClientKey({ socket: { remoteAddress: '::ffff:192.0.2.1' } }), '192.0.2.1')
})

test('development and production retain the default untrusted proxy boundary', async () => {
  for (const nodeEnv of ['development', 'production']) {
    process.env.NODE_ENV = nodeEnv
    await startRateLimitServer()
    const first = await fetch(`${baseUrl}/limited`)
    const result = await first.json()
    const second = await fetch(`${baseUrl}/limited`)

    assert.equal(first.status, 200)
    assert.equal(result.trustProxy, false)
    assert.equal(result.ip, result.socketAddress)
    assert.equal(second.status, 429)
    await stopRateLimitServer()
  }
})

test('requests through an unverified proxy chain share the socket-peer bucket', async () => {
  await startRateLimitServer()
  const first = await fetch(`${baseUrl}/limited`, {
    headers: { 'X-Forwarded-For': '198.51.100.10, 172.70.1.20, 10.0.0.5' },
  })
  const second = await fetch(`${baseUrl}/limited`, {
    headers: { 'X-Forwarded-For': '198.51.100.11, 172.70.1.21, 10.0.0.6' },
  })
  assert.equal(first.status, 200)
  assert.equal(second.status, 429)
})

test('forged and multiple X-Forwarded-For values cannot create new buckets', async () => {
  await startRateLimitServer()
  assert.equal((await fetch(`${baseUrl}/limited`, { headers: { 'X-Forwarded-For': '192.0.2.1' } })).status, 200)
  assert.equal((await fetch(`${baseUrl}/limited`, { headers: { 'X-Forwarded-For': '192.0.2.2, 192.0.2.3' } })).status, 429)
  assert.equal((await fetch(`${baseUrl}/limited`, { headers: { 'X-Forwarded-For': '203.0.113.50, 203.0.113.51, 203.0.113.52' } })).status, 429)
})

test('forged CF-Connecting-IP cannot create buckets, alone or with X-Forwarded-For', async () => {
  await startRateLimitServer()
  assert.equal((await fetch(`${baseUrl}/limited`, { headers: { 'CF-Connecting-IP': '198.51.100.10' } })).status, 200)
  assert.equal((await fetch(`${baseUrl}/limited`, {
    headers: { 'CF-Connecting-IP': '198.51.100.11', 'X-Forwarded-For': '198.51.100.11' },
  })).status, 429)
})

test('requests without forwarding headers are keyed by the direct socket peer', async () => {
  await startRateLimitServer()
  const response = await fetch(`${baseUrl}/limited`)
  const result = await response.json()
  assert.equal(response.status, 200)
  assert.ok(result.socketAddress)
  assert.equal(result.ip, result.socketAddress)
  assert.equal(result.trustProxy, false)
})

test('authenticated requests have per-user buckets and ignore spoofed forwarding headers', async () => {
  const app = express()
  const limiter = createAuthenticatedRateLimiter({
    windowMs: 60_000,
    limit: 1,
    standardHeaders: false,
    legacyHeaders: false,
  })
  const authenticateAs = (id) => (request, _response, next) => {
    request.user = { _id: id }
    next()
  }
  app.get('/alice', authenticateAs('user-a'), limiter, (_request, response) => response.sendStatus(200))
  app.get('/bob', authenticateAs('user-b'), limiter, (_request, response) => response.sendStatus(200))
  server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  baseUrl = `http://127.0.0.1:${server.address().port}`

  assert.equal((await fetch(`${baseUrl}/alice`)).status, 200)
  assert.equal((await fetch(`${baseUrl}/alice`, {
    headers: { 'X-Forwarded-For': '192.0.2.200', 'CF-Connecting-IP': '198.51.100.200' },
  })).status, 429)
  assert.equal((await fetch(`${baseUrl}/bob`, {
    headers: { 'X-Forwarded-For': '192.0.2.200', 'CF-Connecting-IP': '198.51.100.200' },
  })).status, 200)
  assert.equal((await fetch(`${baseUrl}/bob`, {
    headers: { 'X-Forwarded-For': '192.0.2.201', 'CF-Connecting-IP': '198.51.100.201' },
  })).status, 429)
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

import assert from 'node:assert/strict'
import { once } from 'node:events'
import { randomBytes, randomUUID } from 'node:crypto'
import { after, before, test } from 'node:test'

const email = `auth-${randomUUID()}@example.test`
const password = 'Correct-Horse-2026!'
let User
let mongoose
let server
let baseUrl

before(async () => {
  process.env.PORT = '3100'
  process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/sharesafe_auth_test'
  process.env.FRONTEND_URL = 'http://localhost:5173'
  process.env.JWT_SECRET = randomBytes(32).toString('base64url')
  process.env.SHARE_TOKEN_SECRET = randomBytes(32).toString('base64url')

  const [{ default: userModel }, database, { createApp }] = await Promise.all([
    import('../models/User.js'),
    import('../config/database.js'),
    import('../app.js'),
  ])
  User = userModel
  mongoose = (await import('mongoose')).default

  await database.connectDatabase(process.env.MONGODB_URI)
  await User.init()
  server = createApp().listen(0)
  await once(server, 'listening')
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  if (User) await User.deleteOne({ email })
  if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  if (mongoose?.connection.readyState) await mongoose.disconnect()
})

test('registers, logs in, protects routes, rejects invalid credentials, and logs out', async () => {
  const crossOriginRegister = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://attacker.example' },
    body: JSON.stringify({ name: 'Test User', email, password, role: 'admin' }),
  })
  assert.equal(crossOriginRegister.status, 403)

  const badInput = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: process.env.FRONTEND_URL },
    body: JSON.stringify({ name: 'Test User', email: 'not-an-email', password }),
  })
  assert.equal(badInput.status, 400)

  const registration = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: process.env.FRONTEND_URL },
    body: JSON.stringify({ name: 'Test User', email, password, role: 'admin' }),
  })
  assert.equal(registration.status, 201)
  const registrationBody = await registration.json()
  assert.deepEqual(Object.keys(registrationBody.user).sort(), ['email', 'id', 'name', 'role'])
  assert.equal(registrationBody.user.email, email)
  assert.equal(registrationBody.user.role, 'user')
  const registeredCookie = registration.headers.get('set-cookie')?.split(';', 1)[0]
  assert.match(registeredCookie || '', /^sharesafe_token=/)

  const storedUser = await User.findOne({ email }).select('+passwordHash')
  assert.equal(storedUser.role, 'user')
  assert.ok(storedUser.passwordHash.startsWith('$2'))
  assert.notEqual(storedUser.passwordHash, password)

  const duplicate = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: process.env.FRONTEND_URL },
    body: JSON.stringify({ name: 'Duplicate User', email: email.toUpperCase(), password }),
  })
  assert.equal(duplicate.status, 409)

  const incorrectLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: process.env.FRONTEND_URL },
    body: JSON.stringify({ email, password: 'Wrong-password-2026!' }),
  })
  assert.equal(incorrectLogin.status, 401)
  assert.equal((await incorrectLogin.json()).message, 'Invalid email or password.')

  const unauthorizedMe = await fetch(`${baseUrl}/api/auth/me`)
  assert.equal(unauthorizedMe.status, 401)

  const invalidTokenMe = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Authorization: 'Bearer invalid-token' },
  })
  assert.equal(invalidTokenMe.status, 401)

  const protectedRoute = await fetch(`${baseUrl}/api/files`)
  assert.equal(protectedRoute.status, 401)

  const unknownApiRoute = await fetch(`${baseUrl}/api/no-such-route`)
  assert.equal(unknownApiRoute.status, 404)
  assert.match(unknownApiRoute.headers.get('content-type') || '', /application\/json/)
  assert.deepEqual(await unknownApiRoute.json(), { message: 'Route not found.' })

  const unknownNestedApiRoute = await fetch(`${baseUrl}/api/files/unknown/operation`)
  assert.equal(unknownNestedApiRoute.status, 404)
  assert.match(unknownNestedApiRoute.headers.get('content-type') || '', /application\/json/)
  assert.deepEqual(await unknownNestedApiRoute.json(), { message: 'Route not found.' })

  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: process.env.FRONTEND_URL },
    body: JSON.stringify({ email, password }),
  })
  assert.equal(login.status, 200)
  const loginBody = await login.json()
  assert.deepEqual(loginBody.user, registrationBody.user)
  const sessionCookie = login.headers.get('set-cookie')?.split(';', 1)[0]
  assert.match(sessionCookie || '', /^sharesafe_token=/)

  const currentUser = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Cookie: sessionCookie },
  })
  assert.equal(currentUser.status, 200)
  assert.deepEqual((await currentUser.json()).user, registrationBody.user)

  const authorizedUnknownRoute = await fetch(`${baseUrl}/api/private/data`, {
    headers: { Cookie: sessionCookie },
  })
  assert.equal(authorizedUnknownRoute.status, 404)
  assert.match(authorizedUnknownRoute.headers.get('content-type') || '', /application\/json/)
  assert.deepEqual(await authorizedUnknownRoute.json(), { message: 'Route not found.' })

  const logout = await fetch(`${baseUrl}/api/auth/logout`, { method: 'POST', headers: { Origin: process.env.FRONTEND_URL } })
  assert.equal(logout.status, 200)
  assert.match(logout.headers.get('set-cookie') || '', /Expires=Thu, 01 Jan 1970/i)
})

test('unauthenticated protected-route attempts share a peer limit despite spoofed forwarding headers', async () => {
  let limitReached = false
  for (let attempt = 0; attempt < 130; attempt += 1) {
    const response = await fetch(`${baseUrl}/api/auth/me`, {
      headers: {
        Authorization: 'Bearer invalid-token',
        'X-Forwarded-For': `192.0.2.${(attempt % 254) + 1}`,
        'CF-Connecting-IP': `198.51.100.${(attempt % 254) + 1}`,
      },
    })
    if (response.status === 429) limitReached = true
    else {
      assert.equal(response.status, 401)
      assert.equal(limitReached, false, 'once limited, spoofed client IP headers must not create another bucket')
    }
  }
  assert.equal(limitReached, true)
})

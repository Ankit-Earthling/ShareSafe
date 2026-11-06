import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { startTestServer } from './helpers.js'

let context
let owner
let anotherUser
let file

before(async () => {
  context = await startTestServer('sharesafe_shares_test')
  owner = await context.register()
  anotherUser = await context.register()
  const uploaded = await context.upload(owner.cookie)
  assert.equal(uploaded.response.status, 201)
  file = uploaded.payload.file
})

after(async () => context?.close())

async function createShare({ fileId = file.id, password, expiryDays = 7, maxAccesses = 10 } = {}) {
  return fetch(`${context.baseUrl}/api/shares`, {
    method: 'POST',
    headers: { Cookie: owner.cookie, Origin: process.env.FRONTEND_URL, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileId, expiryDays, maxAccesses, ...(password ? { password } : {}) }),
  })
}

async function accessShare(token, password) {
  return fetch(`${context.baseUrl}/api/public/shares/${token}/access`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(password ? { password } : {}),
  })
}

test('creates secure links, checks passwords and expiry, enforces limits atomically, and scopes owner actions', async () => {
  const created = await createShare({ password: 'link-password-456', maxAccesses: 4 })
  assert.equal(created.status, 201)
  const creation = await created.json()
  const token = new URL(creation.url).pathname.split('/').pop()
  assert.match(token, /^[A-Za-z0-9_-]{43}$/)
  assert.equal(creation.share.passwordProtected, true)
  const stored = await context.ShareLink.findById(creation.share.id).select('+tokenHash +passwordHash')
  assert.notEqual(stored.tokenHash, token)
  assert.match(stored.tokenHash, /^[a-f0-9]{64}$/)
  assert.notEqual(stored.passwordHash, 'link-password-456')

  const publicDetails = await fetch(`${context.baseUrl}/api/public/shares/${token}`)
  assert.equal(publicDetails.status, 200)
  assert.deepEqual((await publicDetails.json()).name, file.name)

  const badPassword = await accessShare(token, 'incorrect-password')
  assert.equal(badPassword.status, 401)
  assert.equal((await context.ShareLink.findById(creation.share.id)).accessCount, 0)

  const download = await accessShare(token, 'link-password-456')
  assert.equal(download.status, 200)
  assert.match(download.headers.get('content-disposition'), /^attachment;/)
  assert.equal(await download.text(), '%PDF-1.7\nShareSafe test fixture')

  const invalidToken = await fetch(`${context.baseUrl}/api/public/shares/not-a-real-token`)
  assert.equal(invalidToken.status, 404)

  const expiredCreated = await createShare()
  const expiredPayload = await expiredCreated.json()
  const expiredToken = new URL(expiredPayload.url).pathname.split('/').pop()
  await context.ShareLink.updateOne({ _id: expiredPayload.share.id }, { $set: { expiresAt: new Date(Date.now() - 1000) } })
  const expired = await fetch(`${context.baseUrl}/api/public/shares/${expiredToken}`)
  assert.equal(expired.status, 404)
  const expiredAccess = await accessShare(expiredToken)
  assert.equal(expiredAccess.status, 404)

  const limitedCreated = await createShare({ maxAccesses: 3 })
  const limitedPayload = await limitedCreated.json()
  const limitedToken = new URL(limitedPayload.url).pathname.split('/').pop()
  const attempts = await Promise.all(Array.from({ length: 8 }, () => accessShare(limitedToken)))
  assert.equal(attempts.filter((response) => response.status === 200).length, 3)
  assert.equal(attempts.filter((response) => response.status === 410).length, 5)
  assert.equal((await context.ShareLink.findById(limitedPayload.share.id)).accessCount, 3)
  const exhausted = await fetch(`${context.baseUrl}/api/public/shares/${limitedToken}`)
  assert.equal(exhausted.status, 410)

  const otherCannotCreate = await createShare({ fileId: (await context.upload(anotherUser.cookie)).payload.file.id })
  assert.equal(otherCannotCreate.status, 404)
  const otherCannotRevoke = await fetch(`${context.baseUrl}/api/shares/${creation.share.id}`, {
    method: 'DELETE', headers: { Cookie: anotherUser.cookie, Origin: process.env.FRONTEND_URL },
  })
  assert.equal(otherCannotRevoke.status, 404)

  const revoked = await fetch(`${context.baseUrl}/api/shares/${creation.share.id}`, {
    method: 'DELETE', headers: { Cookie: owner.cookie, Origin: process.env.FRONTEND_URL },
  })
  assert.equal(revoked.status, 200)
  assert.equal((await revoked.json()).share.status, 'Revoked')
  const revokedAccess = await fetch(`${context.baseUrl}/api/public/shares/${token}`)
  assert.equal(revokedAccess.status, 404)

  const links = await fetch(`${context.baseUrl}/api/shares`, { headers: { Cookie: owner.cookie } })
  assert.equal(links.status, 200)
  const listed = await links.json()
  assert.ok(listed.shares.some((share) => share.id === creation.share.id))
  assert.equal(JSON.stringify(listed).includes(token), false)
})

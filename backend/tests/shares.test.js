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

async function createShare({ fileId = file.id, password, expiryDays = 7, maxAccesses = 10, permission = 'allowDownload' } = {}) {
  return fetch(`${context.baseUrl}/api/shares`, {
    method: 'POST',
    headers: { Cookie: owner.cookie, Origin: process.env.FRONTEND_URL, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileId, expiryDays, maxAccesses, permission, ...(password ? { password } : {}) }),
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
  const fullStored = await context.ShareLink.findById(creation.share.id).select('+tokenHash +tokenSeed')
  assert.notEqual(stored.tokenHash, token)
  assert.notEqual(fullStored.tokenSeed, token)
  assert.match(fullStored.tokenSeed, /^[a-f0-9]{64}$/)
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
  const history = await fetch(`${context.baseUrl}/api/shares/${creation.share.id}/history`, { headers: { Cookie: owner.cookie } })
  assert.equal(history.status, 200)
  const historyEvents = (await history.json()).accesses
  assert.equal(historyEvents.length, 1)
  assert.ok(historyEvents[0].accessedAt)
  const otherHistory = await fetch(`${context.baseUrl}/api/shares/${creation.share.id}/history`, { headers: { Cookie: anotherUser.cookie } })
  assert.equal(otherHistory.status, 404)

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
  const limitedHistory = await fetch(`${context.baseUrl}/api/shares/${limitedPayload.share.id}/history`, { headers: { Cookie: owner.cookie } })
  assert.equal((await limitedHistory.json()).accesses.length, 3)
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
  const relisted = listed.shares.find((share) => share.id === creation.share.id)
  assert.ok(relisted)
  assert.equal(relisted.url, creation.url)
  assert.equal('tokenSeed' in relisted, false)
  assert.equal('tokenHash' in relisted, false)
  assert.equal('passwordHash' in relisted, false)
  assert.equal(stored.tokenHash, (await import('../utils/shareToken.js')).hashShareToken(token))
  assert.notEqual(stored.tokenHash, token)
})

test('enforces view-only links and returns server-generated PDF watermark metadata', async () => {
  const created = await createShare({ permission: 'viewOnly', maxAccesses: 2 })
  assert.equal(created.status, 201)
  const payload = await created.json()
  assert.equal(payload.share.permission, 'viewOnly')
  const token = new URL(payload.url).pathname.split('/').pop()
  const detailsResponse = await fetch(`${context.baseUrl}/api/public/shares/${token}`)
  const details = await detailsResponse.json()
  assert.equal(details.permission, 'viewOnly')
  assert.equal(details.previewSupported, true)

  const directDownload = await accessShare(token)
  assert.equal(directDownload.status, 403)
  assert.equal((await context.ShareLink.findById(payload.share.id)).accessCount, 0)

  const preview = await fetch(`${context.baseUrl}/api/public/shares/${token}/preview`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  assert.equal(preview.status, 200)
  assert.equal(preview.headers.get('content-type'), 'application/pdf')
  assert.match(preview.headers.get('content-disposition'), /^inline;/)
  assert.equal(preview.headers.get('x-sharesafe-link-id'), payload.share.id)
  assert.ok(Number.isFinite(Date.parse(preview.headers.get('x-sharesafe-accessed-at'))))
  assert.equal(preview.headers.get('x-sharesafe-viewer'), 'Anonymous viewer')
  assert.equal(await preview.text(), '%PDF-1.7\nShareSafe test fixture')
  assert.equal((await context.ShareLink.findById(payload.share.id)).accessCount, 1)

  const secondPreview = await fetch(`${context.baseUrl}/api/public/shares/${token}/preview`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: owner.cookie }, body: '{}' })
  assert.equal(secondPreview.status, 200)
  assert.equal(secondPreview.headers.get('x-sharesafe-viewer'), owner.user.email)
  const exhaustedDownload = await accessShare(token)
  assert.equal(exhaustedDownload.status, 410)
})

test('normal downloadable links remain downloadable and non-PDF view-only links have no download fallback', async () => {
  const normalCreated = await createShare()
  const normal = await normalCreated.json()
  const normalToken = new URL(normal.url).pathname.split('/').pop()
  const normalAccess = await accessShare(normalToken)
  assert.equal(normalAccess.status, 200)
  assert.match(normalAccess.headers.get('content-disposition'), /^attachment;/)

  const txt = await context.upload(owner.cookie, { name: 'readme.txt', contents: 'view only text', type: 'text/plain' })
  assert.equal(txt.response.status, 201)
  const unsupportedCreated = await createShare({ fileId: txt.payload.file.id, permission: 'viewOnly' })
  const unsupported = await unsupportedCreated.json()
  const unsupportedToken = new URL(unsupported.url).pathname.split('/').pop()
  const details = await fetch(`${context.baseUrl}/api/public/shares/${unsupportedToken}`)
  assert.equal((await details.json()).previewSupported, false)
  const preview = await fetch(`${context.baseUrl}/api/public/shares/${unsupportedToken}/preview`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  assert.equal(preview.status, 415)
  const direct = await accessShare(unsupportedToken)
  assert.equal(direct.status, 403)
})

import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { startTestServer } from './helpers.js'

let context
let owner
let competitor
let raceAccount

before(async () => {
  context = await startTestServer('sharesafe_quota_test', { storageQuotaBytes: 70 })
  owner = await context.register()
  competitor = await context.register()
  raceAccount = await context.register()
})

after(async () => context?.close())

test('uploads reserve only the owner quota, reject excess, and release usage after deletion', async () => {
  const first = await context.upload(owner.cookie)
  assert.equal(first.response.status, 201)
  assert.equal(first.payload.storage.usedBytes, first.payload.file.size)
  assert.equal(first.payload.storage.quotaBytes, 70)

  const oversizedForQuota = await context.upload(owner.cookie, { name: 'larger.pdf', contents: `%PDF-1.7\n${'x'.repeat(50)}` })
  assert.equal(oversizedForQuota.response.status, 413)

  const competitorFile = await context.upload(competitor.cookie, { name: 'competitor.pdf', contents: `%PDF-1.7\n${'y'.repeat(50)}` })
  assert.equal(competitorFile.response.status, 201)
  assert.equal(competitorFile.payload.storage.usedBytes, competitorFile.payload.file.size)

  const deletion = await fetch(`${context.baseUrl}/api/files/${first.payload.file.id}`, {
    method: 'DELETE', headers: { Cookie: owner.cookie, Origin: process.env.FRONTEND_URL },
  })
  assert.equal(deletion.status, 200)
  assert.equal((await deletion.json()).storage.usedBytes, 0)
  const retry = await context.upload(owner.cookie, { name: 'retry.pdf', contents: `%PDF-1.7\n${'z'.repeat(50)}` })
  assert.equal(retry.response.status, 201)
})

test('concurrent uploads cannot exceed a user quota', async () => {
  const attempts = await Promise.all([
    context.upload(raceAccount.cookie, { name: 'race-a.pdf', contents: `%PDF-1.7\n${'a'.repeat(30)}` }),
    context.upload(raceAccount.cookie, { name: 'race-b.pdf', contents: `%PDF-1.7\n${'b'.repeat(30)}` }),
  ])
  assert.equal(attempts.filter((item) => item.response.status === 201).length, 1)
  assert.equal(attempts.filter((item) => item.response.status === 413).length, 1)
  const listing = await fetch(`${context.baseUrl}/api/files`, { headers: { Cookie: raceAccount.cookie } })
  const { storage } = await listing.json()
  assert.ok(storage.usedBytes <= storage.quotaBytes)
  assert.equal(storage.usedBytes, 39)
})

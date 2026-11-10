import assert from 'node:assert/strict'
import { access } from 'node:fs/promises'
import { after, before, test } from 'node:test'
import { startTestServer } from './helpers.js'

let context
let owner
let anotherUser

before(async () => {
  context = await startTestServer('sharesafe_files_test')
  owner = await context.register()
  anotherUser = await context.register()
})

after(async () => context?.close())

test('validates uploads, scopes file ownership, lists files, and removes local files on deletion', async () => {
  const missing = await fetch(`${context.baseUrl}/api/files/upload`, {
    method: 'POST', headers: { Cookie: owner.cookie, Origin: process.env.FRONTEND_URL }, body: new FormData(),
  })
  assert.equal(missing.status, 400)

  const noOrigin = await fetch(`${context.baseUrl}/api/files/upload`, {
    method: 'POST', headers: { Cookie: owner.cookie }, body: new FormData(),
  })
  assert.equal(noOrigin.status, 403)

  const tooLargeForm = new FormData()
  tooLargeForm.append('file', new Blob([Buffer.alloc(10 * 1024 * 1024 + 1)], { type: 'application/pdf' }), 'large.pdf')
  const oversized = await fetch(`${context.baseUrl}/api/files/upload`, {
    method: 'POST', headers: { Cookie: owner.cookie, Origin: process.env.FRONTEND_URL }, body: tooLargeForm,
  })
  assert.equal(oversized.status, 413)

  const disallowed = await context.upload(owner.cookie, { name: 'run.exe', contents: 'MZ executable', type: 'application/x-msdownload' })
  assert.equal(disallowed.response.status, 415)

  const incorrectSignature = await context.upload(owner.cookie, { name: 'image.png', contents: 'not really a png', type: 'image/png' })
  assert.equal(incorrectSignature.response.status, 415)

  const own = await context.upload(owner.cookie)
  assert.equal(own.response.status, 201)
  assert.deepEqual(Object.keys(own.payload.file).sort(), ['id', 'name', 'scanStatus', 'size', 'type', 'uploadedAt'])
  assert.equal(own.payload.file.scanStatus, 'clean')
  const ownMetadata = await fetch(`${context.baseUrl}/api/files/${own.payload.file.id}`, { headers: { Cookie: owner.cookie } })
  assert.equal(ownMetadata.status, 200)
  assert.equal((await ownMetadata.json()).file.name, 'sample.pdf')
  const ownerDownload = await fetch(`${context.baseUrl}/api/files/${own.payload.file.id}/download`, { headers: { Cookie: owner.cookie } })
  assert.equal(ownerDownload.status, 200)
  assert.equal(await ownerDownload.text(), '%PDF-1.7\nShareSafe test fixture')
  const stored = await context.StoredFile.findById(own.payload.file.id).select('+storageKey')
  assert.match(stored.storageKey, /^[a-f0-9]{64}$/)
  const physicalPath = context.storage.storagePath(stored.storageKey)
  await access(physicalPath)
  await assert.rejects(access(context.storage.stagedStoragePath(stored.storageKey)), { code: 'ENOENT' })

  const secondOwnerFile = await context.upload(anotherUser.cookie)
  assert.equal(secondOwnerFile.response.status, 201)
  const list = await fetch(`${context.baseUrl}/api/files`, { headers: { Cookie: owner.cookie } })
  assert.equal(list.status, 200)
  assert.deepEqual((await list.json()).files.map((file) => file.id), [own.payload.file.id])

  const forbiddenGet = await fetch(`${context.baseUrl}/api/files/${secondOwnerFile.payload.file.id}`, { headers: { Cookie: owner.cookie } })
  assert.equal(forbiddenGet.status, 404)
  const forbiddenDownload = await fetch(`${context.baseUrl}/api/files/${secondOwnerFile.payload.file.id}/download`, { headers: { Cookie: owner.cookie } })
  assert.equal(forbiddenDownload.status, 404)
  const forbiddenDelete = await fetch(`${context.baseUrl}/api/files/${secondOwnerFile.payload.file.id}`, {
    method: 'DELETE', headers: { Cookie: owner.cookie, Origin: process.env.FRONTEND_URL },
  })
  assert.equal(forbiddenDelete.status, 404)

  const deleted = await fetch(`${context.baseUrl}/api/files/${own.payload.file.id}`, {
    method: 'DELETE', headers: { Cookie: owner.cookie, Origin: process.env.FRONTEND_URL },
  })
  assert.equal(deleted.status, 200)
  assert.equal(await context.StoredFile.findById(own.payload.file.id), null)
  await assert.rejects(access(physicalPath), { code: 'ENOENT' })
})

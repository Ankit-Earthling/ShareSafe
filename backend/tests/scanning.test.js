import assert from 'node:assert/strict'
import { access } from 'node:fs/promises'
import { after, before, test } from 'node:test'
import { startTestServer } from './helpers.js'

let context
let owner
let scannerMode = 'clean'
let releaseScan
let scanStarted

before(async () => {
  context = await startTestServer('sharesafe_scanning_test', {
    scanFile: async () => {
      if (scannerMode === 'pending') {
        scanStarted()
        return new Promise((resolve) => { releaseScan = () => resolve('clean') })
      }
      if (scannerMode === 'unavailable') throw new Error('scanner unavailable')
      return scannerMode
    },
  })
  owner = await context.register()
})

after(async () => context?.close())

async function createShare(fileId) {
  return fetch(`${context.baseUrl}/api/shares`, {
    method: 'POST',
    headers: { Cookie: owner.cookie, Origin: process.env.FRONTEND_URL, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileId, expiryDays: 7, maxAccesses: 5 }),
  })
}

test('pending files cannot be downloaded or shared and clean files become accessible', async () => {
  scannerMode = 'pending'
  const started = new Promise((resolve) => { scanStarted = resolve })
  const uploading = context.upload(owner.cookie)
  await started
  const listed = await fetch(`${context.baseUrl}/api/files`, { headers: { Cookie: owner.cookie } })
  const files = (await listed.json()).files
  const pending = files.find((item) => item.name === 'sample.pdf')
  assert.equal(pending.scanStatus, 'pending')
  const pendingDownload = await fetch(`${context.baseUrl}/api/files/${pending.id}/download`, { headers: { Cookie: owner.cookie } })
  assert.equal(pendingDownload.status, 409)
  assert.equal((await createShare(pending.id)).status, 409)

  releaseScan()
  const uploadResult = await uploading
  assert.equal(uploadResult.response.status, 201)
  assert.equal(uploadResult.payload.file.scanStatus, 'clean')
  const download = await fetch(`${context.baseUrl}/api/files/${pending.id}/download`, { headers: { Cookie: owner.cookie } })
  assert.equal(download.status, 200)
})

test('scanner unavailable records failed state and infected files are removed and blocked', async () => {
  const beforeFailedScan = await context.User.findById(owner.user.id).select('usedStorageBytes')
  scannerMode = 'unavailable'
  const unavailable = await context.upload(owner.cookie)
  assert.equal(unavailable.response.status, 503)
  assert.match(unavailable.payload.message, /Malware scanning is unavailable/)
  const failed = await context.StoredFile.findOne({ owner: owner.user.id, originalName: 'sample.pdf', scanStatus: 'failed' }).select('+storageKey +storageProvider')
  assert.ok(failed)
  assert.equal(failed.storageAccounted, false)
  await assert.rejects(access(context.storage.stagedStoragePath(failed.storageKey)), { code: 'ENOENT' })
  const afterFailedScan = await context.User.findById(owner.user.id).select('usedStorageBytes')
  assert.equal(afterFailedScan.usedStorageBytes, beforeFailedScan.usedStorageBytes)
  const failedDownload = await fetch(`${context.baseUrl}/api/files/${failed._id}/download`, { headers: { Cookie: owner.cookie } })
  assert.equal(failedDownload.status, 409)
  assert.equal((await createShare(failed._id.toString())).status, 409)

  scannerMode = 'infected'
  const infectedResult = await context.upload(owner.cookie)
  assert.equal(infectedResult.response.status, 422)
  const infected = await context.StoredFile.findOne({ owner: owner.user.id, originalName: 'sample.pdf', scanStatus: 'infected' }).select('+storageKey +storageProvider')
  assert.ok(infected)
  assert.equal(infected.storageAccounted, false)
  const afterInfectedScan = await context.User.findById(owner.user.id).select('usedStorageBytes')
  assert.equal(afterInfectedScan.usedStorageBytes, afterFailedScan.usedStorageBytes)
  await assert.rejects(access(context.storage.storagePath(infected.storageKey)), { code: 'ENOENT' })
  await assert.rejects(access(context.storage.stagedStoragePath(infected.storageKey)), { code: 'ENOENT' })
  const infectedDownload = await fetch(`${context.baseUrl}/api/files/${infected._id}/download`, { headers: { Cookie: owner.cookie } })
  assert.equal(infectedDownload.status, 409)
  assert.equal((await createShare(infected._id.toString())).status, 409)

  scannerMode = 'suspicious'
  const suspiciousResult = await context.upload(owner.cookie)
  assert.equal(suspiciousResult.response.status, 422)
  const suspicious = await context.StoredFile.findOne({ owner: owner.user.id, originalName: 'sample.pdf', scanStatus: 'suspicious' }).select('+storageKey +storageProvider')
  assert.ok(suspicious)
  assert.equal(suspicious.storageAccounted, false)
  const afterSuspiciousScan = await context.User.findById(owner.user.id).select('usedStorageBytes')
  assert.equal(afterSuspiciousScan.usedStorageBytes, afterFailedScan.usedStorageBytes)
  await assert.rejects(access(context.storage.storagePath(suspicious.storageKey)), { code: 'ENOENT' })
  await assert.rejects(access(context.storage.stagedStoragePath(suspicious.storageKey)), { code: 'ENOENT' })
  const suspiciousDownload = await fetch(`${context.baseUrl}/api/files/${suspicious._id}/download`, { headers: { Cookie: owner.cookie } })
  assert.equal(suspiciousDownload.status, 409)
  assert.equal((await createShare(suspicious._id.toString())).status, 409)
})

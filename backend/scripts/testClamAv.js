import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { removeStagedFile, stagedStoragePath } from '../services/fileStorage.js'
import { scanStoredFile } from '../services/scanners/index.js'

const cleanKey = randomBytes(32).toString('hex')
const eicarKey = randomBytes(32).toString('hex')
const eicarFixture = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'

try {
  await writeFile(stagedStoragePath(cleanKey), 'ShareSafe ClamAV clean test fixture.')
  await writeFile(stagedStoragePath(eicarKey), eicarFixture)
  await scanStoredFile.check()
  assert.equal(await scanStoredFile(cleanKey), 'clean')
  assert.equal(await scanStoredFile(eicarKey), 'infected')
  console.info('Live ClamAV check passed: clean fixture accepted and EICAR fixture detected.')
} catch (error) {
  const category = typeof error?.code === 'string' && /^CLAMAV_[A-Z_]+$/.test(error.code)
    ? error.code.toLowerCase().replaceAll('_', '-')
    : 'clamav-live-check-failed'
  console.error(`Live ClamAV check failed (${category}). Ensure Docker Compose reports the clamav service healthy.`)
  process.exitCode = 1
} finally {
  await Promise.all([removeStagedFile(cleanKey), removeStagedFile(eicarKey)])
}

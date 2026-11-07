import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { after, test } from 'node:test'
import { DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { storagePath } from '../services/fileStorage.js'
import { createBackblazeB2Storage } from '../services/storage/backblazeB2.js'
import { migrateLocalObjectToB2 } from '../services/storage/migration.js'

const testFiles = []
after(async () => Promise.all(testFiles.map((filePath) => rm(filePath, { force: true }))))

test('B2 adapter writes, verifies, streams, and deletes private objects with stable opaque keys', async () => {
  const storageKey = randomBytes(32).toString('hex')
  const filePath = storagePath(storageKey)
  testFiles.push(filePath)
  await mkdir(new URL('../uploads/', import.meta.url), { recursive: true })
  const bytes = Buffer.from('ShareSafe private B2 adapter fixture')
  await writeFile(filePath, bytes)
  const objects = new Map()
  const commands = []
  const client = {
    async send(command) {
      commands.push(command)
      const { Bucket, Key } = command.input
      if (command instanceof PutObjectCommand) {
        const chunks = []
        for await (const chunk of command.input.Body) chunks.push(chunk)
        objects.set(`${Bucket}/${Key}`, { bytes: Buffer.concat(chunks), metadata: command.input.Metadata })
        return {}
      }
      if (command instanceof HeadObjectCommand) {
        const object = objects.get(`${Bucket}/${Key}`)
        if (!object) throw new Error('Missing object')
        return { ContentLength: object.bytes.length, Metadata: object.metadata }
      }
      if (command instanceof GetObjectCommand) {
        const object = objects.get(`${Bucket}/${Key}`)
        if (!object) throw new Error('Missing object')
        return { Body: Readable.from([object.bytes]) }
      }
      if (command instanceof DeleteObjectCommand) {
        objects.delete(`${Bucket}/${Key}`)
        return {}
      }
      throw new Error('Unexpected storage operation.')
    },
  }
  const storage = createBackblazeB2Storage({ client, bucket: 'sharesafe-private-test' })

  const uploaded = await storage.putFile(storageKey, filePath, 'text/plain')
  const head = await storage.headFile(storageKey)
  const stream = await storage.getFile(storageKey)
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  assert.equal(uploaded.size, bytes.length)
  assert.equal(head.size, bytes.length)
  assert.equal(head.sha256, uploaded.sha256)
  assert.deepEqual(Buffer.concat(chunks), bytes)
  assert.equal(commands[0].input.Bucket, 'sharesafe-private-test')
  assert.equal(commands[0].input.Key, storageKey)
  await storage.removeFile(storageKey)
  assert.equal(objects.size, 0)
})

test('B2 health check forwards an abort signal to the SDK request', async () => {
  const controller = new AbortController()
  let receivedSignal
  const storage = createBackblazeB2Storage({
    bucket: 'sharesafe-private-test',
    client: {
      async send(command, options) {
        assert.ok(command instanceof HeadBucketCommand)
        receivedSignal = options.abortSignal
      },
    },
  })

  await storage.check({ signal: controller.signal })
  assert.equal(receivedSignal, controller.signal)
})

test('local-to-B2 migration activates only after size and SHA-256 verification', async () => {
  let activated = false
  let removed = false
  const b2Storage = {
    putFile: async () => ({ size: 10, sha256: 'matching-hash' }),
    headFile: async () => ({ size: 10, sha256: 'matching-hash' }),
    removeFile: async () => { removed = true },
  }
  const migrated = await migrateLocalObjectToB2({
    storageKey: 'opaque-test-key',
    sourcePath: 'unused-by-fake-storage',
    contentType: 'text/plain',
    expectedSize: 10,
    b2Storage,
    activateProvider: async () => { activated = true; return true },
  })
  assert.equal(migrated, true)
  assert.equal(activated, true)
  assert.equal(removed, false)

  await assert.rejects(migrateLocalObjectToB2({
    storageKey: 'opaque-test-key',
    sourcePath: 'unused-by-fake-storage',
    contentType: 'text/plain',
    expectedSize: 10,
    b2Storage: { ...b2Storage, headFile: async () => ({ size: 10, sha256: 'mismatch' }) },
    activateProvider: async () => { throw new Error('Must not activate a mismatched copy.') },
  }), /verification failed/)

  removed = false
  const orphaned = await migrateLocalObjectToB2({
    storageKey: 'opaque-test-key',
    sourcePath: 'unused-by-fake-storage',
    contentType: 'text/plain',
    expectedSize: 10,
    b2Storage,
    activateProvider: async () => false,
  })
  assert.equal(orphaned, false)
  assert.equal(removed, true)
})

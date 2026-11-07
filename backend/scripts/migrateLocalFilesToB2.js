import mongoose from 'mongoose'
import StoredFile from '../models/StoredFile.js'
import { connectDatabase } from '../config/database.js'
import { env } from '../config/env.js'
import { storagePath } from '../services/fileStorage.js'
import { backblazeB2Storage } from '../services/storage/backblazeB2Client.js'
import { migrateLocalObjectToB2 } from '../services/storage/migration.js'

async function main() {
  if (env.storageDriver !== 'b2' || !backblazeB2Storage) {
    throw new Error('Set STORAGE_DRIVER=b2 and configure B2 credentials before migration.')
  }

  await connectDatabase(env.mongoUri)
  const apply = process.argv.includes('--apply')
  const cursor = StoredFile.find({
    storageAccounted: true,
    $or: [{ storageProvider: 'local' }, { storageProvider: { $exists: false } }],
  }).select('+storageKey +storageProvider').cursor()
  let examined = 0
  let migrated = 0
  let failed = 0

  try {
    for await (const file of cursor) {
      examined += 1
      if (!apply) continue
      try {
        const didMigrate = await migrateLocalObjectToB2({
          storageKey: file.storageKey,
          sourcePath: storagePath(file.storageKey),
          contentType: file.mimeType,
          expectedSize: file.size,
          b2Storage: backblazeB2Storage,
          activateProvider: async () => {
            const result = await StoredFile.updateOne(
              { _id: file._id, storageKey: file.storageKey, storageProvider: { $ne: 'b2' } },
              { $set: { storageProvider: 'b2' } },
            )
            return result.modifiedCount === 1
          },
        })
        if (didMigrate) migrated += 1
      } catch {
        failed += 1
      }
    }
  } finally {
    await cursor.close()
    await mongoose.disconnect()
  }

  console.info(`B2 migration ${apply ? 'finished' : 'dry run'}: examined=${examined}, migrated=${migrated}, failed=${failed}. Local copies were not deleted.`)
  if (failed) process.exitCode = 1
}

main().catch(async () => {
  await mongoose.disconnect().catch(() => {})
  console.error('B2 migration could not complete. Check backend configuration, local file availability, and B2 access.')
  process.exitCode = 1
})

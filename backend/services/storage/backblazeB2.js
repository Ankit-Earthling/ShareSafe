import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'

export function createBackblazeB2Storage({ client, bucket }) {
  if (!client || !bucket) throw new Error('B2 storage requires a client and bucket.')

  return {
    async putFile(storageKey, sourcePath, contentType) {
      const fileStat = await stat(sourcePath)
      const sha256 = await hashFile(sourcePath)
      await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: storageKey,
        Body: createReadStream(sourcePath),
        ContentLength: fileStat.size,
        ContentType: contentType || 'application/octet-stream',
        Metadata: { 'sharesafe-sha256': sha256 },
      }))
      return { size: fileStat.size, sha256 }
    },

    async getFile(storageKey) {
      const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: storageKey }))
      if (!result.Body) throw new Error('The private object is unavailable.')
      return result.Body
    },

    async removeFile(storageKey) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: storageKey }))
    },

    async headFile(storageKey) {
      const result = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: storageKey }))
      return {
        size: result.ContentLength,
        sha256: result.Metadata?.['sharesafe-sha256'],
      }
    },

    async check() {
      await client.send(new HeadBucketCommand({ Bucket: bucket }))
    },
  }
}
async function hashFile(filePath) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(filePath)) hash.update(chunk)
  return hash.digest('hex')
}

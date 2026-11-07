import { S3Client } from '@aws-sdk/client-s3'
import { env } from '../../config/env.js'
import { createBackblazeB2Storage } from './backblazeB2.js'

export const backblazeB2Storage = env.storageDriver === 'b2'
  ? createBackblazeB2Storage({
    client: new S3Client({
      endpoint: env.b2Endpoint,
      region: env.b2Region,
      forcePathStyle: true,
      credentials: { accessKeyId: env.b2KeyId, secretAccessKey: env.b2ApplicationKey },
    }),
    bucket: env.b2Bucket,
  })
  : null

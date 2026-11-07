import { once } from 'node:events'
import { randomUUID } from 'node:crypto'

export async function startTestServer(databaseName, { scanFile = async () => 'clean', storageQuotaBytes, readinessHandler } = {}) {
  process.env.PORT = '3100'
  process.env.MONGODB_URI = `mongodb://127.0.0.1:27017/${databaseName}`
  process.env.FRONTEND_URL = 'http://localhost:5173'
  process.env.MALWARE_SCANNER = 'clamav'
  process.env.STORAGE_DRIVER = 'local'
  process.env.JWT_SECRET = randomUUID() + randomUUID()
  process.env.SHARE_TOKEN_SECRET = randomUUID() + randomUUID()
  if (storageQuotaBytes) process.env.DEFAULT_STORAGE_QUOTA_BYTES = String(storageQuotaBytes)

  const [{ createApp }, database, userModule, fileModule, shareModule, mongooseModule, storage, fileStorage] = await Promise.all([
    import('../app.js'),
    import('../config/database.js'),
    import('../models/User.js'),
    import('../models/StoredFile.js'),
    import('../models/ShareLink.js'),
    import('mongoose'),
    import('../services/storage/index.js'),
    import('../services/fileStorage.js'),
  ])
  const mongoose = mongooseModule.default
  const User = userModule.default
  const StoredFile = fileModule.default
  const ShareLink = shareModule.default
  await database.connectDatabase(process.env.MONGODB_URI)
  await Promise.all([User.init(), StoredFile.init(), ShareLink.init()])
  const server = createApp({ scanFile, readinessHandler }).listen(0)
  await once(server, 'listening')
  const baseUrl = `http://127.0.0.1:${server.address().port}`

  async function register() {
    const email = `test-${randomUUID()}@example.test`
    const response = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: process.env.FRONTEND_URL },
      body: JSON.stringify({ name: 'Integration User', email, password: 'Long-Enough-Password-123!' }),
    })
    if (!response.ok) throw new Error(`Test account registration failed with ${response.status}.`)
    const { user } = await response.json()
    return { user, cookie: response.headers.get('set-cookie')?.split(';', 1)[0] }
  }

  async function upload(cookie, { name = 'sample.pdf', contents = '%PDF-1.7\nShareSafe test fixture', type = 'application/pdf' } = {}) {
    const form = new FormData()
    form.append('file', new Blob([contents], { type }), name)
    const response = await fetch(`${baseUrl}/api/files/upload`, {
      method: 'POST',
      headers: { Cookie: cookie, Origin: process.env.FRONTEND_URL },
      body: form,
    })
    return { response, payload: await response.json().catch(() => ({})) }
  }

  async function close() {
    const users = await User.find({ email: /^test-.*@example\.test$/ }).select('_id')
    const ownerIds = users.map((user) => user._id)
    const storedFiles = await StoredFile.find({ owner: { $in: ownerIds } }).select('+storageKey')
    await Promise.all(storedFiles.map((file) => storage.removeStoredFile(file.storageKey).catch(() => {})))
    await Promise.all([
      ShareLink.deleteMany({ owner: { $in: ownerIds } }),
      StoredFile.deleteMany({ owner: { $in: ownerIds } }),
      User.deleteMany({ _id: { $in: ownerIds } }),
    ])
    server.closeAllConnections?.()
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    if (mongoose.connection.readyState) await mongoose.disconnect()
  }

  return { baseUrl, User, StoredFile, ShareLink, mongoose, register, upload, close, storage: { ...storage, storagePath: fileStorage.storagePath } }
}

import test from 'node:test'
import assert from 'node:assert/strict'
import { createApiClient, resolveApiBaseUrl } from '../src/services/api.js'

test('frontend API paths and methods match the backend contract under the production base path', async () => {
  assert.equal(resolveApiBaseUrl('/api/'), '/api')
  const requests = []
  const client = createApiClient({
    baseUrl: resolveApiBaseUrl('/api/'),
    fetchImpl: async (url, options = {}) => {
      requests.push({ url, method: options.method || 'GET' })
      return {
        ok: true,
        json: async () => ({}),
        blob: async () => new Blob(),
        headers: new Headers(),
      }
    },
  })

  await client.authApi.register({})
  await client.authApi.login({})
  await client.authApi.logout()
  await client.authApi.me()
  await client.getHealth()
  await client.filesApi.list()
  await client.filesApi.upload(new Blob(['test']))
  await client.filesApi.get('file-id')
  await client.filesApi.download('file-id')
  await client.filesApi.delete('file-id')
  await client.sharesApi.list()
  await client.sharesApi.create({})
  await client.sharesApi.revoke('share-id')
  await client.sharesApi.history('share-id')
  await client.sharesApi.publicDetails('token')
  await client.sharesApi.access('token')
  await client.sharesApi.preview('token')

  assert.deepEqual(requests, [
    { url: '/api/auth/register', method: 'POST' },
    { url: '/api/auth/login', method: 'POST' },
    { url: '/api/auth/logout', method: 'POST' },
    { url: '/api/auth/me', method: 'GET' },
    { url: '/api/health', method: 'GET' },
    { url: '/api/files', method: 'GET' },
    { url: '/api/files/upload', method: 'POST' },
    { url: '/api/files/file-id', method: 'GET' },
    { url: '/api/files/file-id/download', method: 'GET' },
    { url: '/api/files/file-id', method: 'DELETE' },
    { url: '/api/shares', method: 'GET' },
    { url: '/api/shares', method: 'POST' },
    { url: '/api/shares/share-id', method: 'DELETE' },
    { url: '/api/shares/share-id/history', method: 'GET' },
    { url: '/api/public/shares/token', method: 'GET' },
    { url: '/api/public/shares/token/access', method: 'POST' },
    { url: '/api/public/shares/token/preview', method: 'POST' },
  ])
})

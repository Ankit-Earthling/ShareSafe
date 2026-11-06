const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api').replace(/\/$/, '')

async function request(path, { body, headers, ...options } = {}) {
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(body === undefined || isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: isFormData ? body : JSON.stringify(body) }),
  })
  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    const error = new Error(payload.message || 'The request could not be completed.')
    error.status = response.status
    throw error
  }

  return payload
}

export const authApi = {
  register: (credentials) => request('/auth/register', { method: 'POST', body: credentials }),
  login: (credentials) => request('/auth/login', { method: 'POST', body: credentials }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  me: (options) => request('/auth/me', options),
}

export function getHealth(options) {
  return request('/health', options)
}

export const filesApi = {
  list: () => request('/files'),
  upload: (file) => {
    const form = new FormData()
    form.append('file', file)
    return request('/files/upload', { method: 'POST', body: form })
  },
  get: (id) => request(`/files/${encodeURIComponent(id)}`),
  download: async (id) => {
    const response = await fetch(`${API_BASE_URL}/files/${encodeURIComponent(id)}/download`, { credentials: 'include' })
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      throw new Error(payload.message || 'The file could not be downloaded.')
    }
    return response.blob()
  },
  delete: (id) => request(`/files/${encodeURIComponent(id)}`, { method: 'DELETE' }),
}

export const sharesApi = {
  list: () => request('/shares'),
  create: (details) => request('/shares', { method: 'POST', body: details }),
  revoke: (id) => request(`/shares/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  history: (id) => request(`/shares/${encodeURIComponent(id)}/history`),
  publicDetails: (token) => request(`/public/shares/${encodeURIComponent(token)}`),
  access: async (token, password) => {
    const response = await fetch(`${API_BASE_URL}/public/shares/${encodeURIComponent(token)}/access`, {
      method: 'POST',
      headers: { Accept: 'application/octet-stream', 'Content-Type': 'application/json' },
      body: JSON.stringify(password ? { password } : {}),
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      const error = new Error(payload.message || 'The sharing link could not be opened.')
      error.status = response.status
      throw error
    }
    return response.blob()
  },
}

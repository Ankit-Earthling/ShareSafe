import test from 'node:test'
import assert from 'node:assert/strict'
import { authRedirectForPage, pageFromPath, pagePaths } from '../src/services/routing.js'

test('known frontend routes resolve consistently, including refresh paths', () => {
  for (const [page, path] of Object.entries(pagePaths)) assert.equal(pageFromPath(path), page)
  assert.equal(pageFromPath('/dashboard'), 'Dashboard')
  assert.equal(pageFromPath('/files/'), 'My Files')
  assert.equal(pageFromPath('/share/public-token'), 'Public Share')
})

test('unknown frontend routes do not silently become the dashboard', () => {
  assert.equal(pageFromPath('/not-a-route'), 'Not Found')
})

test('authentication redirects protect dashboard routes and preserve public routes', () => {
  for (const path of ['/', '/dashboard', '/files', '/links', '/settings']) {
    assert.equal(authRedirectForPage(pageFromPath(path), null), 'Login', `${path} should require authentication`)
  }
  assert.equal(authRedirectForPage('Login', null), null)
  assert.equal(authRedirectForPage('Register', null), null)
  assert.equal(authRedirectForPage('Public Share', null), null)
  assert.equal(authRedirectForPage('Not Found', null), null)
  assert.equal(authRedirectForPage('Login', { id: 'user-id' }), 'Dashboard')
  assert.equal(authRedirectForPage('Register', { id: 'user-id' }), 'Dashboard')
  assert.equal(authRedirectForPage('Settings', { id: 'user-id' }), null)
})

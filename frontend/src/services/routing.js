const pagePaths = {
  Dashboard: '/',
  'My Files': '/files',
  'Shared Links': '/links',
  Settings: '/settings',
  Login: '/login',
  Register: '/register',
}

export function pageFromPath(pathname) {
  const normalizedPath = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  if (normalizedPath === '/dashboard') return 'Dashboard'
  if (/^\/share\/[^/]+$/.test(normalizedPath)) return 'Public Share'
  return Object.entries(pagePaths).find(([, path]) => path === normalizedPath)?.[0] || 'Not Found'
}

export function authRedirectForPage(page, user) {
  const authPages = ['Login', 'Register']
  if (!user && page !== 'Public Share' && page !== 'Not Found' && !authPages.includes(page)) return 'Login'
  if (user && authPages.includes(page)) return 'Dashboard'
  return null
}

export { pagePaths }

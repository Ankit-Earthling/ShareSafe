import { useCallback, useEffect, useMemo, useState } from 'react'
import { authApi } from '../services/api.js'
import { AuthContext } from './authContext.js'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    authApi.me()
      .then(({ user: currentUser }) => {
        if (active) setUser(currentUser)
      })
      .catch(() => {
        if (active) setUser(null)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [])

  const login = useCallback(async (credentials) => {
    const result = await authApi.login(credentials)
    setUser(result.user)
    return result.user
  }, [])

  const register = useCallback(async (details) => {
    const result = await authApi.register(details)
    setUser(result.user)
    return result.user
  }, [])

  const logout = useCallback(async () => {
    await authApi.logout()
    setUser(null)
  }, [])

  const value = useMemo(() => ({ user, loading, login, register, logout }), [user, loading, login, register, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

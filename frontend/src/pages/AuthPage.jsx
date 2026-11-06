import { useState } from 'react'
import Icon from '../components/Icon.jsx'

export default function AuthPage({ mode, theme, onToggleTheme, onNavigate, onLogin, onRegister }) {
  const isRegister = mode === 'Register'
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      if (isRegister) await onRegister({ name, email, password })
      else await onLogin({ email, password })
      onNavigate('Dashboard', true)
    } catch (requestError) {
      setError(requestError.status ? requestError.message : 'Cannot reach ShareSafe. Check the backend and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return <main className="auth-page">
    <div className="auth-topbar">
      <a className="brand" href="/" onClick={(event) => { event.preventDefault(); onNavigate('Dashboard', true) }}>
        <span className="brand-mark"><Icon name="shield" size={21} /></span>
        <span>share<span className="brand-accent">safe</span></span>
      </a>
      <button className="theme-toggle" type="button" onClick={onToggleTheme} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}>
        <Icon name={theme === 'light' ? 'moon' : 'sun'} size={18} /><span>{theme === 'light' ? 'Dark' : 'Light'}</span>
      </button>
    </div>
    <section className="auth-card">
      <div className="auth-heading">
        <h1>{isRegister ? 'Create your account' : 'Welcome back'}</h1>
        <p>{isRegister ? 'Sign up to manage your shared files.' : 'Log in to continue to your files.'}</p>
      </div>
      <form className="auth-form" onSubmit={handleSubmit}>
        {isRegister && <label>Name<input autoComplete="name" maxLength="100" onChange={(event) => setName(event.target.value)} required value={name} /></label>}
        <label>Email address<input autoComplete="email" autoCapitalize="none" maxLength="254" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} /></label>
        <label>Password<input autoComplete={isRegister ? 'new-password' : 'current-password'} maxLength="72" minLength={isRegister ? 12 : undefined} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} /></label>
        {isRegister && <p className="password-hint">Use at least 12 characters.</p>}
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="button-primary auth-submit" disabled={submitting} type="submit">{submitting ? 'Please wait…' : isRegister ? 'Create account' : 'Log in'}</button>
      </form>
      <p className="auth-switch">{isRegister ? 'Already have an account?' : 'New to ShareSafe?'} <button type="button" onClick={() => onNavigate(isRegister ? 'Login' : 'Register')}>{isRegister ? 'Log in' : 'Create an account'}</button></p>
    </section>
  </main>
}

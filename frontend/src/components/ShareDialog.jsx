import { useState } from 'react'

export default function ShareDialog({ file, onClose, onCreate, onCopy }) {
  const [expiryDays, setExpiryDays] = useState('7')
  const [maxAccesses, setMaxAccesses] = useState('10')
  const [password, setPassword] = useState('')
  const [permission, setPermission] = useState('allowDownload')
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const create = async (event) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      setResult(await onCreate({ fileId: file.id, expiryDays: Number(expiryDays), maxAccesses: Number(maxAccesses), permission, ...(password ? { password } : {}) }))
    } catch (requestError) {
      setError(requestError.message || 'The sharing link could not be created.')
    } finally {
      setLoading(false)
    }
  }

  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="share-dialog content-card" role="dialog" aria-modal="true" aria-labelledby="share-dialog-title">
      <div className="section-heading"><div><h2 id="share-dialog-title">Share a file</h2><p>{file.name}</p></div><button className="dialog-close" type="button" onClick={onClose} aria-label="Close">×</button></div>
      {result ? <div className="share-created"><p>Your link is ready. Copy it now; ShareSafe only stores a secure hash of the link.</p><div className="share-url-row"><input aria-label="Sharing link" readOnly value={result.url} /><button className="button-primary" type="button" onClick={() => onCopy(result.url)}>Copy link</button></div><button className="theme-toggle" type="button" onClick={onClose}>Done</button></div> : <form className="share-form" onSubmit={create}>
        <label>Link expires after<select value={expiryDays} onChange={(event) => setExpiryDays(event.target.value)}><option value="1">1 day</option><option value="7">7 days</option><option value="14">14 days</option><option value="30">30 days</option></select></label>
        <label>Recipient permission<select value={permission} onChange={(event) => setPermission(event.target.value)}><option value="allowDownload">Allow Download</option><option value="viewOnly">View Only</option></select></label>
        <label>{permission === 'viewOnly' ? 'Maximum views' : 'Maximum downloads'}<input type="number" min="1" max="1000" required value={maxAccesses} onChange={(event) => setMaxAccesses(event.target.value)} /></label>
        <label>Link password (optional)<input autoComplete="new-password" minLength="8" maxLength="72" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" /></label>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <div className="dialog-actions"><button className="theme-toggle" type="button" onClick={onClose}>Cancel</button><button className="button-primary" disabled={loading} type="submit">{loading ? 'Creating…' : 'Create link'}</button></div>
      </form>}
    </section>
  </div>
}

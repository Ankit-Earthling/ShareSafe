import { useEffect, useState } from 'react'
import { sharesApi } from '../services/api.js'

export default function ShareHistoryDialog({ share, onClose }) {
  const [accesses, setAccesses] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    sharesApi.history(share.id)
      .then(({ accesses: result }) => { if (active) setAccesses(result) })
      .catch((requestError) => { if (active) setError(requestError.message || 'Download history could not be loaded.') })
    return () => { active = false }
  }, [share.id])

  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="share-dialog content-card" role="dialog" aria-modal="true" aria-labelledby="history-title">
      <div className="section-heading"><div><h2 id="history-title">Download history</h2><p>{share.name}</p></div><button className="dialog-close" type="button" onClick={onClose} aria-label="Close">×</button></div>
      <div className="history-body">
        {error ? <p className="auth-error" role="alert">{error}</p> : accesses === null ? <p className="public-share-copy">Loading history…</p> : accesses.length === 0 ? <p className="public-share-copy">No downloads yet.</p> : <ol>{accesses.map((event, index) => <li key={`${event.accessedAt}-${index}`}>{new Date(event.accessedAt).toLocaleString()}</li>)}</ol>}
      </div>
    </section>
  </div>
}

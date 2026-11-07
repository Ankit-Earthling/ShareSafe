import { useEffect, useState } from 'react'
import { filesApi } from '../services/api.js'

function formatSize(bytes) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function FileDetailsDialog({ file, onClose }) {
  const [details, setDetails] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    filesApi.get(file.id)
      .then(({ file: result }) => { if (active) setDetails(result) })
      .catch((requestError) => { if (active) setError(requestError.message || 'File details could not be loaded.') })
    return () => { active = false }
  }, [file.id])

  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="share-dialog content-card" role="dialog" aria-modal="true" aria-labelledby="file-details-title">
      <div className="section-heading"><div><h2 id="file-details-title">File details</h2><p>{file.name}</p></div><button className="dialog-close" type="button" onClick={onClose} aria-label="Close">×</button></div>
      <div className="file-details-body">
        {error ? <p className="auth-error" role="alert">{error}</p> : details ? <dl>
          <div><dt>File type</dt><dd>{details.type}</dd></div>
          <div><dt>File size</dt><dd>{formatSize(details.size)}</dd></div>
          <div><dt>Uploaded</dt><dd>{new Date(details.uploadedAt).toLocaleString()}</dd></div>
          <div><dt>Malware scan</dt><dd>{details.scanStatus || 'clean'}</dd></div>
        </dl> : <p className="public-share-copy">Loading file details…</p>}
      </div>
    </section>
  </div>
}

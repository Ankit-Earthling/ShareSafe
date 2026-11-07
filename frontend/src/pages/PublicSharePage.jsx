import { useEffect, useState } from 'react'
import Icon from '../components/Icon.jsx'
import { sharesApi } from '../services/api.js'

function formatSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function PublicSharePage({ token, theme }) {
  const [details, setDetails] = useState(null)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [previewUrl, setPreviewUrl] = useState('')
  const [watermark, setWatermark] = useState(null)

  useEffect(() => {
    let active = true
    sharesApi.publicDetails(token)
      .then((result) => { if (active) setDetails(result) })
      .catch((requestError) => { if (active) setError(requestError.message || 'This sharing link is unavailable.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [token])

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

  const download = async (event) => {
    event.preventDefault()
    setError('')
    setWorking(true)
    try {
      const blob = await sharesApi.access(token, password)
      const objectUrl = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = details.name
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
    } catch (requestError) {
      setError(requestError.message || 'This sharing link could not be opened.')
    } finally {
      setWorking(false)
    }
  }

  const preview = async (event) => {
    event.preventDefault()
    setError('')
    setWorking(true)
    try {
      const result = await sharesApi.preview(token, password)
      setWatermark(result.watermark)
      setPreviewUrl(URL.createObjectURL(result.blob))
    } catch (requestError) {
      setError(requestError.message || 'This sharing link could not be previewed.')
    } finally {
      setWorking(false)
    }
  }

  const isViewOnly = details?.permission === 'viewOnly'
  return <div className="app-shell auth-shell" data-theme={theme}>
    <main className="public-share-page">
      <a className="brand public-brand" href="/"><span className="brand-mark"><Icon name="shield" size={21} /></span><span>share<span className="brand-accent">safe</span></span></a>
      <section className="auth-card public-share-card">
        <div className="upload-icon"><Icon name="shield" size={27} /></div>
        {loading ? <><h1>Checking this link...</h1><p className="public-share-copy">Please wait while we check that it is still available.</p></>
          : details ? <>
            <h1>A file was shared with you</h1>
            {isViewOnly && <span className="view-only-badge">View Only</span>}
            <p className="public-share-name">{details.name}</p>
            <p className="public-share-copy">{formatSize(details.size)} &middot; Expires {new Date(details.expiresAt).toLocaleDateString()}</p>
            {isViewOnly ? <>
              <p className="public-share-copy">Downloads are disabled for this link. Screen capture cannot be completely prevented.</p>
              {!details.previewSupported && <p className="auth-error" role="status">Preview is not supported for this file type. This view-only link has no download option.</p>}
              {details.previewSupported && <form className="auth-form" onSubmit={preview}>
                {details.passwordRequired && <label>Link password<input autoComplete="off" onChange={(event) => setPassword(event.target.value)} required type="password" value={password} /></label>}
                {error && <p className="auth-error" role="alert">{error}</p>}
                {!previewUrl && <button className="button-primary auth-submit" disabled={working} type="submit">{working ? 'Opening preview...' : 'Preview file'}</button>}
              </form>}
              {previewUrl && <div className="pdf-preview-wrap"><iframe title={`View-only preview of ${details.name}`} src={`${previewUrl}#toolbar=0&navpanes=0`} /><div className="pdf-watermark" aria-label="Preview watermark">{watermark.viewer} &middot; Link {watermark.linkId} &middot; {new Date(watermark.accessedAt).toLocaleString()}</div></div>}
            </> : <form className="auth-form" onSubmit={download}>
              {details.passwordRequired && <label>Link password<input autoComplete="off" onChange={(event) => setPassword(event.target.value)} required type="password" value={password} /></label>}
              {error && <p className="auth-error" role="alert">{error}</p>}
              <button className="button-primary auth-submit" disabled={working} type="submit">{working ? 'Preparing download...' : 'Download file'}</button>
            </form>}
          </> : <><h1>Link unavailable</h1><p className="auth-error" role="alert">{error}</p></>}
      </section>
    </main>
  </div>
}

import Icon from './Icon.jsx'

export default function UploadSection({ onBrowse, onDrop, uploading }) {
  const handleDrop = (event) => {
    event.preventDefault()
    onDrop(Array.from(event.dataTransfer.files || []))
  }
  return <section className="upload-panel" aria-busy={uploading} onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
    <div className="upload-icon"><Icon name="cloud" size={28} /></div>
    <h2>Upload a file</h2>
    <p>Drag and drop a file here, or choose one from your device.</p>
    <button className="button-primary browse-button" type="button" disabled={uploading} onClick={onBrowse}><Icon name="upload" size={18} />{uploading ? 'Uploading…' : 'Browse files'}</button>
    <span className="upload-meta">PDF, PNG, JPEG, GIF, WebP, TXT or CSV · Up to 10 MB</span>
  </section>
}

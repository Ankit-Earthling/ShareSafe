export default function BackendStatus({ status }) {
  const details = {
    checking: ['checking', 'Checking backend connection…'],
    connected: ['connected', 'Backend connected'],
    unavailable: ['unavailable', 'Backend unavailable. Mock data is still available.'],
  }
  const [state, label] = details[status] || details.unavailable

  return <div className={`backend-status ${state}`} role="status" aria-live="polite">
    <span className="backend-status-dot" />{label}
  </div>
}

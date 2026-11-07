import { useCallback, useEffect, useRef, useState } from 'react'
import AuthPage from './pages/AuthPage.jsx'
import PublicSharePage from './pages/PublicSharePage.jsx'
import BackendStatus from './components/BackendStatus.jsx'
import DashboardHeader from './components/DashboardHeader.jsx'
import FileDetailsDialog from './components/FileDetailsDialog.jsx'
import OverviewCards from './components/OverviewCards.jsx'
import RecentFiles from './components/RecentFiles.jsx'
import RecentLinks from './components/RecentLinks.jsx'
import Sidebar from './components/Sidebar.jsx'
import ShareDialog from './components/ShareDialog.jsx'
import ShareHistoryDialog from './components/ShareHistoryDialog.jsx'
import UploadSection from './components/UploadSection.jsx'
import { useAuth } from './context/useAuth.js'
import { backendStatusFromHealth } from './services/backendAvailability.js'
import { filesApi, getHealth, sharesApi } from './services/api.js'
import { authRedirectForPage, pageFromPath, pagePaths } from './services/routing.js'
import './App.css'

const authPages = ['Login', 'Register']

function App() {
  const { user, loading: authLoading, login, register, logout } = useAuth()
  const [active, setActive] = useState(() => pageFromPath(window.location.pathname))
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('sharesafe-theme') === 'dark' ? 'dark' : 'light' }
    catch { return 'light' }
  })
  const [search, setSearch] = useState('')
  const [files, setFiles] = useState([])
  const [storage, setStorage] = useState(null)
  const [shareLinks, setShareLinks] = useState([])
  const [dataState, setDataState] = useState('loading')
  const [feedback, setFeedback] = useState('')
  const [backendStatus, setBackendStatus] = useState('checking')
  const [uploading, setUploading] = useState(false)
  const [sharingFile, setSharingFile] = useState(null)
  const [detailsFile, setDetailsFile] = useState(null)
  const [historyShare, setHistoryShare] = useState(null)
  const feedbackTimer = useRef(null)

  const navigate = useCallback((page, replace = false) => {
    const path = pagePaths[page]
    if (path && window.location.pathname !== path) {
      const method = replace ? 'replaceState' : 'pushState'
      window.history[method]({ page }, '', path)
    }
    setActive(page)
  }, [])

  const notify = (message) => {
    setFeedback(message)
    window.clearTimeout(feedbackTimer.current)
    feedbackTimer.current = window.setTimeout(() => setFeedback(''), 5000)
  }

  const openFilePicker = () => document.getElementById('file-picker')?.click()
  const normalizedSearch = search.trim().toLocaleLowerCase()
  const filteredFiles = files.filter((file) => `${file.name} ${file.type}`.toLocaleLowerCase().includes(normalizedSearch))
  const filteredLinks = shareLinks.filter((link) => `${link.name} ${link.status}`.toLocaleLowerCase().includes(normalizedSearch))

  useEffect(() => {
    const syncPage = () => setActive(pageFromPath(window.location.pathname))
    window.addEventListener('popstate', syncPage)
    return () => window.removeEventListener('popstate', syncPage)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try { localStorage.setItem('sharesafe-theme', theme) }
    catch { /* The selected theme still applies for this session when storage is blocked. */ }
  }, [theme])

  useEffect(() => () => window.clearTimeout(feedbackTimer.current), [])

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    const checkHealth = () => getHealth({ signal: controller.signal })
      .then((health) => { if (active) setBackendStatus(backendStatusFromHealth(health)) })
      .catch((error) => { if (active && error.name !== 'AbortError') setBackendStatus('unavailable') })
    void checkHealth()
    const retryTimer = window.setInterval(() => { void checkHealth() }, 30000)
    return () => { active = false; window.clearInterval(retryTimer); controller.abort() }
  }, [])

  useEffect(() => {
    if (authLoading) return
    // Auth restoration may change the URL and React page state together.
    const redirectPage = authRedirectForPage(active, user)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (redirectPage) navigate(redirectPage, true)
  }, [active, authLoading, navigate, user])

  useEffect(() => {
    if (!user) return
    let current = true
    Promise.all([filesApi.list(), sharesApi.list()])
      .then(([fileResult, shareResult]) => {
        if (current) {
          setFiles(fileResult.files)
          setStorage(fileResult.storage)
          setShareLinks(shareResult.shares)
          setDataState('ready')
        }
      })
      .catch(() => {
        if (current) {
          setDataState('error')
          notify('Could not load your files. Check the backend connection and refresh.')
        }
      })
    return () => { current = false }
  }, [active, user])

  const copyLink = async (url) => {
    try {
      await navigator.clipboard.writeText(url)
      notify('Sharing link copied.')
    } catch { notify(`Clipboard unavailable. Copy this link: ${url}`) }
  }

  const createShare = async (details) => {
    const result = await sharesApi.create(details)
    setShareLinks((current) => [{ ...result.share, url: result.url }, ...current])
    return result
  }

  const downloadFile = async (file) => {
    try {
      const blob = await filesApi.download(file.id)
      const objectUrl = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = file.name
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
      notify('Download started.')
    } catch (error) { notify(error.message || 'The file could not be downloaded.') }
  }

  const revokeLink = async (id) => {
    if (!window.confirm('Revoke this sharing link? Anyone with it will lose access.')) return
    try {
      const { share } = await sharesApi.revoke(id)
      setShareLinks((current) => current.map((item) => item.id === id ? { ...share, name: item.name } : item))
      notify('Sharing link revoked.')
    } catch (error) { notify(error.message || 'The link could not be revoked.') }
  }

  const handleUpload = async (selectedFiles) => {
    if (!selectedFiles.length || uploading) return
    setUploading(true)
    let uploaded = 0
    let uploadError = ''
    for (const file of selectedFiles) {
      try {
        const { file: savedFile, storage: nextStorage } = await filesApi.upload(file)
        setFiles((current) => [savedFile, ...current.filter((item) => item.id !== savedFile.id)])
        setStorage(nextStorage)
        uploaded += 1
      } catch (error) {
        const latest = await filesApi.list().catch(() => null)
        if (latest) { setFiles(latest.files); setStorage(latest.storage) }
        uploadError = error.message || `Could not upload ${file.name}.`
        break
      }
    }
    setUploading(false)
    if (uploadError) notify(uploaded ? `${uploaded} uploaded. ${uploadError}` : uploadError)
    else if (uploaded) notify(`${uploaded} file${uploaded === 1 ? '' : 's'} uploaded.`)
  }

  const handleFilesSelected = (event) => {
    void handleUpload(Array.from(event.target.files || []))
    event.target.value = ''
  }

  const deleteFile = async (file) => {
    if (!window.confirm(`Delete “${file.name}”? Its sharing links will also stop working.`)) return
    try {
      const result = await filesApi.delete(file.id)
      setFiles((current) => current.filter((item) => item.id !== file.id))
      setStorage(result.storage)
      setShareLinks((current) => current.filter((item) => item.fileId !== file.id))
      notify('File deleted from your account.')
    } catch (error) { notify(error.message || 'The file could not be deleted.') }
  }

  const handleLogout = async () => {
    try { await logout(); navigate('Login', true) }
    catch { notify('Could not log out. Check your connection and try again.') }
  }

  const toggleTheme = () => setTheme((current) => current === 'light' ? 'dark' : 'light')

  if (active === 'Public Share') {
    return <PublicSharePage token={window.location.pathname.split('/').pop()} theme={theme} />
  }

  if (authLoading) {
    return <div className="app-shell auth-loading" data-theme={theme}><p>Checking your account…</p></div>
  }

  if (active === 'Not Found') {
    return <div className="app-shell auth-shell" data-theme={theme}>
      <main className="auth-page"><section className="auth-card">
        <div className="auth-heading"><h1>Page not found</h1><p>This ShareSafe page does not exist.</p></div>
        <button className="button-primary auth-submit" type="button" onClick={() => navigate(user ? 'Dashboard' : 'Login')}>Go to ShareSafe</button>
      </section></main>
    </div>
  }

  if (!user || authPages.includes(active)) {
    const mode = user ? 'Login' : active === 'Register' ? 'Register' : 'Login'
    return <div className="app-shell auth-shell" data-theme={theme}>
      <AuthPage mode={mode} theme={theme} onToggleTheme={toggleTheme} onNavigate={navigate} onLogin={login} onRegister={register} />
    </div>
  }

  return <div className="app-shell" data-theme={theme}>
    <Sidebar active={active} onNavigate={navigate} user={user} onLogout={handleLogout} />
    <main className="main-area">
      <DashboardHeader title={active} search={search} onSearch={setSearch} onUpload={openFilePicker} theme={theme} onToggleTheme={toggleTheme} />
      <input id="file-picker" className="visually-hidden" type="file" accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.txt,.csv" multiple onChange={handleFilesSelected} />
      <div className="dashboard-content">
        {active === 'Dashboard' && <>
          <div className="welcome-row"><div><h1>Welcome back, {user.name}</h1><p>Your files, all in one place.</p></div><BackendStatus status={backendStatus} /></div>
          <OverviewCards files={files} shares={shareLinks} storage={storage} />
          <UploadSection onBrowse={openFilePicker} onDrop={handleUpload} uploading={uploading} />
          <div className="tables-grid">
            <RecentFiles files={filteredFiles.slice(0, 4)} loading={dataState === 'loading'} onShare={setSharingFile} onDownload={downloadFile} onDelete={deleteFile} onDetails={setDetailsFile} onViewAll={() => navigate('My Files')} />
            <RecentLinks links={filteredLinks.slice(0, 3)} loading={dataState === 'loading'} onViewAll={() => navigate('Shared Links')} onCopy={(link) => copyLink(link.url)} onHistory={setHistoryShare} onRevoke={revokeLink} />
          </div>
        </>}
        {active === 'My Files' && <div className="tables-grid page-view"><RecentFiles files={filteredFiles} loading={dataState === 'loading'} onShare={setSharingFile} onDownload={downloadFile} onDelete={deleteFile} onDetails={setDetailsFile} showViewAll={false} /></div>}
        {active === 'Shared Links' && <div className="tables-grid page-view"><RecentLinks links={filteredLinks} loading={dataState === 'loading'} onCopy={(link) => copyLink(link.url)} onHistory={setHistoryShare} onRevoke={revokeLink} showViewAll={false} /></div>}
        {active === 'Settings' && <div className="settings-page">
          <section className="content-card appearance-card">
            <div><h2>Appearance</h2><p>Choose how ShareSafe looks on this device.</p></div>
            <button className="theme-toggle" type="button" onClick={toggleTheme}>{theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}</button>
          </section>
          <section className="content-card settings-connection"><h2>Backend connection</h2><BackendStatus status={backendStatus} /></section>
        </div>}
      </div>
    </main>
    {sharingFile && <ShareDialog file={sharingFile} onClose={() => setSharingFile(null)} onCreate={createShare} onCopy={copyLink} />}
    {detailsFile && <FileDetailsDialog file={detailsFile} onClose={() => setDetailsFile(null)} />}
    {historyShare && <ShareHistoryDialog share={historyShare} onClose={() => setHistoryShare(null)} />}
    {feedback && <div className="action-feedback" role="status" aria-live="polite">{feedback}</div>}
  </div>
}

export default App

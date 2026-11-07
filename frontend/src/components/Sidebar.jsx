import Icon from './Icon.jsx'

export default function Sidebar({ active, onNavigate, user, onLogout }) {
  const navItems = [
    { label: 'Dashboard', icon: 'grid' },
    { label: 'My Files', icon: 'folder' },
    { label: 'Shared Links', icon: 'link' },
  ]

  return <aside className="sidebar">
    <a className="brand" href="/" onClick={(event) => { event.preventDefault(); onNavigate('Dashboard') }}>
      <span className="brand-mark"><Icon name="shield" size={21} /></span>
      <span>share<span className="brand-accent">safe</span></span>
    </a>
    <nav className="main-nav" aria-label="Main navigation">
      {navItems.map((item) => <button key={item.label} type="button" aria-label={item.label} aria-current={active === item.label ? 'page' : undefined} className={`nav-item ${active === item.label ? 'selected' : ''}`} onClick={() => onNavigate(item.label)}>
        <Icon name={item.icon} size={20} /><span>{item.label}</span>
      </button>)}
    </nav>
    <div className="sidebar-bottom">
      <button type="button" aria-label="Settings" aria-current={active === 'Settings' ? 'page' : undefined} className={`nav-item ${active === 'Settings' ? 'selected' : ''}`} onClick={() => onNavigate('Settings')}>
        <Icon name="settings" size={20} /><span>Settings</span>
      </button>
      <div className="profile">
        <div className="avatar">{(user?.name || user?.email || 'U').slice(0, 1).toUpperCase()}</div>
        <div className="profile-info"><strong>{user?.name || user?.email}</strong></div>
        <button type="button" className="logout-button" onClick={onLogout} aria-label="Log out"><Icon name="logout" size={19} /><span>Log out</span></button>
      </div>
    </div>
  </aside>
}

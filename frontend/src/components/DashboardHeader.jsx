import Icon from './Icon.jsx'

export default function DashboardHeader({ title, search, onSearch, onUpload, theme, onToggleTheme }) {
  const nextTheme = theme === 'light' ? 'dark' : 'light'

  return <header className="topbar">
    <div className="header-title">{title}</div>
    <div className="header-actions">
      <label className="search-box"><Icon name="search" size={19} /><input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search your files" aria-label="Search your files" /></label>
      <button className="theme-toggle" type="button" onClick={onToggleTheme} aria-label={`Switch to ${nextTheme} theme`}>
        <Icon name={theme === 'light' ? 'moon' : 'sun'} size={19} /><span>{theme === 'light' ? 'Dark' : 'Light'}</span>
      </button>
      <button className="button-primary" type="button" onClick={onUpload}><Icon name="upload" size={18} />Upload files</button>
    </div>
  </header>
}

export default function RecentLinks({ links, loading, onViewAll, onCopy, onHistory, onRevoke, showViewAll = true }) {
  return <section className="content-card links-card">
    <div className="section-heading"><div><h2>Recent sharing links</h2><p>Copy, review, or revoke your links.</p></div>{showViewAll && <button className="view-all" type="button" onClick={onViewAll}>View all</button>}</div>
    <div className="table-wrap"><table><thead><tr><th>File name</th><th>Expires</th><th>Downloads</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>{links.length === 0 ? <tr><td colSpan="5" className="empty-state">{loading ? 'Loading your links…' : 'No sharing links yet.'}</td></tr> : links.map((link) => <tr key={link.id}>
        <td><div className="link-file"><span className="file-type">FILE</span><strong>{link.name}</strong></div></td>
        <td className="muted-cell">{new Date(link.expiresAt).toLocaleDateString()}</td>
        <td className="muted-cell">{link.accessCount} of {link.maxAccesses}</td>
        <td><span className={`status-pill ${link.status === 'Active' ? 'shared' : 'reached'}`}>{link.status}</span></td>
        <td><div className="link-actions"><button type="button" className="table-action" disabled={!link.url || link.status !== 'Active'} onClick={() => onCopy(link)}>{link.url && link.status === 'Active' ? 'Copy link' : 'Unavailable'}</button><button type="button" className="table-action" onClick={() => onHistory?.(link)}>History</button><button type="button" className="table-action revoke-action" disabled={link.status !== 'Active'} onClick={() => onRevoke(link.id)}>{link.status === 'Active' ? 'Revoke' : link.status}</button></div></td>
      </tr>)}</tbody>
    </table></div>
  </section>
}

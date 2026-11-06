function displaySize(bytes) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fileType(file) {
  const extension = file.name?.split('.').pop()?.toUpperCase() || 'FILE'
  return ['PDF', 'PNG', 'JPG', 'JPEG', 'GIF', 'WEBP', 'TXT', 'CSV'].includes(extension) ? extension : 'FILE'
}

export default function RecentFiles({ files, loading, onViewAll, onShare, onDownload, onDelete, onDetails, showViewAll = true }) {
  return <section className="content-card">
    <div className="section-heading"><div><h2>Recent files</h2><p>Your latest uploads</p></div>{showViewAll && <button className="view-all" type="button" onClick={onViewAll}>View all</button>}</div>
    <div className="table-wrap"><table><thead><tr><th>File name</th><th>Size</th><th>Date added</th><th>Actions</th></tr></thead>
      <tbody>{files.length === 0 ? <tr><td colSpan="4" className="empty-state">{loading ? 'Loading your files…' : 'No files yet. Upload one to get started.'}</td></tr> : files.map((file) => <tr key={file.id}>
        <td><div className="file-name"><span className="file-type">{fileType(file)}</span><button type="button" className="file-details-button" onClick={() => onDetails?.(file)}>{file.name}</button></div></td>
        <td className="muted-cell">{displaySize(file.size)}</td><td className="muted-cell">{new Date(file.uploadedAt).toLocaleDateString()}</td>
        <td><div className="link-actions"><button type="button" className="table-action" onClick={() => onShare?.(file)}>Share</button><button type="button" className="table-action" onClick={() => onDownload?.(file)}>Download</button><button type="button" className="table-action revoke-action" onClick={() => onDelete?.(file)}>Delete</button></div></td>
      </tr>)}</tbody>
    </table></div>
  </section>
}

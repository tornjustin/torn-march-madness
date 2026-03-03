import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  getSeedingData, importContenders, createContender, updateContender,
  deleteContender, uploadContenderImage, scrapeImages, selectTopContenders,
  toggleContenderSelected,
} from '../../api';

const TYPES = ['Media', 'Misc', 'Statue', 'Replica', 'Toys & Games', 'Books', 'Bust/Environmt'];
const AGES = ['1st', '2nd', '3rd', '4th'];

export default function SeedingContendersTab({ token }) {
  const [seeding, setSeeding] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterAge, setFilterAge] = useState('');
  const [filterSelected, setFilterSelected] = useState('');

  // Import state
  const [importText, setImportText] = useState('');
  const [importPreview, setImportPreview] = useState(null);
  const [importing, setImporting] = useState(false);

  // Edit state
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', type: '', age: '', description: '', link: '' });
  const [saving, setSaving] = useState(false);

  // Add state
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', type: TYPES[0], age: AGES[0], description: '', link: '' });

  // Scraping
  const [scraping, setScraping] = useState(false);
  const [scrapeResults, setScrapeResults] = useState(null);

  // Image upload refs
  const fileRefs = useRef({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getSeedingData(token);
      setSeeding(data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  function flash(text, isError) {
    setMsg(isError ? text : text);
    setTimeout(() => setMsg(''), 4000);
  }

  // ─── Import CSV ─────────────────────────────────────────────────────────────
  function parseCSV(text) {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return [];
    // Detect header
    const header = lines[0].split('\t').length > 1 ? lines[0].split('\t') : lines[0].split(',');
    const nameIdx = header.findIndex(h => /collectible|name/i.test(h.trim()));
    const typeIdx = header.findIndex(h => /^type$/i.test(h.trim()));
    const ageIdx = header.findIndex(h => /^age$/i.test(h.trim()));
    const linkIdx = header.findIndex(h => /link|url/i.test(h.trim()));

    const items = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[0].split('\t').length > 1 ? lines[i].split('\t') : lines[i].split(',');
      const name = (cols[nameIdx] || '').trim();
      if (!name) continue;
      items.push({
        name,
        type: (cols[typeIdx] || '').trim() || 'Misc',
        age: (cols[ageIdx] || '').trim() || '',
        link: (cols[linkIdx] || '').trim() || '',
      });
    }
    return items;
  }

  function handlePreviewImport() {
    const items = parseCSV(importText);
    if (items.length === 0) {
      flash('No valid rows found. Paste tab or comma-separated data with header row.', true);
      return;
    }
    setImportPreview(items);
  }

  async function handleImport() {
    if (!importPreview || importPreview.length === 0) return;
    setImporting(true);
    try {
      const result = await importContenders(importPreview, token);
      flash(`Imported ${result.imported} contenders${result.skipped ? ` (${result.skipped} duplicates skipped)` : ''}`);
      setImportText('');
      setImportPreview(null);
      load();
    } catch (e) {
      flash('Import error: ' + (e.error || e.message), true);
    } finally {
      setImporting(false);
    }
  }

  // ─── CRUD ───────────────────────────────────────────────────────────────────
  async function handleAdd(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await createContender(addForm, token);
      flash('Contender added!');
      setAddForm({ name: '', type: TYPES[0], age: AGES[0], description: '', link: '' });
      setShowAdd(false);
      load();
    } catch (e) {
      flash('Error: ' + (e.error || e.message), true);
    } finally { setSaving(false); }
  }

  function startEdit(c) {
    setEditId(c.id);
    setEditForm({ name: c.name, type: c.type, age: c.age || '', description: c.description || '', link: c.link || '' });
  }

  async function handleUpdate(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await updateContender(editId, editForm, token);
      flash('Updated!');
      setEditId(null);
      load();
    } catch (e) {
      flash('Error: ' + (e.error || e.message), true);
    } finally { setSaving(false); }
  }

  async function handleDelete(id, name) {
    if (!confirm(`Delete "${name}"?`)) return;
    try {
      await deleteContender(id, token);
      flash('Deleted');
      load();
    } catch (e) { flash('Delete failed', true); }
  }

  async function handleToggleSelected(id, currentSelected) {
    try {
      await toggleContenderSelected(id, !currentSelected, token);
      load();
    } catch (e) { flash('Toggle failed', true); }
  }

  async function handleSelectTop(n) {
    if (!confirm(`Select the top ${n} contenders by total points?`)) return;
    try {
      await selectTopContenders(n, token);
      flash(`Top ${n} selected`);
      load();
    } catch (e) { flash('Error: ' + (e.error || e.message), true); }
  }

  // ─── Image ──────────────────────────────────────────────────────────────────
  async function handleImageUpload(contenderId, file) {
    try {
      await uploadContenderImage(contenderId, file, token);
      flash('Image uploaded');
      load();
    } catch (e) { flash('Upload failed', true); }
  }

  async function handleScrape() {
    const noImage = (seeding?.contenders || []).filter(c => !c.image && c.link);
    if (noImage.length === 0) {
      flash('All contenders with links already have images', true);
      return;
    }
    if (!confirm(`Scrape images for ${noImage.length} contenders without images?`)) return;
    setScraping(true);
    setScrapeResults(null);
    try {
      const result = await scrapeImages(noImage.map(c => c.id), token);
      setScrapeResults(result);
      flash(`Scraped: ${result.success || 0} succeeded, ${result.failed || 0} failed`);
      load();
    } catch (e) {
      flash('Scrape error: ' + (e.error || e.message), true);
    } finally { setScraping(false); }
  }

  // ─── Filter & render ────────────────────────────────────────────────────────
  if (loading || !seeding) {
    return <div style={{ color: 'var(--text-muted)', padding: 20 }}>Loading contenders...</div>;
  }

  const contenders = seeding.contenders || [];
  const filtered = contenders.filter(c => {
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterType && c.type !== filterType) return false;
    if (filterAge && c.age !== filterAge) return false;
    if (filterSelected === 'yes' && !c.selected) return false;
    if (filterSelected === 'no' && c.selected) return false;
    return true;
  });

  const selectedCount = contenders.filter(c => c.selected).length;
  const withImages = contenders.filter(c => c.image).length;

  return (
    <div>
      <div className="admin-section-header">
        <h2>Contenders <span className="admin-count">{contenders.length} total, {selectedCount} selected, {withImages} with images</span></h2>
      </div>

      {msg && <div className={msg.startsWith('Error') || msg.startsWith('Import error') || msg.startsWith('Delete') || msg.startsWith('Scrape error') || msg.includes('failed') ? 'error-msg' : 'success-msg'} style={{ marginBottom: 12 }}>{msg}</div>}

      {/* Import section */}
      <div className="card card-gold" style={{ marginBottom: 20 }}>
        <h3 className="card-section-title">Import Contenders</h3>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: 10 }}>
          Paste tab-separated or comma-separated data with headers: Collectible, Type, Age, Link
        </p>
        <textarea
          className="form-input"
          rows={4}
          placeholder="Collectible&#9;Type&#9;Age&#9;Link&#10;Narsil Replica&#9;Replica&#9;2nd&#9;https://..."
          value={importText}
          onChange={e => { setImportText(e.target.value); setImportPreview(null); }}
          style={{ fontFamily: 'monospace', fontSize: '0.78rem', marginBottom: 10 }}
        />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn btn-outline" onClick={handlePreviewImport} disabled={!importText.trim()}>Preview</button>
          {importPreview && (
            <button className="btn btn-gold" onClick={handleImport} disabled={importing}>
              {importing ? 'Importing...' : `Import ${importPreview.length} Contenders`}
            </button>
          )}
        </div>

        {importPreview && (
          <div style={{ marginTop: 12, maxHeight: 240, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
            <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg-dark)', position: 'sticky', top: 0 }}>
                  <th style={thStyle}>#</th>
                  <th style={thStyle}>Name</th>
                  <th style={thStyle}>Type</th>
                  <th style={thStyle}>Age</th>
                  <th style={thStyle}>Link</th>
                </tr>
              </thead>
              <tbody>
                {importPreview.map((item, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={tdStyle}>{i + 1}</td>
                    <td style={tdStyle}>{item.name}</td>
                    <td style={tdStyle}>{item.type}</td>
                    <td style={tdStyle}>{item.age}</td>
                    <td style={{ ...tdStyle, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.link ? <a href={item.link} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--gold-dim)' }}>Link</a> : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Actions row */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn btn-outline" onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? 'Cancel Add' : '+ Add Contender'}
        </button>
        <button className="btn btn-outline" onClick={handleScrape} disabled={scraping}>
          {scraping ? 'Scraping...' : 'Scrape Missing Images'}
        </button>
        <button className="btn btn-outline" onClick={() => handleSelectTop(64)}>Select Top 64</button>
      </div>

      {scrapeResults && (
        <div className="dashboard-tip" style={{ marginBottom: 16 }}>
          Scrape complete: {scrapeResults.success || 0} images found, {scrapeResults.failed || 0} failed.
          {scrapeResults.errors?.length > 0 && (
            <details style={{ marginTop: 6 }}>
              <summary style={{ cursor: 'pointer', color: 'var(--text-muted)' }}>Show failures</summary>
              <ul style={{ margin: '6px 0', paddingLeft: 20, fontSize: '0.75rem' }}>
                {scrapeResults.errors.map((e, i) => <li key={i}>{e.name}: {e.error}</li>)}
              </ul>
            </details>
          )}
        </div>
      )}

      {/* Add form */}
      {showAdd && (
        <div className="card card-gold" style={{ marginBottom: 16 }}>
          <h3 className="card-section-title">New Contender</h3>
          <form onSubmit={handleAdd}>
            <div className="form-row">
              <div className="form-group" style={{ flex: 2 }}>
                <label className="form-label">Name *</label>
                <input className="form-input" value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} required />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Type</label>
                <select className="form-select" value={addForm.type} onChange={e => setAddForm(f => ({ ...f, type: e.target.value }))}>
                  {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Age</label>
                <select className="form-select" value={addForm.age} onChange={e => setAddForm(f => ({ ...f, age: e.target.value }))}>
                  <option value="">—</option>
                  {AGES.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Link (URL)</label>
                <input className="form-input" value={addForm.link} onChange={e => setAddForm(f => ({ ...f, link: e.target.value }))} placeholder="https://..." />
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn btn-gold" disabled={saving}>{saving ? 'Adding...' : 'Add Contender'}</button>
            </div>
          </form>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          className="form-input"
          placeholder="Search by name..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ maxWidth: 240 }}
        />
        <select className="form-select" value={filterType} onChange={e => setFilterType(e.target.value)} style={{ maxWidth: 160 }}>
          <option value="">All Types</option>
          {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className="form-select" value={filterAge} onChange={e => setFilterAge(e.target.value)} style={{ maxWidth: 100 }}>
          <option value="">All Ages</option>
          {AGES.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select className="form-select" value={filterSelected} onChange={e => setFilterSelected(e.target.value)} style={{ maxWidth: 130 }}>
          <option value="">All</option>
          <option value="yes">Selected</option>
          <option value="no">Not Selected</option>
        </select>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{filtered.length} shown</span>
      </div>

      {/* Contender grid */}
      <div className="contender-grid">
        {filtered.map(c => (
          <div key={c.id} className={`contender-card ${c.selected ? 'is-selected' : ''}`}>
            {/* Image */}
            <div className="contender-card-img" onClick={() => fileRefs.current[c.id]?.click()}>
              {c.image
                ? <img src={c.image} alt={c.name} />
                : <div className="contender-card-img-placeholder">?</div>
              }
              <div className="contender-card-img-overlay">Upload</div>
              <input
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                ref={el => fileRefs.current[c.id] = el}
                onChange={e => e.target.files[0] && handleImageUpload(c.id, e.target.files[0])}
              />
            </div>

            {/* Info */}
            <div className="contender-card-info">
              {editId === c.id ? (
                <form onSubmit={handleUpdate} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <input className="form-input" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} style={{ fontSize: '0.78rem' }} />
                  <div style={{ display: 'flex', gap: 4 }}>
                    <select className="form-select" value={editForm.type} onChange={e => setEditForm(f => ({ ...f, type: e.target.value }))} style={{ fontSize: '0.72rem', flex: 1 }}>
                      {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <select className="form-select" value={editForm.age} onChange={e => setEditForm(f => ({ ...f, age: e.target.value }))} style={{ fontSize: '0.72rem', flex: 1 }}>
                      <option value="">—</option>
                      {AGES.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </div>
                  <input className="form-input" value={editForm.link} onChange={e => setEditForm(f => ({ ...f, link: e.target.value }))} placeholder="Link URL" style={{ fontSize: '0.72rem' }} />
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button type="submit" className="btn btn-gold" style={{ fontSize: '0.68rem', padding: '3px 8px' }} disabled={saving}>Save</button>
                    <button type="button" className="btn btn-ghost" style={{ fontSize: '0.68rem', padding: '3px 8px' }} onClick={() => setEditId(null)}>Cancel</button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="contender-card-name">{c.name}</div>
                  <div className="contender-card-meta">
                    <span className="type-badge">{c.type}</span>
                    {c.age && <span className="age-badge">{c.age}</span>}
                  </div>
                  {c.totalPoints > 0 && (
                    <div style={{ fontSize: '0.7rem', color: 'var(--gold-dim)', marginTop: 2 }}>
                      {c.totalPoints} pts {c.rank ? `#${c.rank}` : ''}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Actions */}
            {editId !== c.id && (
              <div className="contender-card-actions">
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: '0.7rem', color: c.selected ? 'var(--gold)' : 'var(--text-muted)' }}>
                  <input type="checkbox" checked={c.selected || false} onChange={() => handleToggleSelected(c.id, c.selected)} />
                  Sel
                </label>
                <button className="btn btn-ghost" style={{ fontSize: '0.68rem', padding: '2px 6px' }} onClick={() => startEdit(c)}>Edit</button>
                {c.link && (
                  <a href={c.link} target="_blank" rel="noopener noreferrer" className="btn btn-ghost" style={{ fontSize: '0.68rem', padding: '2px 6px', textDecoration: 'none' }}>Link</a>
                )}
                <button className="btn btn-ghost" style={{ fontSize: '0.68rem', padding: '2px 6px', color: '#c05050' }} onClick={() => handleDelete(c.id, c.name)}>Del</button>
              </div>
            )}
          </div>
        ))}
      </div>

      <style>{`
        .contender-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
          gap: 10px;
        }
        .contender-card {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          overflow: hidden;
          display: flex;
          flex-direction: column;
          transition: border-color 0.15s;
        }
        .contender-card.is-selected {
          border-color: var(--gold-dim);
          box-shadow: 0 0 0 1px rgba(201,162,39,0.15);
        }
        .contender-card-img {
          width: 100%;
          aspect-ratio: 1;
          background: var(--bg-mid);
          overflow: hidden;
          position: relative;
          cursor: pointer;
        }
        .contender-card-img img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center;
          transition: transform 0.3s;
        }
        .contender-card-img:hover img { transform: scale(1.04); }
        .contender-card-img-placeholder {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 2rem;
          color: var(--text-muted);
        }
        .contender-card-img-overlay {
          position: absolute;
          inset: 0;
          background: rgba(0,0,0,0.55);
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: var(--font-heading);
          font-size: 0.65rem;
          color: rgba(255,255,255,0.7);
          letter-spacing: 0.1em;
          text-transform: uppercase;
          opacity: 0;
          transition: opacity 0.18s;
        }
        .contender-card-img:hover .contender-card-img-overlay { opacity: 1; }
        .contender-card-info { padding: 8px 10px; flex: 1; }
        .contender-card-name {
          font-family: var(--font-heading);
          font-size: 0.78rem;
          color: var(--text);
          margin-bottom: 3px;
          line-height: 1.2;
        }
        .contender-card-meta {
          display: flex;
          gap: 4px;
          flex-wrap: wrap;
        }
        .type-badge, .age-badge {
          font-size: 0.6rem;
          padding: 1px 5px;
          border-radius: 3px;
          font-family: var(--font-heading);
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }
        .type-badge {
          background: rgba(201,162,39,0.1);
          color: var(--gold-dim);
          border: 1px solid rgba(201,162,39,0.2);
        }
        .age-badge {
          background: rgba(255,255,255,0.05);
          color: var(--text-muted);
          border: 1px solid var(--border);
        }
        .contender-card-actions {
          display: flex;
          gap: 4px;
          padding: 6px 10px;
          border-top: 1px solid var(--border);
          background: var(--bg-dark);
          align-items: center;
          flex-wrap: wrap;
        }
      `}</style>
    </div>
  );
}

const thStyle = {
  padding: '6px 8px',
  textAlign: 'left',
  fontFamily: 'var(--font-heading)',
  fontSize: '0.68rem',
  color: 'var(--text-muted)',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  borderBottom: '1px solid var(--border)',
};

const tdStyle = {
  padding: '5px 8px',
  color: 'var(--text)',
};

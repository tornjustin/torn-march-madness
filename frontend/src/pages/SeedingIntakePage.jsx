import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import StaffLogin from '../components/StaffLogin';
import { getStaffMe, getStaffContenders, checkDuplicate, submitContender, getSeedingStatus } from '../api';

const TYPES = ['Media', 'Misc', 'Statue', 'Replica', 'Toys & Games', 'Books', 'Bust/Environmt'];

export default function SeedingIntakePage() {
  const [staff, setStaff] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  // Check existing session
  useEffect(() => {
    const token = sessionStorage.getItem('memm_staff_token');
    if (token) {
      getStaffMe()
        .then(s => setStaff(s))
        .catch(() => sessionStorage.removeItem('memm_staff_token'))
        .finally(() => setAuthChecked(true));
    } else {
      setAuthChecked(true);
    }
  }, []);

  function handleLogin(result) {
    setStaff(result.staff || result);
  }

  if (!authChecked) {
    return <div className="loading-wrap"><div className="loading-ring" /><span>Checking session...</span></div>;
  }

  if (!staff) {
    return <StaffLogin onLogin={handleLogin} />;
  }

  return <IntakeContent staff={staff} onLogout={() => { sessionStorage.removeItem('memm_staff_token'); setStaff(null); }} />;
}

function IntakeContent({ staff, onLogout }) {
  const [contenders, setContenders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [seedingStatus, setSeedingStatus] = useState(null);

  // Form state
  const [name, setName] = useState('');
  const [type, setType] = useState(TYPES[0]);
  const [description, setDescription] = useState('');
  const [link, setLink] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState('');

  // Duplicate checking
  const [dupWarning, setDupWarning] = useState(null);
  const [dupChecking, setDupChecking] = useState(false);
  const dupTimer = useRef(null);

  // Filters
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, s] = await Promise.all([getStaffContenders(), getSeedingStatus()]);
      setContenders(c.contenders || c);
      setSeedingStatus(s);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Debounced duplicate check as user types name
  useEffect(() => {
    if (dupTimer.current) clearTimeout(dupTimer.current);
    if (name.trim().length < 3) {
      setDupWarning(null);
      return;
    }
    dupTimer.current = setTimeout(async () => {
      setDupChecking(true);
      try {
        const result = await checkDuplicate(name.trim());
        if (result.matches && result.matches.length > 0) {
          setDupWarning(result.matches);
        } else {
          setDupWarning(null);
        }
      } catch {
        setDupWarning(null);
      } finally {
        setDupChecking(false);
      }
    }, 400);
    return () => clearTimeout(dupTimer.current);
  }, [name]);

  async function handleSubmit(e, force = false) {
    e?.preventDefault();
    if (!name.trim()) return;

    setSubmitting(true);
    setMsg('');
    try {
      await submitContender({ name: name.trim(), type, description, link, force });
      setMsg('Contender submitted!');
      setName('');
      setType(TYPES[0]);
      setDescription('');
      setLink('');
      setDupWarning(null);
      load();
    } catch (e) {
      if (e.duplicates) {
        setDupWarning(e.duplicates);
        setMsg('');
      } else {
        setMsg('Error: ' + (e.error || e.message));
      }
    } finally {
      setSubmitting(false);
    }
  }

  const isOpen = seedingStatus?.intake?.status === 'open';
  const isClosed = seedingStatus?.intake?.status === 'closed';

  const filtered = contenders.filter(c => {
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterType && c.type !== filterType) return false;
    return true;
  });

  const mySubmissions = contenders.filter(c => c.submittedBy === staff.email);

  return (
    <div className="page intake-page">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: 4 }}>Contender Intake</h1>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            Signed in as <strong style={{ color: 'var(--gold-dim)' }}>{staff.email}</strong>
            {' '}&middot;{' '}
            <Link to="/seeding/ballot" style={{ color: 'var(--gold-dim)', fontSize: '0.78rem' }}>Go to Ballot</Link>
          </p>
        </div>
        <button className="btn btn-ghost" style={{ fontSize: '0.75rem' }} onClick={onLogout}>Sign Out</button>
      </div>

      {/* Status banner */}
      {!isOpen && (
        <div className="status-banner" style={{
          background: isClosed ? 'rgba(192,80,80,0.1)' : 'rgba(201,162,39,0.1)',
          borderColor: isClosed ? '#c05050' : 'var(--border-gold)',
          color: isClosed ? '#c05050' : 'var(--gold)',
        }}>
          {isClosed
            ? 'Contender intake is now closed. Thanks for your submissions!'
            : 'Contender intake has not opened yet. Check back soon!'
          }
        </div>
      )}

      {/* Submit form */}
      {isOpen && (
        <div className="card card-gold" style={{ marginBottom: 24 }}>
          <h3 className="card-section-title">Submit a Contender</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group" style={{ flex: 2 }}>
                <label className="form-label">Name *</label>
                <input
                  className="form-input"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Narsil Replica by United Cutlery"
                  required
                />
                {dupChecking && <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Checking for duplicates...</span>}
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Type</label>
                <select className="form-select" value={type} onChange={e => setType(e.target.value)}>
                  {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Link (product URL)</label>
                <input className="form-input" value={link} onChange={e => setLink(e.target.value)} placeholder="https://..." />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Description (optional)</label>
              <input className="form-input" value={description} onChange={e => setDescription(e.target.value)} placeholder="Short note about this item..." />
            </div>

            {/* Duplicate warning */}
            {dupWarning && dupWarning.length > 0 && (
              <div className="dup-warning">
                <strong>Possible duplicates found:</strong>
                <ul style={{ margin: '6px 0', paddingLeft: 20 }}>
                  {dupWarning.map((d, i) => (
                    <li key={i}>
                      <strong>{d.name}</strong>
                      <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>({Math.round(d.similarity * 100)}% match)</span>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ fontSize: '0.75rem', marginTop: 4 }}
                  onClick={() => handleSubmit(null, true)}
                  disabled={submitting}
                >
                  Submit Anyway
                </button>
              </div>
            )}

            {msg && <div className={msg.startsWith('Error') ? 'error-msg' : 'success-msg'} style={{ marginTop: 8 }}>{msg}</div>}

            <div className="form-actions">
              <button type="submit" className="btn btn-gold" disabled={submitting || !name.trim()}>
                {submitting ? 'Submitting...' : 'Submit Contender'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* My submissions */}
      {mySubmissions.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.9rem', color: 'var(--gold-dim)', letterSpacing: '0.08em', marginBottom: 8 }}>
            Your Submissions ({mySubmissions.length})
          </h3>
          <div className="intake-mini-list">
            {mySubmissions.map(c => (
              <div key={c.id} className="intake-mini-item mine">
                {c.image && <img src={c.image} alt="" className="intake-mini-img" />}
                <div>
                  <div className="intake-mini-name">{c.name}</div>
                  <span className="intake-type-badge">{c.type}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All contenders */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.9rem', color: 'var(--text)', letterSpacing: '0.08em' }}>
            All Contenders ({contenders.length})
          </h3>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <input
            className="form-input"
            placeholder="Search..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ maxWidth: 220 }}
          />
          <select className="form-select" value={filterType} onChange={e => setFilterType(e.target.value)} style={{ maxWidth: 150 }}>
            <option value="">All Types</option>
            {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', alignSelf: 'center' }}>{filtered.length} shown</span>
        </div>

        {loading ? (
          <div className="loading-wrap"><div className="loading-ring" /><span>Loading...</span></div>
        ) : (
          <div className="intake-list">
            {filtered.map(c => (
              <div key={c.id} className={`intake-item ${c.submittedBy === staff.email ? 'mine' : ''}`}>
                {c.image && <img src={c.image} alt="" className="intake-item-img" />}
                <div className="intake-item-info">
                  <div className="intake-item-name">{c.name}</div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span className="intake-type-badge">{c.type}</span>
                    {c.age && <span className="intake-age-badge">{c.age}</span>}
                    {c.source === 'staff' && (
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                        by {c.submittedBy === staff.email ? 'you' : c.submittedBy?.split('@')[0]}
                      </span>
                    )}
                  </div>
                </div>
                {c.link && (
                  <a href={c.link} target="_blank" rel="noopener noreferrer" className="btn btn-ghost" style={{ fontSize: '0.7rem', padding: '3px 8px', flexShrink: 0, textDecoration: 'none' }}>
                    Link
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`
        .intake-page { max-width: 800px; }

        .status-banner {
          padding: 14px 18px;
          border-radius: var(--radius);
          border: 1px solid;
          font-family: var(--font-heading);
          font-size: 0.85rem;
          text-align: center;
          margin-bottom: 24px;
          letter-spacing: 0.04em;
        }

        .dup-warning {
          background: rgba(192,80,80,0.08);
          border: 1px solid rgba(192,80,80,0.3);
          border-radius: var(--radius);
          padding: 12px 14px;
          margin-top: 10px;
          font-size: 0.8rem;
          color: #e08080;
        }

        .form-row { display: flex; gap: 12px; }
        .form-actions { display: flex; gap: 10px; align-items: center; margin-top: 12px; }

        .intake-list { display: flex; flex-direction: column; gap: 6px; }
        .intake-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 12px;
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          transition: border-color 0.15s;
        }
        .intake-item.mine { border-color: rgba(201,162,39,0.3); }
        .intake-item-img {
          width: 36px;
          height: 36px;
          border-radius: 4px;
          object-fit: cover;
          flex-shrink: 0;
        }
        .intake-item-info { flex: 1; min-width: 0; }
        .intake-item-name {
          font-family: var(--font-heading);
          font-size: 0.82rem;
          color: var(--text);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .intake-mini-list { display: flex; flex-wrap: wrap; gap: 8px; }
        .intake-mini-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 10px;
          background: var(--bg-card);
          border: 1px solid rgba(201,162,39,0.25);
          border-radius: var(--radius);
          font-size: 0.78rem;
        }
        .intake-mini-img {
          width: 28px;
          height: 28px;
          border-radius: 3px;
          object-fit: cover;
          flex-shrink: 0;
        }
        .intake-mini-name {
          font-family: var(--font-heading);
          font-size: 0.78rem;
          color: var(--text);
        }

        .intake-type-badge {
          font-size: 0.6rem;
          padding: 1px 5px;
          border-radius: 3px;
          font-family: var(--font-heading);
          letter-spacing: 0.06em;
          text-transform: uppercase;
          background: rgba(201,162,39,0.1);
          color: var(--gold-dim);
          border: 1px solid rgba(201,162,39,0.2);
        }
        .intake-age-badge {
          font-size: 0.6rem;
          padding: 1px 5px;
          border-radius: 3px;
          font-family: var(--font-heading);
          letter-spacing: 0.06em;
          text-transform: uppercase;
          background: rgba(255,255,255,0.05);
          color: var(--text-muted);
          border: 1px solid var(--border);
        }

        @media (max-width: 640px) {
          .form-row { flex-direction: column; gap: 8px; }
          .intake-page { padding: 16px; }
        }
      `}</style>
    </div>
  );
}

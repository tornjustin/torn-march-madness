import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import StaffLogin from '../components/StaffLogin';
import { getStaffMe, getStaffBallot, saveStaffBallot, getBallotStats, getStaffContenders, getSeedingStatus } from '../api';

const TIERS = [
  { points: 4, label: 'Favorites',      color: '#c9a227' },
  { points: 3, label: 'Next Best',      color: '#8faa3b' },
  { points: 2, label: 'Solid Picks',    color: '#5b9bd5' },
  { points: 1, label: 'Honorable',      color: '#b07ab8' },
];
const PICKS_PER_TIER = 16;
const TYPES = ['Media', 'Misc', 'Statue', 'Replica', 'Toys & Games', 'Books', 'Bust/Environmt'];

export default function SeedingBallotPage() {
  const [staff, setStaff] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

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

  if (!authChecked) {
    return <div className="loading-wrap"><div className="loading-ring" /><span>Checking session...</span></div>;
  }
  if (!staff) {
    return <StaffLogin onLogin={r => setStaff(r.staff || r)} />;
  }

  return <BallotContent staff={staff} onLogout={() => { sessionStorage.removeItem('memm_staff_token'); setStaff(null); }} />;
}

function BallotContent({ staff, onLogout }) {
  const [contenders, setContenders] = useState([]);
  const [picks, setPicks] = useState({});         // { contenderId: tierPoints }
  const [ballotStatus, setBallotStatus] = useState('draft');
  const [seedingStatus, setSeedingStatus] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  // Which tier we're filling
  const [activeTier, setActiveTier] = useState(4);

  // Search/filter
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, b, s, st] = await Promise.all([
        getStaffContenders(),
        getStaffBallot(),
        getSeedingStatus(),
        getBallotStats(),
      ]);
      setContenders(c.contenders || c);
      if (b.picks) setPicks(b.picks);
      if (b.status) setBallotStatus(b.status);
      setSeedingStatus(s);
      setStats(st);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Derived
  const picksForTier = (tier) => Object.entries(picks).filter(([, t]) => t === tier).map(([id]) => id);
  const totalPicks = Object.keys(picks).length;
  const isSubmitted = ballotStatus === 'submitted';
  const isOpen = seedingStatus?.ballot?.status === 'open';
  const activeTierCount = picksForTier(activeTier).length;
  const activeTierFull = activeTierCount >= PICKS_PER_TIER;
  const allFull = TIERS.every(t => picksForTier(t.points).length === PICKS_PER_TIER);

  // Auto-advance to next unfilled tier when current one fills up
  useEffect(() => {
    if (activeTierFull && !allFull) {
      const next = TIERS.find(t => picksForTier(t.points).length < PICKS_PER_TIER);
      if (next) setActiveTier(next.points);
    }
  }, [activeTierFull, allFull, picks]);

  function addPick(contenderId) {
    if (isSubmitted || activeTierFull) return;
    setPicks(p => ({ ...p, [contenderId]: activeTier }));
  }

  function removePick(contenderId) {
    if (isSubmitted) return;
    setPicks(p => {
      const next = { ...p };
      delete next[contenderId];
      return next;
    });
  }

  function changeTier(contenderId, newTier) {
    if (isSubmitted) return;
    const targetCount = picksForTier(newTier).length;
    if (targetCount >= PICKS_PER_TIER) {
      setMsg(`${TIERS.find(t => t.points === newTier)?.label} is full (${PICKS_PER_TIER}/${PICKS_PER_TIER})`);
      setTimeout(() => setMsg(''), 2000);
      return;
    }
    setPicks(p => ({ ...p, [contenderId]: newTier }));
  }

  async function handleSave(submitFinal = false) {
    setSaving(true);
    setMsg('');
    try {
      await saveStaffBallot(picks, submitFinal ? 'submitted' : 'draft');
      if (submitFinal) setBallotStatus('submitted');
      setMsg(submitFinal ? 'Ballot submitted! Thank you!' : 'Draft saved!');
      setTimeout(() => setMsg(''), 3000);
    } catch (e) {
      setMsg('Error: ' + (e.error || e.message));
    } finally {
      setSaving(false);
    }
  }

  function handleSubmit() {
    for (const tier of TIERS) {
      const count = picksForTier(tier.points).length;
      if (count !== PICKS_PER_TIER) {
        setMsg(`Need ${PICKS_PER_TIER} picks in "${tier.label}" (have ${count})`);
        return;
      }
    }
    if (!confirm('Submit your ballot? You won\'t be able to change it after.')) return;
    handleSave(true);
  }

  // Pool = unpicked contenders
  const pool = contenders.filter(c => !(c.id in picks));
  const filteredPool = pool.filter(c => {
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterType && c.type !== filterType) return false;
    return true;
  });

  if (loading) {
    return <div className="loading-wrap"><div className="loading-ring" /><span>Loading ballot...</span></div>;
  }

  const activeTierObj = TIERS.find(t => t.points === activeTier);

  return (
    <div className="page ballot-page">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: 4 }}>Seeding Ballot</h1>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            <strong style={{ color: 'var(--gold-dim)' }}>{staff.email}</strong>
            {' '}&middot;{' '}
            <Link to="/seeding" style={{ color: 'var(--gold-dim)', fontSize: '0.78rem' }}>Intake Page</Link>
          </p>
        </div>
        <button className="btn btn-ghost" style={{ fontSize: '0.75rem' }} onClick={onLogout}>Sign Out</button>
      </div>

      {/* Status banners */}
      {!isOpen && (
        <div className="ballot-banner" style={{ background: 'rgba(201,162,39,0.1)', borderColor: 'var(--border-gold)', color: 'var(--gold)' }}>
          {seedingStatus?.ballot?.status === 'closed' ? 'Ballot voting is now closed.' : 'Ballot voting has not opened yet.'}
        </div>
      )}
      {isSubmitted && (
        <div className="ballot-banner" style={{ background: 'rgba(39,165,90,0.1)', borderColor: 'var(--green)', color: 'var(--green-bright)' }}>
          Your ballot has been submitted. Thank you!
        </div>
      )}

      {/* Instructions */}
      {!isSubmitted && isOpen && (
        <div className="ballot-instructions">
          Pick your <strong>16 favorites</strong> in each tier below. Select a tier, then click items from the list to add them.
          You'll choose 64 items total (16 per tier). Have fun!
        </div>
      )}

      {/* Tier selector — big friendly buttons */}
      <div className="ballot-tier-selector">
        {TIERS.map(t => {
          const count = picksForTier(t.points).length;
          const full = count >= PICKS_PER_TIER;
          const active = activeTier === t.points;
          return (
            <button
              key={t.points}
              className={`ballot-tier-btn ${active ? 'active' : ''} ${full ? 'full' : ''}`}
              style={{ '--tier-color': t.color }}
              onClick={() => setActiveTier(t.points)}
            >
              <span className="ballot-tier-btn-label">{t.label}</span>
              <span className="ballot-tier-btn-count">{count}/{PICKS_PER_TIER}</span>
              {full && <span className="ballot-tier-btn-check">Done</span>}
            </button>
          );
        })}
      </div>

      {msg && <div className={msg.startsWith('Error') || msg.startsWith('Need') ? 'error-msg' : 'success-msg'} style={{ marginBottom: 12 }}>{msg}</div>}

      <div className="ballot-layout">
        {/* Left: Available items */}
        <div className="ballot-pool">
          <h3 className="ballot-section-title">
            Click to add to <span style={{ color: activeTierObj?.color }}>{activeTierObj?.label}</span>
            <span style={{ color: 'var(--text-muted)', fontWeight: 'normal' }}> ({pool.length} left)</span>
          </h3>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
            <input
              className="form-input"
              placeholder="Search..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ flex: 1, minWidth: 120 }}
            />
            <select className="form-select" value={filterType} onChange={e => setFilterType(e.target.value)} style={{ maxWidth: 130 }}>
              <option value="">All Types</option>
              {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div className="ballot-pool-list">
            {filteredPool.map(c => (
              <div
                key={c.id}
                className={`ballot-pool-item ${activeTierFull ? 'disabled' : ''}`}
                onClick={() => !isSubmitted && !activeTierFull && addPick(c.id)}
              >
                {c.image && <img src={c.image} alt="" className="ballot-pool-img" />}
                <div className="ballot-pool-info">
                  <div className="ballot-pool-name">{c.name}</div>
                  <span className="ballot-pool-type">{c.type}</span>
                </div>
              </div>
            ))}
            {filteredPool.length === 0 && (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', padding: 10 }}>
                {pool.length === 0 ? 'All items picked!' : 'No matches.'}
              </div>
            )}
          </div>
        </div>

        {/* Right: Your picks by tier */}
        <div className="ballot-picks">
          {TIERS.map(tier => {
            const tierIds = picksForTier(tier.points);
            const tierContenders = tierIds.map(id => contenders.find(c => c.id === id)).filter(Boolean);
            const isActive = activeTier === tier.points;
            return (
              <div key={tier.points} className={`ballot-tier ${isActive ? 'is-active' : ''}`} style={{ '--tier-color': tier.color }}>
                <div className="ballot-tier-header" onClick={() => setActiveTier(tier.points)}>
                  <span className="ballot-tier-label">{tier.label}</span>
                  <span className="ballot-tier-count" style={{ color: tierIds.length === PICKS_PER_TIER ? 'var(--green-bright)' : 'var(--text-muted)' }}>
                    {tierIds.length}/{PICKS_PER_TIER}
                  </span>
                </div>
                {tierContenders.length > 0 && (
                  <div className="ballot-tier-items">
                    {tierContenders.map(c => (
                      <div key={c.id} className="ballot-tier-item">
                        {c.image && <img src={c.image} alt="" className="ballot-tier-img" />}
                        <span className="ballot-tier-name">{c.name}</span>
                        {!isSubmitted && (
                          <div className="ballot-tier-item-actions">
                            <select
                              className="ballot-tier-move"
                              value={tier.points}
                              onChange={e => changeTier(c.id, Number(e.target.value))}
                            >
                              {TIERS.map(t => (
                                <option key={t.points} value={t.points}>{t.label}</option>
                              ))}
                            </select>
                            <button
                              className="ballot-tier-remove"
                              onClick={() => removePick(c.id)}
                              title="Remove"
                            >x</button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Actions */}
      {!isSubmitted && isOpen && (
        <div className="ballot-actions">
          <button className="btn btn-outline" onClick={() => handleSave(false)} disabled={saving}>
            {saving ? 'Saving...' : 'Save Draft'}
          </button>
          <button className="btn btn-gold" onClick={handleSubmit} disabled={saving || !allFull}>
            Submit Ballot
          </button>
          {!allFull && (
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              {64 - totalPicks} picks remaining
            </span>
          )}
          {stats && (
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
              {stats.submittedBallots || 0} ballots submitted so far
            </span>
          )}
        </div>
      )}

      <style>{`
        .ballot-page { max-width: 1100px; }

        .ballot-banner {
          padding: 12px 16px;
          border: 1px solid;
          border-radius: var(--radius);
          font-family: var(--font-heading);
          font-size: 0.85rem;
          text-align: center;
          margin-bottom: 16px;
        }

        .ballot-instructions {
          padding: 12px 16px;
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          font-size: 0.85rem;
          color: var(--text-dim);
          line-height: 1.5;
          margin-bottom: 16px;
        }
        .ballot-instructions strong { color: var(--gold-dim); }

        /* Tier selector buttons */
        .ballot-tier-selector {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 8px;
          margin-bottom: 16px;
        }
        .ballot-tier-btn {
          position: relative;
          padding: 10px 12px;
          background: var(--bg-card);
          border: 2px solid var(--border);
          border-radius: var(--radius);
          cursor: pointer;
          text-align: center;
          transition: all 0.15s;
        }
        .ballot-tier-btn:hover { border-color: var(--tier-color); }
        .ballot-tier-btn.active {
          border-color: var(--tier-color);
          background: color-mix(in srgb, var(--tier-color) 8%, var(--bg-card));
          box-shadow: 0 0 0 1px var(--tier-color);
        }
        .ballot-tier-btn.full { opacity: 0.7; }
        .ballot-tier-btn.full.active { opacity: 1; }
        .ballot-tier-btn-label {
          display: block;
          font-family: var(--font-heading);
          font-size: 0.82rem;
          color: var(--tier-color);
          letter-spacing: 0.04em;
          margin-bottom: 2px;
        }
        .ballot-tier-btn-count {
          display: block;
          font-size: 0.72rem;
          color: var(--text-muted);
        }
        .ballot-tier-btn-check {
          font-size: 0.6rem;
          color: var(--green-bright);
          font-family: var(--font-heading);
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }

        /* Layout */
        .ballot-layout {
          display: grid;
          grid-template-columns: 280px 1fr;
          gap: 16px;
          align-items: start;
        }
        @media (max-width: 800px) {
          .ballot-layout { grid-template-columns: 1fr; }
          .ballot-tier-selector { grid-template-columns: repeat(2, 1fr); }
        }

        .ballot-section-title {
          font-family: var(--font-heading);
          font-size: 0.82rem;
          color: var(--text);
          letter-spacing: 0.04em;
          margin-bottom: 8px;
        }

        /* Pool */
        .ballot-pool {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 12px;
          position: sticky;
          top: 80px;
          max-height: calc(100vh - 120px);
          overflow-y: auto;
        }
        .ballot-pool-list {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .ballot-pool-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 8px;
          border-radius: 4px;
          cursor: pointer;
          transition: background 0.12s;
        }
        .ballot-pool-item:hover { background: var(--bg-hover); }
        .ballot-pool-item.disabled { opacity: 0.4; cursor: default; }
        .ballot-pool-item.disabled:hover { background: transparent; }
        .ballot-pool-img {
          width: 30px;
          height: 30px;
          border-radius: 3px;
          object-fit: cover;
          flex-shrink: 0;
        }
        .ballot-pool-info { flex: 1; min-width: 0; }
        .ballot-pool-name {
          font-family: var(--font-heading);
          font-size: 0.78rem;
          color: var(--text);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ballot-pool-type {
          font-size: 0.6rem;
          color: var(--text-muted);
          font-family: var(--font-heading);
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        /* Picks / tiers */
        .ballot-picks {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .ballot-tier {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          overflow: hidden;
          transition: border-color 0.15s;
        }
        .ballot-tier.is-active {
          border-color: var(--tier-color);
        }
        .ballot-tier-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 12px;
          cursor: pointer;
          background: color-mix(in srgb, var(--tier-color) 6%, transparent);
        }
        .ballot-tier-header:hover { background: color-mix(in srgb, var(--tier-color) 10%, transparent); }
        .ballot-tier-label {
          font-family: var(--font-heading);
          font-size: 0.8rem;
          color: var(--tier-color);
          letter-spacing: 0.04em;
        }
        .ballot-tier-count {
          font-size: 0.72rem;
          font-family: var(--font-heading);
        }
        .ballot-tier-items {
          padding: 4px 6px 6px;
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
        }
        .ballot-tier-item {
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 3px 6px;
          border-radius: 4px;
          background: var(--bg-dark);
          max-width: 260px;
        }
        .ballot-tier-img {
          width: 20px;
          height: 20px;
          border-radius: 2px;
          object-fit: cover;
          flex-shrink: 0;
        }
        .ballot-tier-name {
          font-family: var(--font-heading);
          font-size: 0.7rem;
          color: var(--text);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          min-width: 0;
        }
        .ballot-tier-item-actions {
          display: flex;
          gap: 2px;
          flex-shrink: 0;
          margin-left: auto;
        }
        .ballot-tier-move {
          font-size: 0.6rem;
          background: var(--bg-mid);
          border: 1px solid var(--border);
          border-radius: 3px;
          color: var(--text-muted);
          padding: 1px 2px;
          cursor: pointer;
        }
        .ballot-tier-remove {
          background: none;
          border: none;
          color: #c05050;
          font-size: 0.65rem;
          cursor: pointer;
          padding: 0 3px;
          font-family: var(--font-heading);
        }
        .ballot-tier-remove:hover { color: #e06060; }

        /* Actions */
        .ballot-actions {
          display: flex;
          gap: 10px;
          margin-top: 20px;
          align-items: center;
          flex-wrap: wrap;
        }
      `}</style>
    </div>
  );
}

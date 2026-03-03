import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import StaffLogin from '../components/StaffLogin';
import { getStaffMe, getStaffBallot, saveStaffBallot, getBallotStats, getStaffContenders, getSeedingStatus } from '../api';

const TIERS = [
  { points: 4, label: 'Favorites',   color: '#c9a227' },
  { points: 3, label: 'Next Best',   color: '#8faa3b' },
  { points: 2, label: 'Solid Picks', color: '#5b9bd5' },
  { points: 1, label: 'Honorable',   color: '#b07ab8' },
];
const PICKS_PER_TIER = 16;

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

function StarRating({ value, onChange, disabled }) {
  return (
    <div className="star-rating">
      {TIERS.slice().reverse().map(t => {
        const active = value === t.points;
        return (
          <button
            key={t.points}
            className={`star-btn ${active ? 'active' : ''} ${value && !active ? 'dimmed' : ''}`}
            style={{ '--star-color': t.color }}
            disabled={disabled}
            onClick={() => onChange(active ? 0 : t.points)}
            title={`${t.points} - ${t.label}`}
          >
            <span className="star-icon">{active ? '\u2605' : '\u2606'}</span>
          </button>
        );
      })}
      {value > 0 && (
        <span className="star-label" style={{ color: TIERS.find(t => t.points === value)?.color }}>
          {TIERS.find(t => t.points === value)?.label}
        </span>
      )}
    </div>
  );
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
  const tierCount = (tier) => Object.values(picks).filter(t => t === tier).length;
  const totalPicks = Object.keys(picks).length;
  const isSubmitted = ballotStatus === 'submitted';
  const isOpen = seedingStatus?.ballot?.status === 'open';
  const allFull = TIERS.every(t => tierCount(t.points) === PICKS_PER_TIER);

  function handleRating(contenderId, newTier) {
    if (isSubmitted) return;
    if (newTier === 0) {
      // Remove pick
      setPicks(p => {
        const next = { ...p };
        delete next[contenderId];
        return next;
      });
      return;
    }
    if (tierCount(newTier) >= PICKS_PER_TIER && picks[contenderId] !== newTier) {
      const label = TIERS.find(t => t.points === newTier)?.label;
      setMsg(`${label} is full (${PICKS_PER_TIER}/${PICKS_PER_TIER})`);
      setTimeout(() => setMsg(''), 2500);
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
      const count = tierCount(tier.points);
      if (count !== PICKS_PER_TIER) {
        setMsg(`Need ${PICKS_PER_TIER} in "${tier.label}" (have ${count})`);
        return;
      }
    }
    if (!confirm('Submit your ballot? You won\'t be able to change it after.')) return;
    handleSave(true);
  }

  if (loading) {
    return <div className="loading-wrap"><div className="loading-ring" /><span>Loading ballot...</span></div>;
  }

  return (
    <div className="page ballot-page">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: 4 }}>Seeding Ballot</h1>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            <strong style={{ color: 'var(--gold-dim)' }}>{staff.email}</strong>
          </p>
        </div>
        <button className="btn btn-ghost" style={{ fontSize: '0.75rem' }} onClick={onLogout}>Sign Out</button>
      </div>

      {/* Intake link */}
      <div style={{
        padding: '8px 14px',
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        fontSize: '0.82rem',
        color: 'var(--text-dim)',
        marginBottom: 16,
      }}>
        Want to add another option?{' '}
        <Link to="/seeding/intake" style={{ color: 'var(--gold)', fontFamily: 'var(--font-heading)', letterSpacing: '0.03em' }}>
          Click here to submit a new contender
        </Link>
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
          <p style={{ marginBottom: 10 }}>
            Vote for your favorites using <strong>1</strong> (low) to <strong>4</strong> (high) stars.
            You only get <strong>16 of each rating</strong>, so choose wisely! Click a star again to remove it.
          </p>
          <div className="ballot-legend">
            <div className="ballot-legend-item">
              <span className="ballot-legend-stars" style={{ color: '#c9a227' }}>{'\u2605\u2605\u2605\u2605'}</span>
              <span className="ballot-legend-label" style={{ color: '#c9a227' }}>Favorites</span>
              <span className="ballot-legend-desc">Your absolute must-haves (16 picks)</span>
            </div>
            <div className="ballot-legend-item">
              <span className="ballot-legend-stars" style={{ color: '#8faa3b' }}>{'\u2605\u2605\u2605'}<span style={{ opacity: 0.2 }}>{'\u2606'}</span></span>
              <span className="ballot-legend-label" style={{ color: '#8faa3b' }}>Next Best</span>
              <span className="ballot-legend-desc">Strong contenders you love (16 picks)</span>
            </div>
            <div className="ballot-legend-item">
              <span className="ballot-legend-stars" style={{ color: '#5b9bd5' }}>{'\u2605\u2605'}<span style={{ opacity: 0.2 }}>{'\u2606\u2606'}</span></span>
              <span className="ballot-legend-label" style={{ color: '#5b9bd5' }}>Solid Picks</span>
              <span className="ballot-legend-desc">Good options worth including (16 picks)</span>
            </div>
            <div className="ballot-legend-item">
              <span className="ballot-legend-stars" style={{ color: '#b07ab8' }}>{'\u2605'}<span style={{ opacity: 0.2 }}>{'\u2606\u2606\u2606'}</span></span>
              <span className="ballot-legend-label" style={{ color: '#b07ab8' }}>Honorable Mentions</span>
              <span className="ballot-legend-desc">Nice to have, lower priority (16 picks)</span>
            </div>
          </div>
        </div>
      )}

      {/* Sticky summary bar */}
      <div className="ballot-summary">
        {TIERS.map(t => {
          const count = tierCount(t.points);
          const full = count === PICKS_PER_TIER;
          const stars = '\u2605'.repeat(t.points);
          return (
            <div key={t.points} className={`ballot-summary-item ${full ? 'full' : ''}`} style={{ '--tier-color': t.color }}>
              <span className="ballot-summary-stars" style={{ color: t.color }}>{stars}</span>
              <span className="ballot-summary-label">{t.label}</span>
              <span className="ballot-summary-count" style={{ color: full ? 'var(--green-bright)' : 'var(--text-muted)' }}>
                {count}/{PICKS_PER_TIER}
              </span>
            </div>
          );
        })}
        <div className="ballot-summary-total">
          {totalPicks}/64 rated
        </div>
      </div>

      {msg && <div className={msg.startsWith('Error') || msg.startsWith('Need') ? 'error-msg' : 'success-msg'} style={{ marginBottom: 12 }}>{msg}</div>}

      {/* Card grid */}
      <div className="ballot-grid">
        {contenders.map(c => {
          const rating = picks[c.id] || 0;
          const tier = TIERS.find(t => t.points === rating);
          return (
            <div
              key={c.id}
              className={`ballot-card ${rating ? 'rated' : ''}`}
              style={rating ? { '--card-accent': tier.color } : undefined}
            >
              {c.image ? (
                <img src={c.image} alt={c.name} className="ballot-card-img" />
              ) : (
                <div className="ballot-card-img ballot-card-no-img">No Image</div>
              )}
              <div className="ballot-card-body">
                <div className="ballot-card-name">{c.name}</div>
                <div className="ballot-card-type">{c.type}</div>
                <StarRating
                  value={rating}
                  onChange={(v) => handleRating(c.id, v)}
                  disabled={isSubmitted}
                />
              </div>
            </div>
          );
        })}
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
        .ballot-page { max-width: 1200px; }

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

        .ballot-legend {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 8px;
        }
        .ballot-legend-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 10px;
          background: var(--bg-dark);
          border-radius: 4px;
        }
        .ballot-legend-stars {
          font-size: 1rem;
          line-height: 1;
          flex-shrink: 0;
          min-width: 56px;
        }
        .ballot-legend-label {
          font-family: var(--font-heading);
          font-size: 0.78rem;
          letter-spacing: 0.03em;
          flex-shrink: 0;
          min-width: 70px;
        }
        .ballot-legend-desc {
          font-size: 0.72rem;
          color: var(--text-muted);
        }

        /* Sticky summary bar */
        .ballot-summary {
          position: sticky;
          top: 64px;
          z-index: 20;
          display: flex;
          gap: 6px;
          padding: 10px 14px;
          background: var(--bg-dark);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          margin-bottom: 16px;
          flex-wrap: wrap;
          align-items: center;
        }
        .ballot-summary-item {
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 4px 10px;
          border-radius: 4px;
          background: var(--bg-card);
          border: 1px solid var(--border);
          font-size: 0.75rem;
        }
        .ballot-summary-item.full {
          border-color: var(--green-bright);
          opacity: 0.7;
        }
        .ballot-summary-stars { font-size: 0.8rem; line-height: 1; }
        .ballot-summary-label {
          font-family: var(--font-heading);
          color: var(--tier-color);
          letter-spacing: 0.03em;
          font-size: 0.7rem;
        }
        .ballot-summary-count {
          font-family: var(--font-heading);
          font-size: 0.7rem;
        }
        .ballot-summary-total {
          margin-left: auto;
          font-family: var(--font-heading);
          font-size: 0.75rem;
          color: var(--text-muted);
          letter-spacing: 0.04em;
        }

        /* Card grid */
        .ballot-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          gap: 16px;
        }

        .ballot-card {
          background: var(--bg-card);
          border: 2px solid var(--border);
          border-radius: var(--radius);
          overflow: hidden;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .ballot-card.rated {
          border-color: var(--card-accent);
          box-shadow: 0 0 0 1px var(--card-accent), 0 2px 8px rgba(0,0,0,0.15);
        }

        .ballot-card-img {
          width: 100%;
          aspect-ratio: 1;
          object-fit: cover;
          display: block;
          background: var(--bg-dark);
        }
        .ballot-card-no-img {
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text-muted);
          font-family: var(--font-heading);
          font-size: 0.75rem;
          letter-spacing: 0.06em;
        }

        .ballot-card-body {
          padding: 10px 12px 12px;
        }
        .ballot-card-name {
          font-family: var(--font-heading);
          font-size: 0.88rem;
          color: var(--text);
          line-height: 1.3;
          margin-bottom: 4px;
        }
        .ballot-card-type {
          font-size: 0.65rem;
          color: var(--text-muted);
          font-family: var(--font-heading);
          letter-spacing: 0.08em;
          text-transform: uppercase;
          margin-bottom: 8px;
        }

        /* Star rating */
        .star-rating {
          display: flex;
          align-items: center;
          gap: 2px;
        }
        .star-btn {
          background: none;
          border: none;
          cursor: pointer;
          padding: 2px;
          transition: transform 0.1s;
        }
        .star-btn:hover:not(:disabled) { transform: scale(1.2); }
        .star-btn:disabled { cursor: default; }
        .star-btn.dimmed .star-icon { opacity: 0.3; }
        .star-icon {
          font-size: 1.4rem;
          line-height: 1;
          color: var(--star-color);
        }
        .star-btn:not(.active) .star-icon { color: var(--text-muted); opacity: 0.4; }
        .star-btn:not(.active):hover:not(:disabled) .star-icon { opacity: 0.7; }
        .star-btn.active .star-icon { opacity: 1; }
        .star-label {
          font-family: var(--font-heading);
          font-size: 0.65rem;
          letter-spacing: 0.04em;
          margin-left: 6px;
        }

        /* Actions */
        .ballot-actions {
          display: flex;
          gap: 10px;
          margin-top: 24px;
          padding: 16px 0;
          align-items: center;
          flex-wrap: wrap;
          border-top: 1px solid var(--border);
        }

        @media (max-width: 500px) {
          .ballot-grid { grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 10px; }
          .ballot-card-name { font-size: 0.8rem; }
          .star-icon { font-size: 1.2rem; }
          .ballot-summary { top: 56px; }
        }
      `}</style>
    </div>
  );
}

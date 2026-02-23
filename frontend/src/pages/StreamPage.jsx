import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getDashboard, dashboardNext, dashboardPrev } from '../api';

const POLL_MS = 4000;

export default function StreamPage() {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [adminToken, setAdminToken] = useState(() => sessionStorage.getItem('memm_admin_token'));
  const [showControls, setShowControls] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const controlsTimer = useRef(null);
  const prevMatchupId = useRef(null);

  const fetchState = useCallback(async () => {
    try {
      const d = await getDashboard();
      setState(d);
      setLoading(false);
    } catch (e) {
      console.error('Dashboard fetch error', e);
      setLoading(false);
    }
  }, []);

  // Initial load + polling — pauses when tab is hidden to save resources
  useEffect(() => {
    fetchState();
    const interval = setInterval(() => {
      if (!document.hidden) fetchState();
    }, POLL_MS);

    const handleVisibility = () => {
      // Re-fetch immediately when the tab becomes visible again
      if (!document.hidden) fetchState();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [fetchState]);

  // Detect matchup change → trigger transition
  useEffect(() => {
    if (!state?.currentMatchup) return;
    if (prevMatchupId.current && prevMatchupId.current !== state.currentMatchupId) {
      setTransitioning(true);
      setTimeout(() => setTransitioning(false), 600);
    }
    prevMatchupId.current = state.currentMatchupId;
  }, [state?.currentMatchupId]);

  // Keyboard navigation
  useEffect(() => {
    function onKey(e) {
      if (!adminToken) return;
      if (e.key === 'ArrowRight') handleNext();
      if (e.key === 'ArrowLeft') handlePrev();
      if (e.key === 'c' || e.key === 'C') toggleControls();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [adminToken, state]);

  // Mouse move shows controls temporarily
  useEffect(() => {
    function onMove() {
      setShowControls(true);
      clearTimeout(controlsTimer.current);
      controlsTimer.current = setTimeout(() => setShowControls(false), 3000);
    }
    window.addEventListener('mousemove', onMove);
    return () => { window.removeEventListener('mousemove', onMove); clearTimeout(controlsTimer.current); };
  }, []);

  function toggleControls() { setShowControls(v => !v); }

  async function handleNext() {
    if (!adminToken || !state?.matchupOrder?.length) return;
    try { await dashboardNext(adminToken); await fetchState(); }
    catch (e) { console.error(e); }
  }
  async function handlePrev() {
    if (!adminToken || !state?.matchupOrder?.length) return;
    try { await dashboardPrev(adminToken); await fetchState(); }
    catch (e) { console.error(e); }
  }

  // Admin token entry
  const [showLogin, setShowLogin] = useState(false);
  const [loginPw, setLoginPw] = useState('');
  function handleLogin(e) {
    e.preventDefault();
    sessionStorage.setItem('memm_admin_token', loginPw);
    setAdminToken(loginPw);
    setShowLogin(false);
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="stream-page stream-loading">
        <div className="stream-logo">⚔ Middle-earth March Madness ⚔</div>
        <div className="stream-loading-ring" />
      </div>
    );
  }

  const { currentMatchup, currentIndex, totalMatchups } = state || {};

  if (!currentMatchup) {
    return (
      <div className="stream-page stream-standby">
        <div className="standby-inner">
          <div className="standby-logo">
            <div className="standby-title">⚔ Middle-earth March Madness ⚔</div>
            <div className="standby-sub">Voting is Live — Cast Your Vote!</div>
          </div>
        </div>
        {showControls && adminToken && (
          <div className="stream-ctrl-bar">
            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>No matchup selected. Use Admin → Dashboard to set one.</span>
          </div>
        )}
        <StreamStyles />
      </div>
    );
  }

  const m = currentMatchup;
  const { team1, team2, votes, totalVotes, roundLabel } = m;
  const pct1 = totalVotes ? Math.round((votes.team1 / totalVotes) * 100) : 50;
  const pct2 = totalVotes ? 100 - pct1 : 50;
  const leader = pct1 > pct2 ? 1 : pct2 > pct1 ? 2 : 0;

  return (
    <div className={`stream-page ${transitioning ? 'transitioning' : ''}`}>

      {/* Header bar */}
      <div className="stream-header">
        <div className="stream-tournament-name">⚔ Middle-earth March Madness ⚔</div>
        <div className="stream-round-label">{roundLabel}</div>
        <div className="stream-matchup-count">
          {typeof currentIndex === 'number' && totalMatchups ? `${currentIndex + 1} / ${totalMatchups}` : ''}
        </div>
      </div>

      {/* Main arena */}
      <div className="stream-arena">
        {/* Team 1 */}
        <div className={`stream-team team1 ${leader === 1 ? 'leading' : leader === 2 ? 'trailing' : ''}`}>
          <div className="stream-photo-wrap">
            {team1?.image
              ? <img src={team1.image} alt={team1.name} className="stream-photo" />
              : <div className="stream-photo-placeholder">
                  <span className="stream-photo-initial">{team1?.name?.[0] || '?'}</span>
                </div>
            }
            <div className="stream-photo-overlay team1-overlay" />
          </div>

          <div className="stream-team-content">
            {team1?.seed && <div className="stream-seed">#{team1.seed}</div>}
            <div className="stream-team-name">{team1?.name || 'TBD'}</div>
            {team1?.description && <div className="stream-team-desc">{team1.description}</div>}
            <div className="stream-vote-number">{(votes?.team1 || 0).toLocaleString()}</div>
            <div className="stream-vote-label">votes</div>
            <div className="stream-pct-big">{pct1}%</div>
          </div>
        </div>

        {/* VS Center column */}
        <div className="stream-center">
          <div className="stream-vs-box">
            <div className="stream-vs-text">VS</div>
          </div>
          {totalVotes > 0 && (
            <div className="stream-total-votes">
              {totalVotes.toLocaleString()} votes cast
            </div>
          )}
        </div>

        {/* Team 2 */}
        <div className={`stream-team team2 ${leader === 2 ? 'leading' : leader === 1 ? 'trailing' : ''}`}>
          <div className="stream-photo-wrap">
            {team2?.image
              ? <img src={team2.image} alt={team2.name} className="stream-photo" />
              : <div className="stream-photo-placeholder">
                  <span className="stream-photo-initial">{team2?.name?.[0] || '?'}</span>
                </div>
            }
            <div className="stream-photo-overlay team2-overlay" />
          </div>

          <div className="stream-team-content right">
            {team2?.seed && <div className="stream-seed"># {team2.seed}</div>}
            <div className="stream-team-name">{team2?.name || 'TBD'}</div>
            {team2?.description && <div className="stream-team-desc">{team2.description}</div>}
            <div className="stream-vote-number">{(votes?.team2 || 0).toLocaleString()}</div>
            <div className="stream-vote-label">votes</div>
            <div className="stream-pct-big">{pct2}%</div>
          </div>
        </div>
      </div>

      {/* Vote bar at bottom */}
      <div className="stream-bar-section">
        <div className="stream-bar-wrap">
          <div className="stream-bar-team1" style={{ width: `${pct1}%` }}>
            <span className="stream-bar-name">{team1?.name}</span>
            <span className="stream-bar-pct">{pct1}%</span>
          </div>
          <div className="stream-bar-team2" style={{ width: `${pct2}%` }}>
            <span className="stream-bar-pct">{pct2}%</span>
            <span className="stream-bar-name">{team2?.name}</span>
          </div>
        </div>
        <div className="stream-bar-labels">
          <span>{team1?.name}</span>
          <span className="stream-vote-cta">🗡 Vote at TheOneRing.net 🗡</span>
          <span>{team2?.name}</span>
        </div>
      </div>

      {/* Controls overlay (fades on mouse move) */}
      {showControls && (
        <div className="stream-ctrl-bar">
          {adminToken ? (
            <>
              <button className="stream-ctrl-btn" onClick={handlePrev} title="Previous (←)">◀ Prev</button>
              <span className="stream-ctrl-info">
                Matchup {typeof currentIndex === 'number' ? currentIndex + 1 : '?'} of {totalMatchups || '?'}
                &nbsp;·&nbsp; ← → to navigate
              </span>
              <button className="stream-ctrl-btn" onClick={handleNext} title="Next (→)">Next ▶</button>
            </>
          ) : (
            <>
              <span className="stream-ctrl-info" style={{ flex: 1 }}>Admin login required for navigation</span>
              <button className="stream-ctrl-btn" onClick={() => setShowLogin(v => !v)}>Login</button>
            </>
          )}
        </div>
      )}

      {/* Admin login overlay */}
      {showLogin && (
        <div className="stream-login-overlay">
          <form onSubmit={handleLogin} className="stream-login-form">
            <div style={{ fontFamily: 'var(--font-heading)', color: 'var(--gold)', marginBottom: 12 }}>Admin Password</div>
            <input
              type="password"
              className="form-input"
              value={loginPw}
              onChange={e => setLoginPw(e.target.value)}
              placeholder="Password"
              autoFocus
              style={{ marginBottom: 8 }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="btn btn-gold" style={{ flex: 1 }}>Login</button>
              <button type="button" className="btn btn-ghost" onClick={() => setShowLogin(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      <StreamStyles />
    </div>
  );
}

function StreamStyles() {
  return (
    <style>{`
      html, body { margin: 0; padding: 0; overflow: hidden; background: #000; }

      .stream-page {
        width: 1920px;
        height: 1080px;
        overflow: hidden;
        background: var(--bg-deepest);
        display: flex;
        flex-direction: column;
        position: relative;
        transform-origin: top left;
        font-size: 16px;
      }

      /* Scale to viewport */
      @media screen {
        .stream-page {
          transform: scale(calc(min(100vw/1920, 100vh/1080)));
        }
      }

      .stream-page.transitioning { animation: streamFade 0.6s ease; }
      @keyframes streamFade { 0% { opacity: 0.3; } 100% { opacity: 1; } }

      /* ─ Loading / Standby ───────────────────────────────────────── */
      .stream-loading, .stream-standby {
        align-items: center;
        justify-content: center;
        background: radial-gradient(ellipse at center, #1a1520 0%, var(--bg-deepest) 70%);
      }
      .stream-logo, .standby-title {
        font-family: var(--font-title);
        font-size: 3rem;
        color: var(--gold);
        text-align: center;
        text-shadow: 0 0 60px rgba(201,162,39,0.4);
        letter-spacing: 0.05em;
      }
      .standby-sub {
        font-family: var(--font-heading);
        font-size: 1.2rem;
        color: var(--text-dim);
        text-align: center;
        letter-spacing: 0.2em;
        text-transform: uppercase;
        margin-top: 16px;
      }
      .stream-loading-ring {
        width: 60px; height: 60px;
        border: 4px solid var(--border);
        border-top-color: var(--gold);
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
        margin-top: 32px;
      }

      /* ─ Header ──────────────────────────────────────────────────── */
      .stream-header {
        height: 72px;
        background: linear-gradient(to bottom, #000, var(--bg-dark));
        border-bottom: 2px solid var(--border-gold);
        display: flex;
        align-items: center;
        padding: 0 48px;
        gap: 24px;
        flex-shrink: 0;
        box-shadow: 0 2px 20px rgba(201,162,39,0.15);
      }
      .stream-tournament-name {
        font-family: var(--font-title);
        font-size: 1.4rem;
        color: var(--gold);
        letter-spacing: 0.05em;
        text-shadow: 0 0 20px rgba(201,162,39,0.4);
        flex: 1;
      }
      .stream-round-label {
        font-family: var(--font-heading);
        font-size: 1.1rem;
        color: var(--text);
        letter-spacing: 0.15em;
        text-transform: uppercase;
      }
      .stream-matchup-count {
        font-family: var(--font-heading);
        font-size: 0.85rem;
        color: var(--text-muted);
        letter-spacing: 0.1em;
        min-width: 60px;
        text-align: right;
      }

      /* ─ Arena ───────────────────────────────────────────────────── */
      .stream-arena {
        flex: 1;
        display: flex;
        overflow: hidden;
      }

      /* ─ Team Sides ──────────────────────────────────────────────── */
      .stream-team {
        flex: 1;
        position: relative;
        overflow: hidden;
        transition: flex 0.5s cubic-bezier(0.4, 0, 0.2, 1);
      }
      .stream-team.leading { flex: 1.05; }
      .stream-team.trailing { flex: 0.95; }

      .stream-photo-wrap {
        position: absolute;
        inset: 0;
        z-index: 0;
      }
      .stream-photo {
        width: 100%;
        height: 100%;
        object-fit: cover;
        object-position: center top;
      }
      .stream-photo-placeholder {
        width: 100%;
        height: 100%;
        background: var(--bg-mid);
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .stream-photo-initial {
        font-family: var(--font-title);
        font-size: 12rem;
        color: var(--border);
      }

      .stream-photo-overlay {
        position: absolute;
        inset: 0;
        pointer-events: none;
      }
      .team1-overlay {
        background:
          linear-gradient(to right, rgba(8,6,8,0.75) 0%, transparent 45%, rgba(8,6,8,0.1) 100%),
          linear-gradient(to top, rgba(8,6,8,0.9) 0%, rgba(8,6,8,0.3) 40%, transparent 70%);
      }
      .team2-overlay {
        background:
          linear-gradient(to left, rgba(8,6,8,0.75) 0%, transparent 45%, rgba(8,6,8,0.1) 100%),
          linear-gradient(to top, rgba(8,6,8,0.9) 0%, rgba(8,6,8,0.3) 40%, transparent 70%);
      }

      .stream-team-content {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        padding: 40px 56px;
        z-index: 2;
      }
      .stream-team-content.right { text-align: right; }

      .stream-seed {
        font-family: var(--font-heading);
        font-size: 1rem;
        color: rgba(255,255,255,0.5);
        letter-spacing: 0.15em;
        margin-bottom: 4px;
      }
      .stream-team-name {
        font-family: var(--font-title);
        font-size: clamp(2.2rem, 3.5vw, 3.8rem);
        color: #fff;
        line-height: 1.1;
        text-shadow: 0 2px 16px rgba(0,0,0,0.9);
        margin-bottom: 6px;
      }
      .stream-team.leading .stream-team-name { color: var(--gold); text-shadow: 0 0 40px rgba(201,162,39,0.5); }
      .stream-team-desc {
        font-size: 1.1rem;
        color: rgba(255,255,255,0.55);
        font-style: italic;
        margin-bottom: 20px;
      }
      .stream-vote-number {
        font-family: var(--font-heading);
        font-size: 3.5rem;
        color: var(--gold);
        line-height: 1;
        text-shadow: 0 0 30px rgba(201,162,39,0.5);
      }
      .stream-vote-label {
        font-family: var(--font-heading);
        font-size: 0.85rem;
        color: var(--text-dim);
        letter-spacing: 0.2em;
        text-transform: uppercase;
        margin-bottom: 8px;
      }
      .stream-pct-big {
        font-family: var(--font-heading);
        font-size: 1.8rem;
        color: rgba(255,255,255,0.4);
        letter-spacing: 0.05em;
      }
      .stream-team.leading .stream-pct-big { color: var(--gold-dim); }

      /* ─ Center VS ───────────────────────────────────────────────── */
      .stream-center {
        width: 120px;
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        position: relative;
        z-index: 5;
        background: linear-gradient(to bottom, transparent, rgba(0,0,0,0.3), transparent);
      }
      .stream-vs-box {
        width: 90px;
        height: 90px;
        border-radius: 50%;
        background: var(--bg-deepest);
        border: 2px solid var(--border-gold);
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 0 40px rgba(0,0,0,0.8), 0 0 20px rgba(201,162,39,0.15);
      }
      .stream-vs-text {
        font-family: var(--font-heading);
        font-size: 1.3rem;
        color: var(--gold);
        letter-spacing: 0.1em;
      }
      .stream-total-votes {
        font-family: var(--font-heading);
        font-size: 0.65rem;
        color: var(--text-muted);
        letter-spacing: 0.1em;
        text-transform: uppercase;
        text-align: center;
        margin-top: 10px;
      }

      /* ─ Vote Bar ────────────────────────────────────────────────── */
      .stream-bar-section {
        height: 80px;
        background: linear-gradient(to top, #000, var(--bg-dark));
        border-top: 1px solid var(--border-gold);
        display: flex;
        flex-direction: column;
        justify-content: center;
        padding: 0 48px;
        flex-shrink: 0;
      }
      .stream-bar-wrap {
        display: flex;
        height: 24px;
        border-radius: 4px;
        overflow: hidden;
        margin-bottom: 8px;
      }
      .stream-bar-team1 {
        background: linear-gradient(to right, var(--gold-dim), var(--gold));
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 12px;
        transition: width 0.8s cubic-bezier(0.4, 0, 0.2, 1);
        min-width: 40px;
        overflow: hidden;
      }
      .stream-bar-team2 {
        background: linear-gradient(to left, #2a5070, #4a80b0);
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 12px;
        transition: width 0.8s cubic-bezier(0.4, 0, 0.2, 1);
        min-width: 40px;
        overflow: hidden;
      }
      .stream-bar-name {
        font-family: var(--font-heading);
        font-size: 0.7rem;
        color: rgba(255,255,255,0.8);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 60%;
      }
      .stream-bar-pct {
        font-family: var(--font-heading);
        font-size: 0.8rem;
        font-weight: 700;
        color: rgba(255,255,255,0.9);
        white-space: nowrap;
        flex-shrink: 0;
      }
      .stream-bar-labels {
        display: flex;
        justify-content: space-between;
        font-family: var(--font-heading);
        font-size: 0.7rem;
        color: var(--text-muted);
        letter-spacing: 0.08em;
      }
      .stream-vote-cta {
        color: var(--gold-dim);
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }

      /* ─ Controls Bar ────────────────────────────────────────────── */
      .stream-ctrl-bar {
        position: absolute;
        bottom: 88px;
        left: 0;
        right: 0;
        height: 44px;
        background: rgba(0,0,0,0.75);
        backdrop-filter: blur(8px);
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 20px;
        border-top: 1px solid var(--border);
        z-index: 50;
      }
      .stream-ctrl-btn {
        background: var(--bg-card);
        border: 1px solid var(--border-gold);
        color: var(--gold);
        font-family: var(--font-heading);
        font-size: 0.8rem;
        letter-spacing: 0.1em;
        padding: 6px 20px;
        border-radius: var(--radius);
        cursor: pointer;
        transition: all 0.15s;
      }
      .stream-ctrl-btn:hover { background: var(--bg-hover); box-shadow: var(--shadow-gold); }
      .stream-ctrl-info {
        font-family: var(--font-heading);
        font-size: 0.72rem;
        color: var(--text-muted);
        letter-spacing: 0.08em;
      }

      /* ─ Login overlay ───────────────────────────────────────────── */
      .stream-login-overlay {
        position: absolute;
        inset: 0;
        background: rgba(0,0,0,0.75);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 100;
      }
      .stream-login-form {
        background: var(--bg-card);
        border: 1px solid var(--border-gold);
        border-radius: var(--radius-lg);
        padding: 32px;
        min-width: 300px;
        box-shadow: var(--shadow);
      }
    `}</style>
  );
}

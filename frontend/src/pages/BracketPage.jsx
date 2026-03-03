import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getTournament } from '../api';

// ─── Round config ──────────────────────────────────────────────────────────────
const ROUND_NAMES = { 1: 'Round of 16', 2: 'Round of 8', 3: 'Sweet 16', 4: 'Elite 8', 5: 'Final Four', 6: 'Championship' };

// ─── Single matchup cell (used in desktop bracket + Final Four) ────────────────
function MatchupCell({ matchup }) {
  if (!matchup) return <div className="bracket-cell empty" />;

  const { team1, team2, status, winnerId, votes, id } = matchup;
  const total = (votes?.team1 || 0) + (votes?.team2 || 0);
  const pct1 = total ? Math.round((votes.team1 / total) * 100) : 50;
  const pct2 = total ? 100 - pct1 : 50;
  const isActive = status === 'active';
  const isClosed = status === 'closed';

  const TeamRow = ({ team, slot, pct }) => {
    const isWinner = isClosed && winnerId === team?.id;
    const isLoser = isClosed && winnerId && winnerId !== team?.id;
    return (
      <div className={`bracket-team ${isWinner ? 'winner' : ''} ${isLoser ? 'loser' : ''} ${!team ? 'tbd' : ''}`}>
        {team?.seed && <span className="bracket-team-seed">{team.seed}</span>}
        <div className="bracket-team-img">
          {team?.image
            ? <img src={team.image} alt={team.name} />
            : <span>{team ? team.name?.[0] || '?' : '?'}</span>}
        </div>
        <div className="bracket-team-name">{team?.name || 'TBD'}</div>
        {isClosed && total > 0 && (
          <div className={`bracket-team-pct ${slot === 'team1' ? 'pct1' : 'pct2'}`}>{pct}%</div>
        )}
        {isWinner && <span className="winner-crown">♛</span>}
      </div>
    );
  };

  const canVote = isActive && team1 && team2;
  const inner = (
    <>
      <TeamRow team={team1} slot="team1" pct={pct1} />
      <div className="bracket-divider" />
      <TeamRow team={team2} slot="team2" pct={pct2} />
      {isClosed && total > 0 && (
        <div className="bracket-vote-bar">
          <div className="bracket-vote-fill" style={{ width: `${pct1}%` }} />
        </div>
      )}
    </>
  );

  if (canVote) {
    return (
      <Link to={`/vote/${id}`} className="bracket-cell active" style={{ textDecoration: 'none' }}>
        {inner}
      </Link>
    );
  }

  return (
    <div className={`bracket-cell ${isClosed ? 'closed' : ''}`}>
      {inner}
    </div>
  );
}

// ─── Mobile card for a single matchup — large photo style ────────────────────
function MobileMatchupCard({ matchup }) {
  const { team1, team2, status, winnerId, votes, id } = matchup;
  const total = (votes?.team1 || 0) + (votes?.team2 || 0);
  const pct1 = total ? Math.round((votes.team1 / total) * 100) : 50;
  const pct2 = total ? 100 - pct1 : 50;
  const isActive = status === 'active';
  const isClosed = status === 'closed';
  const canVote = isActive && team1 && team2;

  const isWinner1 = isClosed && winnerId === team1?.id;
  const isWinner2 = isClosed && winnerId === team2?.id;

  const cardContent = (
    <div className={`mc-card ${isActive ? 'mc-active' : ''} ${isClosed ? 'mc-closed' : ''}`}>
      {/* Two-photo arena */}
      <div className="mc-arena">
        {/* Team 1 half */}
        <div className={`mc-half mc-half-1 ${isWinner1 ? 'mc-winner' : ''} ${isClosed && !isWinner1 ? 'mc-loser' : ''}`}>
          {team1?.image
            ? <img src={team1.image} alt={team1.name} className="mc-photo" />
            : <div className="mc-photo-placeholder"><span>{team1?.name?.[0] || '?'}</span></div>}
          <div className="mc-half-overlay mc-overlay-1" />
          <div className="mc-team-label mc-label-1">
            {team1?.seed && <span className="mc-seed">#{team1.seed}</span>}
            <span className="mc-name">{team1?.name || 'TBD'}</span>
            {isWinner1 && <span className="mc-crown">♛</span>}
            {(isActive || isClosed) && total > 0 && (
              <span className="mc-pct">{pct1}%</span>
            )}
          </div>
        </div>

        {/* VS badge */}
        <div className="mc-vs-wrap">
          <div className="mc-vs">
            {isActive ? <span className="mc-vs-live">VOTE</span> : 'VS'}
          </div>
        </div>

        {/* Team 2 half */}
        <div className={`mc-half mc-half-2 ${isWinner2 ? 'mc-winner' : ''} ${isClosed && !isWinner2 ? 'mc-loser' : ''}`}>
          {team2?.image
            ? <img src={team2.image} alt={team2.name} className="mc-photo" />
            : <div className="mc-photo-placeholder"><span>{team2?.name?.[0] || '?'}</span></div>}
          <div className="mc-half-overlay mc-overlay-2" />
          <div className="mc-team-label mc-label-2">
            {team2?.seed && <span className="mc-seed">#{team2.seed}</span>}
            <span className="mc-name">{team2?.name || 'TBD'}</span>
            {isWinner2 && <span className="mc-crown">♛</span>}
            {(isActive || isClosed) && total > 0 && (
              <span className="mc-pct">{pct2}%</span>
            )}
          </div>
        </div>
      </div>

      {/* Vote bar across the bottom */}
      {total > 0 && (
        <div className="mc-bar-wrap">
          <div className="mc-bar-fill" style={{ width: `${pct1}%` }} />
        </div>
      )}
    </div>
  );

  if (canVote) {
    return <Link to={`/vote/${id}`} style={{ textDecoration: 'none', display: 'block' }}>{cardContent}</Link>;
  }
  return cardContent;
}

// ─── Mobile matchup list — only shows rounds up to the current active round ───
function MobileMatchupList({ matchups }) {
  const allRounds = [...new Set(matchups.map(m => m.round))].sort((a, b) => a - b);

  // Find the highest round with at least one active or closed matchup
  const activeRound = allRounds.reduceRight((found, r) => {
    if (found) return found;
    return matchups.some(m => m.round === r && (m.status === 'active' || m.status === 'closed')) ? r : null;
  }, null);

  // Show only rounds that have started (active or closed matchups).
  // If nothing has started yet, show round 1 as a preview.
  const cutoffRound = activeRound ?? allRounds[0];

  const visibleRounds = allRounds.filter(r => r <= cutoffRound);

  return (
    <div className="mobile-matchup-list">
      {visibleRounds.map(round => (
        <div key={round} className="mobile-round-group">
          <h4 className="mobile-round-heading">{ROUND_NAMES[round] || `Round ${round}`}</h4>
          {matchups
            .filter(m => m.round === round)
            .sort((a, b) => a.position - b.position)
            .map(m => <MobileMatchupCard key={m.id} matchup={m} />)}
        </div>
      ))}
    </div>
  );
}

// ─── Region bracket (4 rounds, horizontal — desktop only) ─────────────────────
function RegionBracket({ region, matchups }) {
  const GAME_H = 82;
  const COL_W = 168;
  const COL_GAP = 28;
  const rounds = [1, 2, 3, 4];
  const baseCount = 8;
  const totalH = baseCount * GAME_H;

  const matchupsByRound = {};
  rounds.forEach(r => {
    matchupsByRound[r] = matchups
      .filter(m => m.round === r)
      .sort((a, b) => a.position - b.position);
  });

  function getTop(round, position) {
    const gamesInRound = Math.pow(2, 4 - round);
    const slotH = totalH / gamesInRound;
    return (position - 1) * slotH + (slotH - GAME_H) / 2;
  }

  return (
    <div className="region-bracket-wrap">
      <h3 className="region-title">{region.name}</h3>
      <p className="region-vote-hint">Tap on each matchup to vote</p>

      {/* Desktop bracket */}
      <div className="desktop-bracket">
        <div className="region-bracket-labels">
          {rounds.map(r => (
            <div key={r} className="region-round-label" style={{ width: COL_W, marginRight: r < 4 ? COL_GAP : 0 }}>
              {ROUND_NAMES[r]}
            </div>
          ))}
        </div>
        <div className="region-bracket" style={{ height: totalH, position: 'relative' }}>
          <svg className="bracket-svg" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' }}>
            {rounds.slice(0, 3).map(round => {
              const games = matchupsByRound[round] || [];
              return games.map(m => {
                const x1 = (round - 1) * (COL_W + COL_GAP) + COL_W;
                const y1 = getTop(round, m.position) + GAME_H / 2;
                const partnerPos = m.position % 2 === 1 ? m.position + 1 : m.position - 1;
                const y2 = getTop(round, partnerPos) + GAME_H / 2;
                const xMid = x1 + COL_GAP / 2;
                const yMid = (y1 + y2) / 2;
                const isActive = m.status !== 'pending';
                return (
                  <g key={m.id}>
                    <line x1={x1} y1={y1} x2={xMid} y2={y1} stroke={isActive ? '#4a3a18' : '#2e2535'} strokeWidth="1.5" />
                    <line x1={xMid} y1={y1} x2={xMid} y2={yMid} stroke={isActive ? '#4a3a18' : '#2e2535'} strokeWidth="1.5" />
                  </g>
                );
              });
            })}
            {rounds.slice(1, 4).map(round => {
              const games = matchupsByRound[round] || [];
              return games.map(m => {
                const x2 = (round - 1) * (COL_W + COL_GAP);
                const y2 = getTop(round, m.position) + GAME_H / 2;
                const xMid = x2 - COL_GAP / 2;
                const isActive = m.status !== 'pending';
                return (
                  <g key={`into-${m.id}`}>
                    <line x1={xMid} y1={y2} x2={x2} y2={y2} stroke={isActive ? '#4a3a18' : '#2e2535'} strokeWidth="1.5" />
                  </g>
                );
              });
            })}
          </svg>

          {rounds.map(round => (
            matchupsByRound[round]?.map(m => (
              <div
                key={m.id}
                style={{
                  position: 'absolute',
                  top: getTop(round, m.position),
                  left: (round - 1) * (COL_W + COL_GAP),
                  width: COL_W,
                  height: GAME_H
                }}
              >
                <MatchupCell matchup={m} />
              </div>
            ))
          ))}
        </div>
      </div>

      {/* Mobile list view */}
      <MobileMatchupList matchups={matchups} regionName={region.name} />
    </div>
  );
}

// ─── Final Four + Championship ────────────────────────────────────────────────
function FinalFour({ matchups }) {
  const ff1 = matchups.find(m => m.id === 'ff_r5_p1');
  const ff2 = matchups.find(m => m.id === 'ff_r5_p2');
  const champ = matchups.find(m => m.id === 'ff_r6_p1');

  return (
    <div className="final-four-section">
      <h2 className="final-four-title">⚔ Final Four &amp; Championship ⚔</h2>
      <div className="final-four-grid">
        <div className="ff-col">
          <div className="ff-round-label">Final Four</div>
          {ff1 ? <MatchupCell matchup={ff1} /> : <div className="bracket-cell empty"><span>TBD</span></div>}
          <div style={{ height: 32 }} />
          {ff2 ? <MatchupCell matchup={ff2} /> : <div className="bracket-cell empty"><span>TBD</span></div>}
        </div>
        <div className="ff-center-arrow">⟹</div>
        <div className="ff-col">
          <div className="ff-round-label championship-label">Championship</div>
          <div style={{ marginTop: 40 }}>
            {champ ? <MatchupCell matchup={champ} /> : <div className="bracket-cell empty"><span>TBD</span></div>}
          </div>
        </div>
      </div>

      {/* Mobile Final Four list */}
      <div className="mobile-ff-list">
        <div className="mobile-round-group">
          <h4 className="mobile-round-heading">Final Four</h4>
          {ff1 && <MobileMatchupCard matchup={ff1} />}
          {ff2 && <MobileMatchupCard matchup={ff2} />}
        </div>
        <div className="mobile-round-group">
          <h4 className="mobile-round-heading">Championship</h4>
          {champ && <MobileMatchupCard matchup={champ} />}
        </div>
      </div>
    </div>
  );
}

// ─── Active matchups bar ───────────────────────────────────────────────────────
function ActiveMatchups({ matchups }) {
  const active = matchups.filter(m => m.status === 'active' && m.team1 && m.team2);
  if (!active.length) return null;
  return (
    <div className="active-matchups-bar">
      <div className="active-bar-label">🗡 Open Voting</div>
      {active.map(m => (
        <Link key={m.id} to={`/vote/${m.id}`} className="active-matchup-chip">
          <span>{m.team1?.name}</span>
          <span className="vs-chip">vs</span>
          <span>{m.team2?.name}</span>
        </Link>
      ))}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function BracketPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('region1');

  useEffect(() => {
    getTournament()
      .then(setData)
      .catch(e => setError(e.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading-wrap"><div className="loading-ring" /><span>Loading the Bracket…</span></div>;
  if (error) return <div className="page"><div className="error-msg">{error}</div></div>;

  const { settings, regions, matchups } = data;
  const hasMatchups = matchups.length > 0;

  const tabs = [
    ...regions.map(r => ({ id: r.id, label: r.name })),
    { id: 'finals', label: '⚔ Finals' }
  ];

  return (
    <div className="page">
      <div className="page-title">{settings.name}</div>
      <div className="page-subtitle">{settings.year} Tournament Bracket</div>

      {!hasMatchups ? (
        <div className="bracket-empty-state">
          <div className="empty-icon">🗡</div>
          <h2>Tournament Setup In Progress</h2>
          <p>The bracket will appear here once the tournament has been initialized by an admin.</p>
        </div>
      ) : (
        <>
          <ActiveMatchups matchups={matchups} />

          <div className="tabs">
            {tabs.map(t => (
              <button key={t.id} className={`tab-btn ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'finals' ? (
            <FinalFour matchups={matchups} />
          ) : (
            <div className="region-panel">
              {regions.filter(r => r.id === tab).map(region => (
                <RegionBracket
                  key={region.id}
                  region={region}
                  matchups={matchups.filter(m => m.regionId === region.id)}
                />
              ))}
            </div>
          )}
        </>
      )}

      <style>{`
        /* ─ Bracket ──────────────────────────────────────────── */
        .bracket-empty-state {
          text-align: center;
          padding: 80px 20px;
          color: var(--text-dim);
        }
        .bracket-empty-state .empty-icon { font-size: 4rem; margin-bottom: 16px; }
        .bracket-empty-state h2 { font-family: var(--font-heading); color: var(--gold-dim); margin-bottom: 8px; }

        .region-panel { overflow-x: auto; padding-bottom: 24px; }
        .region-bracket-wrap { min-width: 0; }

        .region-title {
          font-family: var(--font-title);
          font-size: 1.3rem;
          color: var(--gold);
          margin-bottom: 4px;
          letter-spacing: 0.05em;
        }
        .region-vote-hint {
          font-family: var(--font-heading);
          font-size: 0.72rem;
          color: var(--text-muted);
          letter-spacing: 0.12em;
          text-transform: uppercase;
          margin-bottom: 10px;
        }

        /* ── Desktop bracket (hidden on mobile) ─────────────── */
        .desktop-bracket { min-width: 760px; }
        .region-bracket-labels {
          display: flex;
          margin-bottom: 8px;
        }
        .region-round-label {
          font-family: var(--font-heading);
          font-size: 0.65rem;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: var(--text-muted);
          text-align: center;
        }
        .region-bracket { user-select: none; }
        .bracket-svg { z-index: 0; }

        /* ── Mobile matchup list (hidden on desktop) ─────────── */
        .mobile-matchup-list { display: none; }
        .mobile-ff-list { display: none; }

        @media (max-width: 640px) {
          .desktop-bracket { display: none; }
          .region-vote-hint { display: none; }
          .mobile-matchup-list { display: flex; flex-direction: column; gap: 10px; }
          .mobile-ff-list { display: flex; flex-direction: column; gap: 16px; margin-top: 8px; }

          /* hide the desktop ff grid on mobile */
          .final-four-grid { display: none; }
        }

        /* ── Mobile round groups ─────────────────────────────── */
        .mobile-round-group { display: flex; flex-direction: column; gap: 10px; }
        .mobile-round-heading {
          font-family: var(--font-heading);
          font-size: 0.7rem;
          text-transform: uppercase;
          letter-spacing: 0.14em;
          color: var(--text-muted);
          margin: 8px 0 4px;
          padding-bottom: 4px;
          border-bottom: 1px solid var(--border);
        }

        /* ── Mobile photo-arena card ─────────────────────────── */
        .mc-card {
          border-radius: var(--radius);
          overflow: hidden;
          border: 1px solid var(--border);
          transition: border-color 0.18s, box-shadow 0.18s;
        }
        .mc-card.mc-active {
          border-color: var(--gold-dim);
          box-shadow: 0 0 12px rgba(212,175,55,0.18);
        }
        .mc-card.mc-closed { opacity: 0.9; }

        /* Two-photo arena */
        .mc-arena {
          display: flex;
          height: 130px;
          position: relative;
        }

        .mc-half {
          flex: 1;
          position: relative;
          overflow: hidden;
        }
        .mc-half.mc-loser { filter: grayscale(0.6); opacity: 0.6; }
        .mc-half.mc-winner { flex: 1.1; }

        .mc-photo {
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center top;
          display: block;
        }
        .mc-photo-placeholder {
          width: 100%;
          height: 100%;
          background: var(--bg-mid);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .mc-photo-placeholder span {
          font-family: var(--font-title);
          font-size: 3rem;
          color: var(--border);
        }

        /* Gradient overlays for text legibility */
        .mc-half-overlay {
          position: absolute;
          inset: 0;
          pointer-events: none;
        }
        .mc-overlay-1 {
          background:
            linear-gradient(to right, rgba(8,6,8,0.15) 0%, transparent 60%),
            linear-gradient(to top, rgba(8,6,8,0.85) 0%, transparent 55%);
        }
        .mc-overlay-2 {
          background:
            linear-gradient(to left, rgba(8,6,8,0.15) 0%, transparent 60%),
            linear-gradient(to top, rgba(8,6,8,0.85) 0%, transparent 55%);
        }

        /* Team label at bottom of each half */
        .mc-team-label {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          padding: 8px 10px;
          display: flex;
          flex-direction: column;
          gap: 1px;
          z-index: 2;
        }
        .mc-label-2 { text-align: right; }

        .mc-seed {
          font-family: var(--font-heading);
          font-size: 0.58rem;
          color: rgba(255,255,255,0.5);
          line-height: 1;
        }
        .mc-name {
          font-family: var(--font-title);
          font-size: 0.95rem;
          color: #fff;
          line-height: 1.1;
          text-shadow: 0 1px 6px rgba(0,0,0,0.9);
        }
        .mc-half.mc-winner .mc-name { color: var(--gold); }

        .mc-crown {
          font-size: 0.75rem;
          color: var(--gold);
          line-height: 1;
        }
        .mc-pct {
          font-family: var(--font-heading);
          font-size: 1rem;
          color: var(--gold);
          font-weight: 700;
          text-shadow: 0 0 12px rgba(212,175,55,0.6);
          line-height: 1;
        }

        /* VS badge in the center */
        .mc-vs-wrap {
          position: absolute;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          z-index: 10;
        }
        .mc-vs {
          width: 64px;
          height: 64px;
          border-radius: 50%;
          background: var(--bg-deepest);
          border: 2px solid var(--border-gold);
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: var(--font-heading);
          font-size: 1rem;
          color: var(--gold);
          letter-spacing: 0.06em;
          box-shadow: 0 0 24px rgba(0,0,0,0.9), 0 0 16px rgba(212,175,55,0.2);
        }
        .mc-vs-live {
          font-size: 0.75rem;
          letter-spacing: 0.1em;
          color: var(--gold);
          animation: pulse 2s ease-in-out infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        /* Vote percentage bar */
        .mc-bar-wrap {
          height: 3px;
          background: var(--bg-hover);
        }
        .mc-bar-fill {
          height: 100%;
          background: linear-gradient(to right, #7a5f14, var(--gold));
          transition: width 0.5s cubic-bezier(0.4,0,0.2,1);
        }

        /* ─ Cell ─────────────────────────────────────────────── */
        .bracket-cell {
          position: relative;
          width: 100%;
          height: 100%;
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 5px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          z-index: 1;
          transition: border-color 0.18s;
        }
        .bracket-cell.active {
          border-color: var(--gold-dim);
          box-shadow: 0 0 8px rgba(212,175,55,0.15);
        }
        .bracket-cell.closed { opacity: 0.85; }
        .bracket-cell.empty {
          background: transparent;
          border-color: var(--border);
          border-style: dashed;
          opacity: 0.4;
          align-items: center;
          justify-content: center;
          color: var(--text-muted);
          font-size: 0.7rem;
        }

        .bracket-team {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 3px 6px;
          position: relative;
          transition: background 0.15s;
        }
        .bracket-team-seed {
          font-family: var(--font-heading);
          font-size: 0.58rem;
          color: var(--text-muted);
          min-width: 14px;
          flex-shrink: 0;
          text-align: right;
          line-height: 1;
        }
        .bracket-team.winner .bracket-team-seed { color: var(--gold-dim); }
        .bracket-team.winner { background: rgba(212,175,55,0.1); }
        .bracket-team.loser { opacity: 0.5; }
        .bracket-team.tbd { opacity: 0.4; }

        .bracket-team-img {
          width: 24px;
          height: 24px;
          border-radius: 3px;
          overflow: hidden;
          flex-shrink: 0;
          background: var(--bg-mid);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.8rem;
          color: var(--text-muted);
        }
        .bracket-team-img img { width: 100%; height: 100%; object-fit: cover; }

        .bracket-team-name {
          font-family: var(--font-heading);
          font-size: 0.68rem;
          color: var(--text);
          flex: 1;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          line-height: 1.2;
        }
        .bracket-team.winner .bracket-team-name { color: var(--gold); }

        .bracket-team-pct {
          font-size: 0.62rem;
          color: var(--text-muted);
          flex-shrink: 0;
        }
        .bracket-team-pct.pct1 { color: var(--gold-dim); }

        .winner-crown {
          font-size: 0.75rem;
          color: var(--gold);
          flex-shrink: 0;
        }

        .bracket-divider {
          height: 1px;
          background: var(--border);
          margin: 0 4px;
        }

        a.bracket-cell.active:hover {
          border-color: var(--gold);
          box-shadow: 0 0 14px rgba(212,175,55,0.25);
        }

        .bracket-vote-bar {
          height: 2px;
          background: var(--bg-hover);
          margin-top: 1px;
        }
        .bracket-vote-fill {
          height: 100%;
          background: var(--gold);
          transition: width 0.4s;
        }

        /* ─ Active matchups bar ────────────────────────────── */
        .active-matchups-bar {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 10px;
          background: rgba(212,175,55,0.06);
          border: 1px solid var(--border-gold);
          border-radius: var(--radius);
          padding: 10px 16px;
          margin-bottom: 24px;
        }
        .active-bar-label {
          font-family: var(--font-heading);
          font-size: 0.75rem;
          color: var(--gold);
          letter-spacing: 0.1em;
          text-transform: uppercase;
          white-space: nowrap;
        }
        .active-matchup-chip {
          display: flex;
          align-items: center;
          gap: 6px;
          background: var(--bg-card);
          border: 1px solid var(--border-gold);
          border-radius: 20px;
          padding: 4px 12px;
          font-family: var(--font-heading);
          font-size: 0.72rem;
          color: var(--text);
          text-decoration: none;
          transition: all 0.15s;
        }
        .active-matchup-chip:hover { border-color: var(--gold); color: var(--gold); text-decoration: none; box-shadow: var(--shadow-gold); }
        .vs-chip { color: var(--text-muted); font-size: 0.6rem; }

        /* ─ Tabs ───────────────────────────────────────────── */
        @media (max-width: 640px) {
          .tabs {
            overflow-x: auto;
            flex-wrap: nowrap;
            -webkit-overflow-scrolling: touch;
            scrollbar-width: none;
          }
          .tabs::-webkit-scrollbar { display: none; }
          .tab-btn {
            white-space: nowrap;
            flex-shrink: 0;
            padding: 10px 14px;
            font-size: 0.72rem;
          }
        }

        /* ─ Active matchups bar mobile ─────────────────────── */
        @media (max-width: 640px) {
          .active-matchups-bar {
            flex-wrap: nowrap;
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
            scrollbar-width: none;
            padding: 8px 12px;
          }
          .active-matchups-bar::-webkit-scrollbar { display: none; }
          .active-matchup-chip {
            flex-shrink: 0;
            font-size: 0.68rem;
            padding: 4px 10px;
          }
          .active-bar-label { flex-shrink: 0; }
        }

        /* ─ Final Four ─────────────────────────────────────── */
        .final-four-section { padding: 20px 0; }
        .final-four-title {
          font-family: var(--font-title);
          font-size: 1.4rem;
          color: var(--gold);
          text-align: center;
          margin-bottom: 32px;
          text-shadow: var(--shadow-gold);
        }
        .final-four-grid {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 24px;
          flex-wrap: wrap;
        }
        .ff-col { display: flex; flex-direction: column; align-items: center; min-width: 200px; }
        .ff-round-label {
          font-family: var(--font-heading);
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: var(--text-dim);
          margin-bottom: 12px;
        }
        .championship-label { color: var(--gold); }
        .ff-center-arrow { font-size: 2rem; color: var(--gold-dim); }
        .ff-col .bracket-cell { width: 200px; min-height: 82px; }

        @media (max-width: 640px) {
          .final-four-title { font-size: 1.1rem; margin-bottom: 0; }
        }
      `}</style>
    </div>
  );
}

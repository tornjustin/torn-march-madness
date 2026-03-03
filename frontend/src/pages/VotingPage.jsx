import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getMatchup, vote as castVote, getVoteStatus } from '../api';
import { ensureVoterToken } from '../utils/voter';

export default function VotingPage() {
  const { matchupId } = useParams();
  const [matchup, setMatchup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [votedFor, setVotedFor] = useState(null);    // teamId voted for
  const [votes, setVotes] = useState(null);           // { team1, team2 }
  const [voting, setVoting] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [hoveredSide, setHoveredSide] = useState(null);
  const showResultRef = useRef(showResult);

  // Keep ref in sync for use inside intervals
  useEffect(() => { showResultRef.current = showResult; }, [showResult]);

  const load = useCallback(async () => {
    await ensureVoterToken();
    try {
      const [m, status] = await Promise.all([
        getMatchup(matchupId),
        getVoteStatus(matchupId)
      ]);
      setMatchup(m);
      setVotes(m.votes);
      if (status.voted) {
        setVotedFor(status.teamId);
        setShowResult(true);
      }
    } catch (e) {
      setError(e.error || e.message || 'Failed to load matchup');
    } finally {
      setLoading(false);
    }
  }, [matchupId]);

  // Initial load + poll for updated counts when result is shown
  // Pauses polling when the tab is hidden to save battery
  useEffect(() => {
    load();

    const interval = setInterval(() => {
      if (showResultRef.current && !document.hidden) {
        getMatchup(matchupId).then(m => setVotes(m.votes)).catch(() => {});
      }
    }, 8000);

    const handleVisibility = () => {
      // Re-fetch immediately when tab becomes visible again
      if (!document.hidden && showResultRef.current) {
        getMatchup(matchupId).then(m => setVotes(m.votes)).catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [load, matchupId]);

  async function handleVote(teamId) {
    if (voting || votedFor || matchup?.status !== 'active') return;
    setVoting(true);
    try {
      const result = await castVote(matchupId, teamId);
      setVotedFor(teamId);
      setVotes(result.votes);
      setShowResult(true);
    } catch (e) {
      if (e.alreadyVoted) {
        setVotedFor(e.teamId || teamId);
        setShowResult(true);
      } else {
        setError(e.error || 'Vote failed');
      }
    } finally {
      setVoting(false);
    }
  }

  if (loading) return <div className="loading-wrap"><div className="loading-ring" /><span>Loading matchup…</span></div>;
  if (error && !matchup) return <div className="page"><div className="error-msg">{error}</div><Link to="/" className="btn btn-outline" style={{ marginTop: 16 }}>← Back to Bracket</Link></div>;

  const { team1, team2, status, roundLabel, round } = matchup;
  const total = (votes?.team1 || 0) + (votes?.team2 || 0);
  const pct1 = total ? Math.round((votes.team1 / total) * 100) : 50;
  const pct2 = total ? 100 - pct1 : 50;
  const canVote = status === 'active' && !votedFor && !voting;
  const isClosed = status === 'closed';

  function TeamSide({ team, slot, pct, isMyVote }) {
    const isLeading = showResult && pct >= 50;
    const isHovered = hoveredSide === slot;

    return (
      <div
        className={`vote-side ${slot} ${isMyVote ? 'my-vote' : ''} ${canVote ? 'can-vote' : ''} ${isHovered && canVote ? 'hovered' : ''}`}
        onClick={() => canVote && team && handleVote(team.id)}
        onMouseEnter={() => setHoveredSide(slot)}
        onMouseLeave={() => setHoveredSide(null)}
      >
        {/* Photo */}
        <div className="vote-photo-wrap">
          {team?.image
            ? <img src={team.image} alt={team.name} className="vote-photo" />
            : <div className="vote-photo-placeholder">
                <span className="photo-initial">{team?.name?.[0] || '?'}</span>
              </div>
          }
          {/* Gradient overlay */}
          <div className={`vote-photo-overlay ${slot}`} />
        </div>

        {/* Content */}
        <div className="vote-content">
          {isMyVote && <div className="voted-badge">✓ Your Vote</div>}
          <div className="vote-team-name">{team?.name || 'TBD'}</div>
          {team?.description && <div className="vote-team-desc">{team.description}</div>}

          {showResult && total > 0 && (
            <div className="vote-result-block">
              <div className="vote-result-pct">{pct}%</div>
              {isLeading && <div className="leading-badge">Leading</div>}
            </div>
          )}

          {canVote && team && !showResult && (
            <button className={`vote-btn ${slot}`} onClick={e => { e.stopPropagation(); handleVote(team.id); }}>
              {voting ? 'Voting…' : `Vote for ${team.name}`}
            </button>
          )}
        </div>

        {/* Seed badge */}
        {team?.seed && <div className="seed-badge">#{team.seed}</div>}
      </div>
    );
  }

  return (
    <div className="voting-page">
      {/* Header */}
      <div className="vote-header">
        <Link to="/" className="vote-back-link">← Bracket</Link>
        <div className="vote-round-label">{roundLabel || `Round ${round}`}</div>
        {isClosed && <div className="vote-closed-badge">Voting Closed</div>}
        {status === 'pending' && <div className="vote-pending-badge">Not Yet Open</div>}
      </div>

      {/* Arena */}
      <div className="vote-arena">
        {/* Team 1 */}
        <TeamSide
          team={team1}
          slot="team1"
          pct={pct1}
          isMyVote={votedFor === team1?.id}
        />

        {/* VS Divider */}
        <div className="vs-divider">
          <div className="vs-line top" />
          <div className="vs-circle">
            {voting ? <div className="vs-spinner" /> : 'VS'}
          </div>
          <div className="vs-line bottom" />
        </div>

        {/* Team 2 */}
        <TeamSide
          team={team2}
          slot="team2"
          pct={pct2}
          isMyVote={votedFor === team2?.id}
        />
      </div>

      {/* Vote bar (shown after voting) */}
      {showResult && total > 0 && (
        <div className="vote-result-bar-wrap">
          <div className="vote-result-bar">
            <div className="result-bar-team1" style={{ width: `${pct1}%` }}>
              <span>{pct1}%</span>
            </div>
            <div className="result-bar-team2" style={{ width: `${pct2}%` }}>
              <span>{pct2}%</span>
            </div>
          </div>
          <div className="result-bar-labels">
            <span>{team1?.name}</span>
            <span>{team2?.name}</span>
          </div>
        </div>
      )}

      {/* Status messages */}
      {!canVote && !showResult && status === 'active' && !team1 && (
        <div className="vote-status-msg">Teams have not been assigned yet.</div>
      )}
      {status === 'pending' && (
        <div className="vote-status-msg">This matchup hasn't opened for voting yet. Check back soon!</div>
      )}

      <style>{`
        .voting-page {
          min-height: calc(100vh - 64px);
          display: flex;
          flex-direction: column;
          background: var(--bg-deepest);
        }

        .vote-header {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 12px 24px;
          background: var(--bg-dark);
          border-bottom: 1px solid var(--border);
          flex-shrink: 0;
        }
        .vote-back-link {
          font-family: var(--font-heading);
          font-size: 0.8rem;
          color: var(--text-dim);
          text-decoration: none;
          letter-spacing: 0.06em;
        }
        .vote-back-link:hover { color: var(--gold); text-decoration: none; }
        .vote-round-label {
          font-family: var(--font-heading);
          font-size: 0.9rem;
          color: var(--gold);
          letter-spacing: 0.1em;
          text-transform: uppercase;
          flex: 1;
          text-align: center;
        }
        .vote-closed-badge {
          background: rgba(139,32,32,0.3);
          color: #c05050;
          border: 1px solid var(--red);
          border-radius: 20px;
          padding: 2px 12px;
          font-size: 0.72rem;
          font-family: var(--font-heading);
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .vote-pending-badge {
          background: rgba(90,80,69,0.3);
          color: var(--text-muted);
          border: 1px solid var(--text-muted);
          border-radius: 20px;
          padding: 2px 12px;
          font-size: 0.72rem;
          font-family: var(--font-heading);
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        /* ─ Arena ─────────────────────────────────────────── */
        .vote-arena {
          flex: 1;
          display: flex;
          align-items: stretch;
          min-height: calc(100vh - 200px);
          position: relative;
        }

        .vote-side {
          flex: 1;
          position: relative;
          overflow: hidden;
          cursor: default;
          transition: flex 0.5s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .vote-side.can-vote { cursor: pointer; }
        .vote-side.hovered { flex: 1.08; }
        .vote-side.my-vote { box-shadow: inset 0 0 0 3px var(--gold); }

        /* Photo */
        .vote-photo-wrap {
          position: absolute;
          inset: 0;
          z-index: 0;
        }
        .vote-photo {
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center top;
          transition: transform 0.5s ease;
        }
        .vote-side.hovered .vote-photo { transform: scale(1.04); }
        .vote-photo-placeholder {
          width: 100%;
          height: 100%;
          background: var(--bg-mid);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .photo-initial {
          font-family: var(--font-title);
          font-size: 8rem;
          color: var(--border);
          line-height: 1;
        }

        /* Gradient overlays */
        .vote-photo-overlay {
          position: absolute;
          inset: 0;
          pointer-events: none;
        }
        .vote-photo-overlay.team1 {
          background: linear-gradient(to right, rgba(8,6,8,0.6) 0%, transparent 40%, rgba(8,6,8,0.2) 100%),
                      linear-gradient(to top, rgba(8,6,8,0.85) 0%, transparent 60%);
        }
        .vote-photo-overlay.team2 {
          background: linear-gradient(to left, rgba(8,6,8,0.6) 0%, transparent 40%, rgba(8,6,8,0.2) 100%),
                      linear-gradient(to top, rgba(8,6,8,0.85) 0%, transparent 60%);
        }

        /* Content */
        .vote-content {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          padding: 32px 40px;
          z-index: 2;
        }
        .vote-side.team2 .vote-content { text-align: right; }

        .vote-team-name {
          font-family: var(--font-title);
          font-size: clamp(1.4rem, 3vw, 2.6rem);
          color: #fff;
          text-shadow: 0 2px 12px rgba(0,0,0,0.8);
          line-height: 1.1;
          margin-bottom: 4px;
        }
        .vote-team-desc {
          font-size: 0.9rem;
          color: rgba(255,255,255,0.6);
          margin-bottom: 16px;
          font-style: italic;
        }

        .voted-badge {
          display: inline-block;
          background: rgba(212,175,55,0.2);
          border: 1px solid var(--gold);
          color: var(--gold);
          font-family: var(--font-heading);
          font-size: 0.72rem;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          padding: 3px 12px;
          border-radius: 20px;
          margin-bottom: 10px;
        }

        .vote-result-block {
          margin-bottom: 16px;
        }
        .vote-result-pct {
          font-family: var(--font-heading);
          font-size: clamp(2rem, 5vw, 4rem);
          color: var(--gold);
          line-height: 1;
          text-shadow: 0 0 30px rgba(212,175,55,0.5);
        }
        .leading-badge {
          display: inline-block;
          background: rgba(39,165,90,0.25);
          border: 1px solid var(--green-bright);
          color: var(--green-bright);
          font-family: var(--font-heading);
          font-size: 0.7rem;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          padding: 2px 10px;
          border-radius: 20px;
          margin-top: 6px;
        }

        .vote-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 12px 28px;
          border-radius: 4px;
          font-size: 0.9rem;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          border: none;
          cursor: pointer;
          transition: all 0.18s;
        }
        .vote-btn.team1 {
          background: linear-gradient(135deg, var(--gold), #a07c1a);
          color: #0a0807;
        }
        .vote-btn.team2 {
          background: linear-gradient(135deg, #4a80b0, #2a5070);
          color: #fff;
        }
        .vote-btn:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,0.4); }

        .seed-badge {
          position: absolute;
          top: 16px;
          font-family: var(--font-heading);
          font-size: 0.75rem;
          color: rgba(255,255,255,0.5);
          background: rgba(0,0,0,0.4);
          border: 1px solid rgba(255,255,255,0.15);
          border-radius: 4px;
          padding: 2px 8px;
          z-index: 3;
        }
        .vote-side.team1 .seed-badge { left: 16px; }
        .vote-side.team2 .seed-badge { right: 16px; }

        /* ─ VS Divider ─────────────────────────────────────── */
        .vs-divider {
          position: absolute;
          left: 50%;
          transform: translateX(-50%);
          top: 0;
          bottom: 0;
          width: 64px;
          display: flex;
          flex-direction: column;
          align-items: center;
          z-index: 10;
          pointer-events: none;
        }
        .vs-line {
          flex: 1;
          width: 1px;
          background: linear-gradient(to bottom, transparent, rgba(212,175,55,0.4), transparent);
        }
        .vs-circle {
          width: 52px;
          height: 52px;
          border-radius: 50%;
          background: var(--bg-deepest);
          border: 2px solid var(--border-gold);
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: var(--font-heading);
          font-size: 0.85rem;
          color: var(--gold);
          letter-spacing: 0.05em;
          flex-shrink: 0;
          box-shadow: 0 0 20px rgba(0,0,0,0.8), var(--shadow-gold);
        }
        .vs-spinner {
          width: 20px; height: 20px;
          border: 2px solid var(--border);
          border-top-color: var(--gold);
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }

        /* ─ Result bar ─────────────────────────────────────── */
        .vote-result-bar-wrap {
          padding: 16px 24px 20px;
          background: var(--bg-dark);
          border-top: 1px solid var(--border);
          flex-shrink: 0;
        }
        .vote-result-bar {
          display: flex;
          height: 24px;
          border-radius: 4px;
          overflow: hidden;
          margin-bottom: 8px;
        }
        .result-bar-team1 {
          background: linear-gradient(to right, #7a5f14, var(--gold));
          display: flex;
          align-items: center;
          justify-content: flex-start;
          padding-left: 8px;
          transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
          min-width: 40px;
        }
        .result-bar-team2 {
          background: linear-gradient(to left, #2a5070, #4a80b0);
          display: flex;
          align-items: center;
          justify-content: flex-end;
          padding-right: 8px;
          transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
          min-width: 40px;
        }
        .result-bar-team1 span, .result-bar-team2 span {
          font-family: var(--font-heading);
          font-size: 0.7rem;
          font-weight: 700;
          color: rgba(255,255,255,0.9);
        }
        .result-bar-labels {
          display: flex;
          justify-content: space-between;
          font-family: var(--font-heading);
          font-size: 0.72rem;
          color: var(--text-dim);
          letter-spacing: 0.05em;
        }

        .vote-status-msg {
          text-align: center;
          padding: 24px;
          color: var(--text-dim);
          font-family: var(--font-heading);
          font-size: 0.9rem;
          letter-spacing: 0.05em;
        }

        @media (max-width: 640px) {
          .vote-arena { flex-direction: column; min-height: auto; }
          .vote-side { min-height: 45vh; }
          .vs-divider { flex-direction: row; position: relative; left: 0; transform: none; top: auto; bottom: auto; width: 100%; height: 48px; }
          .vs-line.top, .vs-line.bottom { flex: 1; height: 1px; width: auto; background: linear-gradient(to right, transparent, rgba(212,175,55,0.4), transparent); }
          .vote-side.team2 .vote-content { text-align: left; }
          .vote-side.team2 .seed-badge { right: auto; left: 16px; }

          .vote-btn {
            width: 100%;
            justify-content: center;
            padding: 16px;
            font-size: 1rem;
            border-radius: 8px;
          }
          .vote-content {
            padding: 20px 16px;
          }
          .vote-team-name {
            font-size: 1.3rem;
          }
          .result-bar-team1 span,
          .result-bar-team2 span {
            font-size: 0.8rem;
          }
        }
      `}</style>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { getTournament } from '../api';

// ─── Layout constants ─────────────────────────────────────────────────────────
const G  = 60;              // game (cell) height px
const CW = 86;              // column width px
const CG = 10;              // column gap px
const CS = CW + CG;         // column stride = 96
const RW = 4 * CS - CG;    // region width = 374
const RH = 8 * G;           // region height = 480 (8 games in round 1)
const SG = 28;              // vertical gap between top/bottom region pair
const CTR = 112;            // center column width
const TH  = 2 * RH + SG;   // total bracket height = 988
const TW  = 2 * (RW + CG) + CTR; // total bracket width = 880

// y positions in center column
const FF1_CTR  = RH / 2;                  // 240
const FF2_CTR  = RH + SG + RH / 2;        // 748
const CHAMP_CTR = (FF1_CTR + FF2_CTR) / 2; // 494

const ROUND_LABELS = { 1:'R1', 2:'R2', 3:'R3', 4:'R4' };

// ─── Helpers ──────────────────────────────────────────────────────────────────
function colX(round, mirrored) {
  return mirrored ? (4 - round) * CS : (round - 1) * CS;
}
function gameTop(round, pos) {
  const n  = Math.pow(2, 4 - round);
  const sh = RH / n;
  return (pos - 1) * sh + (sh - G) / 2;
}
function lineColor(status) {
  return status !== 'pending' ? '#5a4820' : '#2a2035';
}

// ─── Compact bracket cell ─────────────────────────────────────────────────────
function EmbedCell({ matchup }) {
  if (!matchup) return <div className="ec ec-empty" />;
  const { team1, team2, status, winnerId, votes, id } = matchup;
  const tot = (votes?.team1 || 0) + (votes?.team2 || 0);
  const p1  = tot ? Math.round(votes.team1 / tot * 100) : 50;
  const p2  = tot ? 100 - p1 : 50;
  const isActive = status === 'active';
  const isClosed = status === 'closed';
  const canVote  = isActive && team1 && team2;

  function Row({ team, pct, isFirst }) {
    const isW = isClosed && winnerId === team?.id;
    const isL = isClosed && winnerId && winnerId !== team?.id;
    return (
      <div className={`ec-row ${isW ? 'ec-win' : ''} ${isL ? 'ec-lose' : ''} ${!team ? 'ec-tbd' : ''}`}>
        {team?.seed && <span className="ec-seed">{team.seed}</span>}
        <div className="ec-thumb">
          {team?.image
            ? <img src={team.image} alt="" />
            : <span>{team?.name?.[0] || '?'}</span>}
        </div>
        <div className="ec-name">{team?.name || 'TBD'}</div>
        {isClosed && tot > 0 && (
          <span className={`ec-pct ${isFirst ? 'ec-pct1' : ''}`}>{pct}%</span>
        )}
        {isW && <span className="ec-crown">♛</span>}
      </div>
    );
  }

  const inner = (
    <>
      <Row team={team1} pct={p1} isFirst={true} />
      <div className="ec-div" />
      <Row team={team2} pct={p2} isFirst={false} />
      {isClosed && tot > 0 && (
        <div className="ec-bar"><div className="ec-fill" style={{ width: `${p1}%` }} /></div>
      )}
    </>
  );

  if (canVote) {
    return (
      <a href={`/vote/${id}`} target="_blank" rel="noreferrer"
        className="ec ec-active" style={{ textDecoration: 'none' }}>
        {inner}
      </a>
    );
  }
  return <div className={`ec ${isClosed ? 'ec-closed' : ''}`}>{inner}</div>;
}

// ─── Region bracket (one half) ────────────────────────────────────────────────
// mirrored=false → rounds go left→right (left side of bracket)
// mirrored=true  → rounds go right→left (right side, facing center)
function EmbedRegion({ region, matchups, mirrored }) {
  const byRound = {};
  [1, 2, 3, 4].forEach(r => {
    byRound[r] = matchups
      .filter(m => m.round === r)
      .sort((a, b) => a.position - b.position);
  });

  return (
    <div style={{ position: 'relative', width: RW, height: RH }}>

      {/* Round column labels */}
      {[1, 2, 3, 4].map(r => (
        <div key={r} style={{
          position: 'absolute',
          top: -17,
          left: colX(r, mirrored),
          width: CW,
          textAlign: 'center',
          fontFamily: '"EB Garamond", serif',
          fontSize: '0.6rem',
          color: 'rgba(201,162,39,0.5)',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          pointerEvents: 'none',
        }}>
          {ROUND_LABELS[r]}
        </div>
      ))}

      {/* SVG connector lines */}
      <svg style={{
        position: 'absolute', inset: 0,
        width: RW, height: RH,
        overflow: 'visible', pointerEvents: 'none', zIndex: 0
      }}>
        {/* Outgoing half-connector from each non-final-round game */}
        {[1, 2, 3].flatMap(r =>
          (byRound[r] || []).map(m => {
            const x1 = mirrored ? colX(r, true) : colX(r, false) + CW;
            const y1 = gameTop(r, m.position) + G / 2;
            const pp = m.position % 2 === 1 ? m.position + 1 : m.position - 1;
            const y2 = gameTop(r, pp) + G / 2;
            const xm = mirrored ? x1 - CG / 2 : x1 + CG / 2;
            const ym = (y1 + y2) / 2;
            const col = lineColor(m.status);
            return (
              <g key={m.id}>
                <line x1={x1} y1={y1} x2={xm} y2={y1} stroke={col} strokeWidth="1.5" />
                <line x1={xm} y1={y1} x2={xm} y2={ym} stroke={col} strokeWidth="1.5" />
              </g>
            );
          })
        )}

        {/* Incoming half-connector into each non-first-round game */}
        {[2, 3, 4].flatMap(r =>
          (byRound[r] || []).map(m => {
            const x2 = mirrored ? colX(r, true) + CW : colX(r, false);
            const y2 = gameTop(r, m.position) + G / 2;
            const xm = mirrored ? x2 + CG / 2 : x2 - CG / 2;
            const col = lineColor(m.status);
            return (
              <g key={`in-${m.id}`}>
                <line x1={xm} y1={y2} x2={x2} y2={y2} stroke={col} strokeWidth="1.5" />
              </g>
            );
          })
        )}
      </svg>

      {/* Game cells */}
      {[1, 2, 3, 4].flatMap(r =>
        (byRound[r] || []).map(m => (
          <div key={m.id} style={{
            position: 'absolute',
            top:  gameTop(r, m.position),
            left: colX(r, mirrored),
            width: CW, height: G, zIndex: 1
          }}>
            <EmbedCell matchup={m} />
          </div>
        ))
      )}
    </div>
  );
}

// ─── Center column: Final Four + Championship ─────────────────────────────────
// This component spans the full TH height. Its SVG uses overflow:visible to draw
// the short horizontal connector lines into the adjacent left/right R4 columns.
function EmbedCenter({ ff1, ff2, champ }) {
  const F1Y = FF1_CTR  - G / 2;   // 210  – FF1 cell top
  const F2Y = FF2_CTR  - G / 2;   // 718  – FF2 cell top
  const CY  = CHAMP_CTR - G / 2;  // 464  – Championship cell top
  const MX  = CTR / 2;            // 56   – horizontal center of column

  return (
    <div style={{ position: 'relative', width: CTR, height: TH }}>

      {/* Connector lines (overflow:visible reaches into adjacent columns) */}
      <svg style={{
        position: 'absolute', inset: 0,
        width: CTR, height: TH,
        overflow: 'visible', pointerEvents: 'none', zIndex: 0
      }}>
        {/* Horizontal from left R4 exit → FF1 left edge */}
        <line x1={-CG} y1={FF1_CTR} x2={0}   y2={FF1_CTR} stroke={lineColor(ff1?.status)} strokeWidth="1.5" />
        {/* Horizontal from right R4 exit → FF1 right edge */}
        <line x1={CTR} y1={FF1_CTR} x2={CTR + CG} y2={FF1_CTR} stroke={lineColor(ff1?.status)} strokeWidth="1.5" />

        {/* Horizontal from left R4 exit → FF2 left edge */}
        <line x1={-CG} y1={FF2_CTR} x2={0}   y2={FF2_CTR} stroke={lineColor(ff2?.status)} strokeWidth="1.5" />
        {/* Horizontal from right R4 exit → FF2 right edge */}
        <line x1={CTR} y1={FF2_CTR} x2={CTR + CG} y2={FF2_CTR} stroke={lineColor(ff2?.status)} strokeWidth="1.5" />

        {/* Vertical: FF1 bottom → Championship top */}
        <line x1={MX} y1={F1Y + G} x2={MX} y2={CY}      stroke={lineColor(champ?.status)} strokeWidth="1.5" />
        {/* Vertical: Championship bottom → FF2 top */}
        <line x1={MX} y1={CY + G}  x2={MX} y2={F2Y}     stroke={lineColor(champ?.status)} strokeWidth="1.5" />
      </svg>

      {/* Labels */}
      <div className="ec-clabel" style={{ top: F1Y - 15 }}>Final Four</div>
      <div className="ec-clabel ec-clabel-champ" style={{ top: CY - 15 }}>Championship</div>
      <div className="ec-clabel" style={{ top: F2Y - 15 }}>Final Four</div>

      {/* Cells */}
      {[{ m: ff1, top: F1Y }, { m: ff2, top: F2Y }, { m: champ, top: CY }].map(({ m, top }) =>
        m && (
          <div key={m.id} style={{
            position: 'absolute', top, left: 0,
            width: CTR, height: G, zIndex: 1
          }}>
            <EmbedCell matchup={m} />
          </div>
        )
      )}
    </div>
  );
}

// ─── Main embed page ──────────────────────────────────────────────────────────
export default function EmbedPage() {
  const [data, setData]             = useState(null);
  const [loading, setLoading]       = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  async function load() {
    try {
      setData(await getTournament());
      setLastUpdated(new Date());
    } catch (e) {
      console.error('Embed poll error', e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const iv = setInterval(() => { if (!document.hidden) load(); }, 30000);
    const onVis = () => { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', onVis); };
  }, []);

  if (loading) return (
    <div className="embed-loading">
      <div className="embed-spinner" />
      <span>Loading bracket…</span>
    </div>
  );

  if (!data?.matchups?.length) return (
    <div className="embed-loading">Bracket not yet initialized.</div>
  );

  const { settings, regions, matchups } = data;
  const [r1, r2, r3, r4] = regions;
  const ms  = id => matchups.filter(m => m.regionId === id);
  const ff1  = matchups.find(m => m.id === 'ff_r5_p1');
  const ff2  = matchups.find(m => m.id === 'ff_r5_p2');
  const champ = matchups.find(m => m.id === 'ff_r6_p1');

  // Padding above bracket to accommodate region name labels + round labels
  const TOP_PAD = 36;

  return (
    <div className="embed-root">

      {/* ── Title bar ── */}
      <div className="embed-header">
        <span className="embed-h-name">{settings.name}</span>
        <span className="embed-h-year">{settings.year}</span>
        <span className="embed-h-live">⬤ Live</span>
      </div>

      {/* ── Scrollable bracket area ── */}
      <div className="embed-scroll">
        <div style={{ position: 'relative', width: TW, height: TH + TOP_PAD }}>

          {/* Region name labels — one per quadrant */}
          {[
            { region: r1, y: 8,            left: 0,   right: 'auto', align: 'left'  },
            { region: r3, y: TOP_PAD+RH+SG+6, left: 0,   right: 'auto', align: 'left'  },
            { region: r2, y: 8,            left: 'auto', right: 0,  align: 'right' },
            { region: r4, y: TOP_PAD+RH+SG+6, left: 'auto', right: 0,  align: 'right' },
          ].map(({ region, y, left, right, align }) => region && (
            <div key={region.id} style={{
              position: 'absolute', top: y, left, right,
              fontFamily: '"Cinzel Decorative", "Cinzel", serif',
              fontSize: '0.65rem',
              color: '#c9a227',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
              textAlign: align,
              zIndex: 5,
            }}>
              {region.name}
            </div>
          ))}

          {/* Center column "Finals" label */}
          <div style={{
            position: 'absolute', top: 8, left: RW + CG, width: CTR,
            fontFamily: '"Cinzel", serif', fontSize: '0.58rem',
            color: 'rgba(201,162,39,0.6)', letterSpacing: '0.1em',
            textTransform: 'uppercase', textAlign: 'center', zIndex: 5,
          }}>
            Finals
          </div>

          {/* ── Bracket ── (offset down by TOP_PAD to clear labels) */}
          <div style={{ position: 'absolute', top: TOP_PAD, left: 0, width: TW, height: TH }}>

            {/* Left top — Region 1 */}
            <div style={{ position: 'absolute', top: 0, left: 0 }}>
              <EmbedRegion region={r1} matchups={ms(r1?.id)} mirrored={false} />
            </div>

            {/* Left bottom — Region 3 */}
            <div style={{ position: 'absolute', top: RH + SG, left: 0 }}>
              <EmbedRegion region={r3} matchups={ms(r3?.id)} mirrored={false} />
            </div>

            {/* Center — Finals */}
            <div style={{ position: 'absolute', top: 0, left: RW + CG }}>
              <EmbedCenter ff1={ff1} ff2={ff2} champ={champ} />
            </div>

            {/* Right top — Region 2 (mirrored) */}
            <div style={{ position: 'absolute', top: 0, left: RW + CG + CTR + CG }}>
              <EmbedRegion region={r2} matchups={ms(r2?.id)} mirrored={true} />
            </div>

            {/* Right bottom — Region 4 (mirrored) */}
            <div style={{ position: 'absolute', top: RH + SG, left: RW + CG + CTR + CG }}>
              <EmbedRegion region={r4} matchups={ms(r4?.id)} mirrored={true} />
            </div>
          </div>
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="embed-footer">
        {lastUpdated && <>Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · </>}
        <a href="/" target="_blank" rel="noreferrer" className="embed-vote-link">Cast your vote →</a>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@400&family=Cinzel:wght@400;600&family=EB+Garamond:wght@400;600&display=swap');

        .embed-root {
          font-family: 'EB Garamond', Georgia, serif;
          background: #0a0807;
          color: #d4b896;
          min-height: 100vh;
          display: flex;
          flex-direction: column;
        }

        /* ── Header ── */
        .embed-header {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 20px;
          background: #100d0a;
          border-bottom: 1px solid #2e2535;
          flex-shrink: 0;
        }
        .embed-h-name {
          font-family: 'Cinzel', serif;
          font-size: 0.95rem;
          color: #c9a227;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .embed-h-year {
          font-family: 'EB Garamond', serif;
          font-size: 0.85rem;
          color: rgba(201,162,39,0.55);
        }
        .embed-h-live {
          margin-left: auto;
          font-size: 0.65rem;
          color: #3a9e5c;
          letter-spacing: 0.1em;
          animation: embed-pulse 2s ease-in-out infinite;
        }
        @keyframes embed-pulse { 0%,100% { opacity:1; } 50% { opacity:0.5; } }

        /* ── Scroll container ── */
        .embed-scroll {
          overflow-x: auto;
          overflow-y: hidden;
          padding: 16px 20px;
          flex: 1;
          background: #0a0807;
        }
        .embed-scroll::-webkit-scrollbar { height: 4px; }
        .embed-scroll::-webkit-scrollbar-track { background: #100d0a; }
        .embed-scroll::-webkit-scrollbar-thumb { background: #4a3a18; border-radius: 2px; }

        /* ── Footer ── */
        .embed-footer {
          padding: 8px 20px;
          background: #100d0a;
          border-top: 1px solid #2e2535;
          font-size: 0.7rem;
          color: rgba(212,184,150,0.5);
          display: flex;
          align-items: center;
          gap: 4px;
          flex-shrink: 0;
        }
        .embed-vote-link {
          color: #c9a227;
          text-decoration: none;
          letter-spacing: 0.04em;
        }
        .embed-vote-link:hover { text-decoration: underline; }

        /* ── Loading ── */
        .embed-loading {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          height: 200px;
          color: rgba(212,184,150,0.5);
          font-family: 'Cinzel', serif;
          font-size: 0.85rem;
          letter-spacing: 0.08em;
        }
        .embed-spinner {
          width: 20px; height: 20px;
          border: 2px solid #2e2535;
          border-top-color: #c9a227;
          border-radius: 50%;
          animation: espin 0.8s linear infinite;
        }
        @keyframes espin { to { transform: rotate(360deg); } }

        /* ── Compact bracket cell ── */
        .ec {
          width: 100%;
          height: 100%;
          background: #14100e;
          border: 1px solid #2e2535;
          border-radius: 3px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          transition: border-color 0.15s;
        }
        a.ec.ec-active { cursor: pointer; border-color: #5a4820; box-shadow: 0 0 6px rgba(201,162,39,0.12); }
        a.ec.ec-active:hover { border-color: #c9a227; box-shadow: 0 0 10px rgba(201,162,39,0.25); }
        .ec.ec-closed { opacity: 0.88; }
        .ec.ec-empty { background: transparent; border-color: #1e1630; border-style: dashed; opacity: 0.3; }

        .ec-row {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 2px 5px;
          transition: background 0.12s;
          min-width: 0;
        }
        .ec-row.ec-win { background: rgba(201,162,39,0.08); }
        .ec-row.ec-lose { opacity: 0.45; }
        .ec-row.ec-tbd { opacity: 0.35; }

        .ec-seed {
          font-family: 'EB Garamond', serif;
          font-size: 0.52rem;
          color: rgba(212,184,150,0.4);
          min-width: 12px;
          text-align: right;
          flex-shrink: 0;
          line-height: 1;
        }
        .ec-thumb {
          width: 20px; height: 20px;
          border-radius: 2px;
          overflow: hidden;
          flex-shrink: 0;
          background: #1e1a16;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.7rem;
          color: rgba(212,184,150,0.3);
        }
        .ec-thumb img { width: 100%; height: 100%; object-fit: cover; }
        .ec-name {
          font-family: 'EB Garamond', serif;
          font-size: 0.62rem;
          color: #d4b896;
          flex: 1;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          line-height: 1.2;
        }
        .ec-row.ec-win .ec-name { color: #c9a227; }
        .ec-pct {
          font-family: 'EB Garamond', serif;
          font-size: 0.58rem;
          color: rgba(212,184,150,0.5);
          flex-shrink: 0;
        }
        .ec-pct1 { color: rgba(201,162,39,0.75); }
        .ec-crown {
          font-size: 0.62rem;
          color: #c9a227;
          flex-shrink: 0;
        }
        .ec-div {
          height: 1px;
          background: #2e2535;
          margin: 0 3px;
        }
        .ec-bar { height: 2px; background: #1e1a16; }
        .ec-fill { height: 100%; background: linear-gradient(to right, #5a4010, #c9a227); transition: width 0.4s; }

        /* ── Center column labels ── */
        .ec-clabel {
          position: absolute;
          left: 0;
          width: 100%;
          text-align: center;
          font-family: 'EB Garamond', serif;
          font-size: 0.55rem;
          color: rgba(201,162,39,0.45);
          letter-spacing: 0.12em;
          text-transform: uppercase;
          white-space: nowrap;
          pointer-events: none;
          z-index: 2;
        }
        .ec-clabel-champ { color: rgba(201,162,39,0.7); font-size: 0.6rem; }
      `}</style>
    </div>
  );
}

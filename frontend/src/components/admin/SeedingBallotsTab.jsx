import React, { useState, useEffect, useCallback } from 'react';
import {
  getSeedingData, computeRankings, assignDivisions, finalizeSeeding,
  selectTopContenders, toggleContenderSelected,
} from '../../api';

const DIVISION_COLORS = ['#c9a227', '#8faa3b', '#5b9bd5', '#b07ab8'];

export default function SeedingBallotsTab({ token }) {
  const [seeding, setSeeding] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [computing, setComputing] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [finalizing, setFinalizing] = useState(false);

  // Division names
  const [divNames, setDivNames] = useState(['Division 1', 'Division 2', 'Division 3', 'Division 4']);

  // View mode
  const [view, setView] = useState('rankings'); // 'rankings' | 'ballots' | 'divisions'

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

  async function handleCompute() {
    if (!confirm('Compute rankings from all submitted ballots?')) return;
    setComputing(true);
    try {
      await computeRankings(token);
      flash('Rankings computed!');
      load();
    } catch (e) {
      flash('Error: ' + (e.error || e.message), true);
    } finally { setComputing(false); }
  }

  async function handleSelectTop(n) {
    if (!confirm(`Auto-select the top ${n} ranked contenders?`)) return;
    try {
      await selectTopContenders(n, token);
      flash(`Top ${n} selected`);
      load();
    } catch (e) { flash('Error: ' + (e.error || e.message), true); }
  }

  async function handleAssign() {
    const selected = (seeding?.contenders || []).filter(c => c.selected);
    if (selected.length < 4) {
      flash('Select at least 4 contenders first', true);
      return;
    }
    if (!confirm(`Assign ${selected.length} selected contenders to 4 divisions via snake distribution?`)) return;
    setAssigning(true);
    try {
      await assignDivisions({ divisionNames: divNames }, token);
      flash('Divisions assigned!');
      load();
    } catch (e) {
      flash('Error: ' + (e.error || e.message), true);
    } finally { setAssigning(false); }
  }

  async function handleFinalize() {
    if (!confirm('Finalize seeding and create the tournament bracket? This will overwrite the current tournament data.')) return;
    setFinalizing(true);
    try {
      await finalizeSeeding({ divisionNames: divNames }, token);
      flash('Tournament bracket created! Go to the Bracket Setup tab to view.');
      load();
    } catch (e) {
      flash('Error: ' + (e.error || e.message), true);
    } finally { setFinalizing(false); }
  }

  async function handleToggleSelected(id, currentSelected) {
    try {
      await toggleContenderSelected(id, !currentSelected, token);
      load();
    } catch (e) { flash('Toggle failed', true); }
  }

  if (loading || !seeding) {
    return <div style={{ color: 'var(--text-muted)', padding: 20 }}>Loading ballot data...</div>;
  }

  const { contenders, ballots, rankings, staff } = seeding;
  const submittedBallots = ballots.filter(b => b.status === 'submitted');
  const selectedContenders = contenders.filter(c => c.selected);
  const rankedContenders = [...contenders]
    .filter(c => c.totalPoints > 0)
    .sort((a, b) => (a.rank || 999) - (b.rank || 999));

  // Division view: group selected contenders by divisionId
  const divisions = [0, 1, 2, 3].map(i => ({
    id: `div${i}`,
    name: divNames[i],
    color: DIVISION_COLORS[i],
    contenders: selectedContenders
      .filter(c => c.divisionId === `div${i}`)
      .sort((a, b) => (a.seed || 99) - (b.seed || 99)),
  }));

  return (
    <div>
      <div className="admin-section-header">
        <h2>Ballots & Rankings</h2>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, marginBottom: 20 }}>
        <StatCard label="Staff" value={staff.length} />
        <StatCard label="Submitted" value={submittedBallots.length} />
        <StatCard label="Draft" value={ballots.length - submittedBallots.length} />
        <StatCard label="Ranked" value={rankedContenders.length} />
        <StatCard label="Selected" value={selectedContenders.length} />
      </div>

      {msg && <div className={msg.startsWith('Error') || msg.includes('failed') ? 'error-msg' : 'success-msg'} style={{ marginBottom: 12 }}>{msg}</div>}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <button className="btn btn-gold" onClick={handleCompute} disabled={computing}>
          {computing ? 'Computing...' : 'Compute Rankings'}
        </button>
        <button className="btn btn-outline" onClick={() => handleSelectTop(64)}>Select Top 64</button>
        <button className="btn btn-outline" onClick={handleAssign} disabled={assigning}>
          {assigning ? 'Assigning...' : 'Assign Divisions'}
        </button>
        <button className="btn btn-gold" onClick={handleFinalize} disabled={finalizing}>
          {finalizing ? 'Finalizing...' : 'Finalize to Bracket'}
        </button>
      </div>

      {/* View tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {[
          { id: 'rankings', label: 'Rankings' },
          { id: 'ballots', label: 'Staff Ballots' },
          { id: 'divisions', label: 'Divisions' },
        ].map(v => (
          <button
            key={v.id}
            className={`btn ${view === v.id ? 'btn-gold' : 'btn-outline'}`}
            style={{ fontSize: '0.78rem' }}
            onClick={() => setView(v.id)}
          >
            {v.label}
          </button>
        ))}
      </div>

      {/* Rankings view */}
      {view === 'rankings' && (
        <div>
          <div style={{ maxHeight: 600, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
            <table style={{ width: '100%', fontSize: '0.78rem', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg-dark)', position: 'sticky', top: 0 }}>
                  <th style={thStyle}>Rank</th>
                  <th style={thStyle}>Sel</th>
                  <th style={thStyle}>Contender</th>
                  <th style={thStyle}>Type</th>
                  <th style={thStyle}>Points</th>
                  <th style={thStyle}>Ballots</th>
                  <th style={thStyle}>Div</th>
                  <th style={thStyle}>Seed</th>
                </tr>
              </thead>
              <tbody>
                {rankedContenders.map(c => {
                  const r = rankings.find(r => r.contenderId === c.id);
                  return (
                    <tr key={c.id} style={{ borderBottom: '1px solid var(--border)', background: c.selected ? 'rgba(201,162,39,0.04)' : 'transparent' }}>
                      <td style={tdStyle}>{c.rank || '—'}</td>
                      <td style={tdStyle}>
                        <input type="checkbox" checked={c.selected || false} onChange={() => handleToggleSelected(c.id, c.selected)} />
                      </td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {c.image && <img src={c.image} alt="" style={{ width: 24, height: 24, borderRadius: 3, objectFit: 'cover' }} />}
                          {c.name}
                        </div>
                      </td>
                      <td style={tdStyle}>{c.type}</td>
                      <td style={{ ...tdStyle, color: 'var(--gold)', fontWeight: 600 }}>{c.totalPoints || 0}</td>
                      <td style={tdStyle}>{r?.ballotCount || '—'}</td>
                      <td style={tdStyle}>{c.divisionId || '—'}</td>
                      <td style={tdStyle}>{c.seed || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Ballots view */}
      {view === 'ballots' && (
        <div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {staff.map(s => {
              const ballot = ballots.find(b => b.staffId === s.id);
              const pickCount = ballot ? Object.keys(ballot.picks || {}).length : 0;
              return (
                <div key={s.id} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 14px',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: 'var(--font-heading)', fontSize: '0.82rem', color: 'var(--text)' }}>
                      {s.displayName || s.email}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{s.email}</div>
                  </div>
                  <span style={{
                    fontSize: '0.72rem',
                    padding: '2px 8px',
                    borderRadius: 3,
                    fontFamily: 'var(--font-heading)',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    border: '1px solid',
                    color: ballot?.status === 'submitted' ? 'var(--green-bright)' : ballot ? 'var(--gold-dim)' : 'var(--text-muted)',
                    borderColor: ballot?.status === 'submitted' ? 'var(--green)' : ballot ? 'var(--border-gold)' : 'var(--border)',
                  }}>
                    {ballot?.status === 'submitted' ? `Submitted (${pickCount})` : ballot ? `Draft (${pickCount})` : 'No ballot'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Divisions view */}
      {view === 'divisions' && (
        <div>
          {/* Division name inputs */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            {divNames.map((name, i) => (
              <div key={i} className="form-group" style={{ flex: 1, minWidth: 140 }}>
                <label className="form-label" style={{ color: DIVISION_COLORS[i] }}>Division {i + 1}</label>
                <input
                  className="form-input"
                  value={name}
                  onChange={e => setDivNames(d => d.map((n, j) => j === i ? e.target.value : n))}
                />
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 12 }}>
            {divisions.map(div => (
              <div key={div.id} style={{
                background: 'var(--bg-card)',
                border: `1px solid ${div.color}40`,
                borderRadius: 'var(--radius)',
                overflow: 'hidden',
              }}>
                <div style={{
                  padding: '8px 12px',
                  background: div.color + '15',
                  fontFamily: 'var(--font-heading)',
                  fontSize: '0.82rem',
                  color: div.color,
                  letterSpacing: '0.06em',
                  display: 'flex',
                  justifyContent: 'space-between',
                }}>
                  <span>{div.name}</span>
                  <span style={{ fontSize: '0.72rem' }}>{div.contenders.length} teams</span>
                </div>
                <div style={{ padding: 6 }}>
                  {div.contenders.length === 0 ? (
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', padding: '8px 6px', fontStyle: 'italic' }}>
                      No contenders assigned. Click "Assign Divisions" above.
                    </div>
                  ) : (
                    div.contenders.map(c => (
                      <div key={c.id} style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '4px 6px',
                        fontSize: '0.75rem',
                        borderRadius: 3,
                      }}>
                        <span style={{ color: div.color, fontFamily: 'var(--font-heading)', fontSize: '0.68rem', minWidth: 22 }}>
                          #{c.seed}
                        </span>
                        {c.image && <img src={c.image} alt="" style={{ width: 22, height: 22, borderRadius: 2, objectFit: 'cover' }} />}
                        <span style={{ flex: 1, color: 'var(--text)', fontFamily: 'var(--font-heading)', fontSize: '0.72rem' }}>
                          {c.name}
                        </span>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>
                          {c.totalPoints}pts
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Round 1 matchup preview */}
          {divisions.some(d => d.contenders.length >= 2) && (
            <div style={{ marginTop: 20 }}>
              <h3 className="card-section-title">Round 1 Matchup Preview</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 12 }}>
                {divisions.filter(d => d.contenders.length >= 2).map(div => {
                  const teams = div.contenders;
                  const pairs = [];
                  // Standard bracket seeding order
                  const BRACKET_ORDER = [[1,16],[8,9],[5,12],[4,13],[6,11],[3,14],[7,10],[2,15]];
                  for (const [s1, s2] of BRACKET_ORDER) {
                    const t1 = teams.find(c => c.seed === s1);
                    const t2 = teams.find(c => c.seed === s2);
                    if (t1 || t2) pairs.push([t1, t2]);
                  }
                  return (
                    <div key={div.id}>
                      <div style={{ fontFamily: 'var(--font-heading)', fontSize: '0.78rem', color: div.color, marginBottom: 6 }}>
                        {div.name}
                      </div>
                      {pairs.map(([t1, t2], i) => (
                        <div key={i} style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '4px 0',
                          fontSize: '0.72rem',
                          borderBottom: '1px solid var(--border)',
                        }}>
                          <span style={{ color: 'var(--text)', flex: 1 }}>#{t1?.seed} {t1?.name || 'TBD'}</span>
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>vs</span>
                          <span style={{ color: 'var(--text)', flex: 1, textAlign: 'right' }}>#{t2?.seed} {t2?.name || 'TBD'}</span>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      padding: '12px 14px',
      textAlign: 'center',
    }}>
      <div style={{
        fontFamily: 'var(--font-heading)',
        fontSize: '1.2rem',
        color: 'var(--gold)',
        marginBottom: 2,
      }}>{value}</div>
      <div style={{
        fontFamily: 'var(--font-heading)',
        fontSize: '0.6rem',
        color: 'var(--text-muted)',
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
      }}>{label}</div>
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
  fontSize: '0.78rem',
};

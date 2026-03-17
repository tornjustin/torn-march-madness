import React, { useState, useEffect, useRef } from 'react';
import {
  getTournament, createTeam, updateTeam, deleteTeam, uploadTeamImage,
  initializeBracket, seedMatchup, setMatchupStatus, setWinner, resetVotes,
  updateRegion, updateSettings, updateDashboard, adminLogin
} from '../api';
import SeedingConfigTab from '../components/admin/SeedingConfigTab';
import SeedingContendersTab from '../components/admin/SeedingContendersTab';
import SeedingBallotsTab from '../components/admin/SeedingBallotsTab';

// ─── Auth ──────────────────────────────────────────────────────────────────────
function AdminLogin({ onLogin }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setErr('');
    try {
      const result = await adminLogin(pw);
      sessionStorage.setItem('memm_admin_token', result.token);
      onLogin(result.token);
    } catch {
      setErr('Incorrect password');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="admin-login-page">
      <div className="admin-login-box">
        <div className="admin-login-icon">⚔</div>
        <h1 className="admin-login-title">Admin Portal</h1>
        <p className="admin-login-sub">Middle-earth March Madness</p>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            className="form-input"
            placeholder="Enter admin password"
            value={pw}
            onChange={e => setPw(e.target.value)}
            autoFocus
            style={{ marginBottom: 12 }}
          />
          {err && <div className="error-msg" style={{ marginBottom: 12 }}>{err}</div>}
          <button type="submit" className="btn btn-gold" style={{ width: '100%' }} disabled={loading}>
            {loading ? 'Checking…' : 'Enter'}
          </button>
        </form>
      </div>
      <style>{`
        .admin-login-page {
          min-height: calc(100vh - 64px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          background: radial-gradient(ellipse at center, var(--bg-mid) 0%, var(--bg-deepest) 70%);
        }
        .admin-login-box {
          background: var(--bg-card);
          border: 1px solid var(--border-gold);
          border-radius: var(--radius-lg);
          padding: 40px;
          width: 100%;
          max-width: 360px;
          text-align: center;
          box-shadow: var(--shadow), var(--shadow-gold);
        }
        .admin-login-icon { font-size: 2.5rem; margin-bottom: 12px; }
        .admin-login-title {
          font-family: var(--font-title);
          font-size: 1.5rem;
          color: var(--gold);
          margin-bottom: 4px;
        }
        .admin-login-sub {
          font-family: var(--font-heading);
          font-size: 0.75rem;
          color: var(--text-muted);
          letter-spacing: 0.1em;
          text-transform: uppercase;
          margin-bottom: 28px;
        }
      `}</style>
    </div>
  );
}

// ─── Teams Manager ─────────────────────────────────────────────────────────────
function TeamsManager({ data, token, onRefresh }) {
  const emptyForm = { name: '', regionId: data.regions[0]?.id || '', seed: '', description: '' };
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState(null);
  const [editExistingImage, setEditExistingImage] = useState(null); // current image when editing
  const [pendingFile, setPendingFile] = useState(null);             // file chosen in the form
  const [previewUrl, setPreviewUrl] = useState(null);               // local preview URL
  const [uploading, setUploading] = useState({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const fileRefs = useRef({});
  const formFileRef = useRef();

  const teamsPerRegion = data.regions.map(r => ({
    ...r,
    teams: data.teams.filter(t => t.regionId === r.id).sort((a, b) => (a.seed || 99) - (b.seed || 99))
  }));

  function handleFileSelect(file) {
    if (!file) return;
    setPendingFile(file);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
  }

  function clearForm() {
    setForm(emptyForm);
    setEditId(null);
    setEditExistingImage(null);
    setPendingFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    if (formFileRef.current) formFileRef.current.value = '';
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.name || !form.regionId) return;
    setSaving(true);
    try {
      const body = { name: form.name, regionId: form.regionId, seed: form.seed ? Number(form.seed) : null, description: form.description };
      let teamId = editId;
      if (editId) {
        await updateTeam(editId, body, token);
      } else {
        const created = await createTeam(body, token);
        teamId = created.id;
      }
      // Upload image if one was selected in the form
      if (pendingFile && teamId) {
        await uploadTeamImage(teamId, pendingFile, token);
      }
      setMsg(editId ? 'Team updated!' : 'Team added!');
      clearForm();
      onRefresh();
    } catch (e) { setMsg('Error: ' + (e.error || e.message)); }
    finally { setSaving(false); setTimeout(() => setMsg(''), 3000); }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this team?')) return;
    try { await deleteTeam(id, token); onRefresh(); }
    catch (e) { setMsg('Delete failed'); setTimeout(() => setMsg(''), 3000); }
  }

  async function handleImage(teamId, file) {
    setUploading(u => ({ ...u, [teamId]: true }));
    try { await uploadTeamImage(teamId, file, token); onRefresh(); }
    catch (e) { setMsg('Upload failed'); setTimeout(() => setMsg(''), 3000); }
    finally { setUploading(u => ({ ...u, [teamId]: false })); }
  }

  function startEdit(team) {
    setEditId(team.id);
    setEditExistingImage(team.image || null);
    setPendingFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setForm({ name: team.name, regionId: team.regionId, seed: team.seed || '', description: team.description || '' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Current preview: new file takes priority over existing image
  const displayImage = previewUrl || editExistingImage;

  return (
    <div>
      <div className="admin-section-header">
        <h2>Teams <span className="admin-count">{data.teams.length} / 64</span></h2>
      </div>

      {/* Add/Edit form */}
      <div className="card card-gold" style={{ marginBottom: 24 }}>
        <h3 className="card-section-title">{editId ? 'Edit Team' : 'Add New Team'}</h3>
        <form onSubmit={handleSave} className="team-form">
          <div className="form-row" style={{ alignItems: 'flex-start', gap: 20 }}>

            {/* Image picker */}
            <div className="form-image-picker" onClick={() => formFileRef.current?.click()}>
              {displayImage
                ? <img src={displayImage} alt="preview" className="form-image-preview" />
                : <div className="form-image-empty">
                    <span style={{ fontSize: '2rem' }}>📷</span>
                    <span>Photo</span>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Optional</span>
                  </div>
              }
              <div className="form-image-overlay">{displayImage ? 'Change' : 'Upload'}</div>
              <input
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                ref={formFileRef}
                onChange={e => e.target.files[0] && handleFileSelect(e.target.files[0])}
              />
            </div>

            {/* Fields */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0 }}>
              <div className="form-row">
                <div className="form-group" style={{ flex: 2 }}>
                  <label className="form-label">Name *</label>
                  <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Frodo Baggins" required />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Seed (1-16)</label>
                  <input className="form-input" type="number" min="1" max="16" value={form.seed} onChange={e => setForm(f => ({ ...f, seed: e.target.value }))} placeholder="#" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Region *</label>
                  <select className="form-select" value={form.regionId} onChange={e => setForm(f => ({ ...f, regionId: e.target.value }))}>
                    {data.regions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ flex: 2 }}>
                  <label className="form-label">Description</label>
                  <input className="form-input" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Short tagline..." />
                </div>
              </div>
            </div>
          </div>

          <div className="form-actions">
            {msg && <span className={msg.startsWith('Error') ? 'msg-error' : 'msg-success'}>{msg}</span>}
            {editId && <button type="button" className="btn btn-ghost" onClick={clearForm}>Cancel</button>}
            <button type="submit" className="btn btn-gold" disabled={saving}>
              {saving ? (pendingFile ? 'Uploading…' : 'Saving…') : editId ? 'Update Team' : 'Add Team'}
            </button>
          </div>
        </form>
      </div>

      {/* Teams by region */}
      {teamsPerRegion.map(region => (
        <div key={region.id} style={{ marginBottom: 24 }}>
          <h3 className="region-team-header">{region.name} <span className="admin-count">{region.teams.length}</span></h3>
          {region.teams.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', padding: '8px 0' }}>No teams in this region yet.</div>
          ) : (
            <div className="team-grid">
              {region.teams.map(team => (
                <div key={team.id} className="team-card">
                  {/* Image */}
                  <div className="team-card-img" onClick={() => fileRefs.current[team.id]?.click()}>
                    {team.image
                      ? <img src={team.image} alt={team.name} />
                      : <div className="team-card-img-placeholder">{uploading[team.id] ? '⏳' : '📷'}</div>}
                    <div className="team-card-img-overlay">
                      {uploading[team.id] ? 'Uploading…' : 'Change Photo'}
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      ref={el => fileRefs.current[team.id] = el}
                      onChange={e => e.target.files[0] && handleImage(team.id, e.target.files[0])}
                    />
                  </div>
                  {/* Info */}
                  <div className="team-card-info">
                    <div className="team-card-name">{team.name}</div>
                    {team.seed && <span className="team-card-seed">#{team.seed}</span>}
                    {team.description && <div className="team-card-desc">{team.description}</div>}
                  </div>
                  {/* Actions */}
                  <div className="team-card-actions">
                    <button className="btn btn-outline" style={{ fontSize: '0.72rem', padding: '4px 10px' }} onClick={() => startEdit(team)}>Edit</button>
                    <button className="btn btn-danger" style={{ fontSize: '0.72rem', padding: '4px 10px' }} onClick={() => handleDelete(team.id)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Bracket Setup ─────────────────────────────────────────────────────────────
function BracketSetup({ data, token, onRefresh }) {
  const [initing, setIniting] = useState(false);
  const [msg, setMsg] = useState('');
  const [hidingSeeds, setHidingSeeds] = useState(!!data.settings.hideSeedings);

  async function toggleHideSeedings() {
    const next = !hidingSeeds;
    setHidingSeeds(next);
    try {
      await updateSettings({ hideSeedings: next }, token);
      onRefresh();
    } catch (e) {
      setHidingSeeds(!next); // revert on error
      alert('Error saving: ' + (e.error || e.message));
    }
  }

  const r1Matchups = data.matchups.filter(m => m.round === 1);
  const hasMatchups = data.matchups.length > 0;

  async function handleInit() {
    if (!confirm('This will reset the entire bracket structure. Continue?')) return;
    setIniting(true);
    try {
      await initializeBracket(token);
      setMsg('Bracket initialized! 63 matchup slots created.');
      onRefresh();
    } catch (e) { setMsg('Error: ' + (e.error || e.message)); }
    finally { setIniting(false); setTimeout(() => setMsg(''), 4000); }
  }

  async function handleSeed(matchupId, slot, teamId) {
    try {
      await seedMatchup(matchupId, { [slot]: teamId || null }, token);
      onRefresh();
    } catch (e) { alert('Error: ' + (e.error || e.message)); }
  }

  // Group R1 matchups by region
  const r1ByRegion = data.regions.map(r => ({
    ...r,
    matchups: r1Matchups.filter(m => m.regionId === r.id).sort((a, b) => a.position - b.position)
  }));

  return (
    <div>
      <div className="admin-section-header">
        <h2>Bracket Setup</h2>
        <button className="btn btn-outline" onClick={handleInit} disabled={initing}>
          {initing ? 'Initializing…' : hasMatchups ? '↺ Reinitialize Bracket' : '⚙ Initialize Bracket'}
        </button>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0 16px', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-dim)' }}>
        <input type="checkbox" checked={hidingSeeds} onChange={toggleHideSeedings} style={{ accentColor: 'var(--gold)', width: 16, height: 16, cursor: 'pointer' }} />
        Hide seed numbers on public bracket
      </label>

      {msg && <div className={msg.startsWith('Error') ? 'error-msg' : 'success-msg'}>{msg}</div>}

      {!hasMatchups ? (
        <div className="empty-setup-msg">
          <p>Click "Initialize Bracket" to generate 63 matchup slots for the tournament.</p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 8 }}>Make sure you've added your 64 teams first!</p>
        </div>
      ) : (
        <>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', marginBottom: 20 }}>
            Assign teams to the Round 1 matchups below. Winners of each matchup will automatically advance to later rounds.
          </p>
          {r1ByRegion.map(region => (
            <div key={region.id} style={{ marginBottom: 28 }}>
              <h3 className="region-team-header">{region.name} – Round 1</h3>
              <div className="seed-grid">
                {region.matchups.map(m => (
                  <div key={m.id} className="seed-row">
                    <div className="seed-pos">G{m.position}</div>
                    <TeamSelect
                      label="Team 1"
                      value={m.team1Id || ''}
                      teams={data.teams.filter(t => t.regionId === region.id)}
                      onChange={v => handleSeed(m.id, 'team1Id', v)}
                      current={m.team1}
                    />
                    <div className="seed-vs">vs</div>
                    <TeamSelect
                      label="Team 2"
                      value={m.team2Id || ''}
                      teams={data.teams.filter(t => t.regionId === region.id)}
                      onChange={v => handleSeed(m.id, 'team2Id', v)}
                      current={m.team2}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function TeamSelect({ label, value, teams, onChange, current }) {
  return (
    <div className="team-select-wrap">
      {current?.image && <img src={current.image} alt="" className="team-select-thumb" />}
      <select className="form-select" value={value} onChange={e => onChange(e.target.value)} style={{ flex: 1 }}>
        <option value="">— {label} —</option>
        {teams.map(t => <option key={t.id} value={t.id}>{t.seed ? `#${t.seed} ` : ''}{t.name}</option>)}
      </select>
    </div>
  );
}

// ─── Matchup Manager ──────────────────────────────────────────────────────────
function MatchupManager({ data, token, onRefresh }) {
  const [statusMsg, setStatusMsg] = useState({});
  const [closing, setClosing] = useState(false);
  const ROUND_NAMES = { 1: 'Round of 16', 2: 'Round of 8', 3: 'Sweet 16', 4: 'Elite 8', 5: 'Final Four', 6: 'Championship' };

  async function changeStatus(id, status) {
    try {
      await setMatchupStatus(id, status, token);
      setStatusMsg(m => ({ ...m, [id]: `→ ${status}` }));
      onRefresh();
      setTimeout(() => setStatusMsg(m => { const n = { ...m }; delete n[id]; return n; }), 2000);
    } catch (e) {
      if (e.status === 401) {
        sessionStorage.removeItem('memm_admin_token');
        alert('Session expired. Please log in again.');
        window.location.reload();
      } else {
        alert(e.error || e.message);
      }
    }
  }

  async function closeCurrentRound() {
    const activeMatchups = data.matchups.filter(m => m.status === 'active');
    if (!activeMatchups.length) return alert('No active matchups to close.');
    const round = activeMatchups[0].round;
    const roundMatchups = activeMatchups.filter(m => m.round === round);
    const roundName = ROUND_NAMES[round] || `Round ${round}`;
    if (!confirm(`Close all ${roundMatchups.length} active matchups in ${roundName}?`)) return;
    setClosing(true);
    try {
      for (const m of roundMatchups) {
        await setMatchupStatus(m.id, 'closed', token);
      }
      onRefresh();
    } catch (e) {
      if (e.status === 401) {
        sessionStorage.removeItem('memm_admin_token');
        alert('Session expired. Please log in again.');
        window.location.reload();
      } else {
        alert(e.error || e.message);
      }
    } finally {
      setClosing(false);
    }
  }

  async function handleWinner(matchupId, winnerId) {
    try {
      const result = await setWinner(matchupId, winnerId, token);
      if (result.isTournamentWinner) {
        const team = data.teams.find(t => t.id === winnerId);
        alert(`🏆 ${team?.name} is the Middle-earth March Madness Champion!`);
      }
      onRefresh();
    } catch (e) {
      if (e.status === 401) { sessionStorage.removeItem('memm_admin_token'); alert('Session expired.'); window.location.reload(); }
      else alert(e.error || e.message);
    }
  }

  async function handleReset(id) {
    if (!confirm('Reset votes for this matchup?')) return;
    try { await resetVotes(id, token); onRefresh(); }
    catch (e) {
      if (e.status === 401) { sessionStorage.removeItem('memm_admin_token'); alert('Session expired.'); window.location.reload(); }
      else alert(e.error || e.message);
    }
  }

  // Group matchups
  const grouped = {};
  data.matchups.forEach(m => {
    const key = m.round;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(m);
  });

  return (
    <div>
      <div className="admin-section-header">
        <h2>Matchup Control</h2>
        {data.matchups.some(m => m.status === 'active') && (
          <button className="btn btn-outline" style={{ fontSize: '0.78rem', padding: '6px 16px' }} onClick={closeCurrentRound} disabled={closing}>
            {closing ? 'Closing…' : `Close ${ROUND_NAMES[data.matchups.find(m => m.status === 'active').round] || 'Current Round'}`}
          </button>
        )}
      </div>
      <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', marginBottom: 20 }}>
        Activate matchups to open voting, declare winners to advance, and close matchups when done.
      </p>

      {Object.keys(grouped).sort((a, b) => a - b).map(round => (
        <div key={round} style={{ marginBottom: 28 }}>
          <h3 className="region-team-header">{ROUND_NAMES[round] || `Round ${round}`}</h3>
          <div className="matchup-manager-list">
            {grouped[round]
              .sort((a, b) => {
                const regionOrder = ['region1', 'region2', 'region3', 'region4'];
                const ri = regionOrder.indexOf(a.regionId) - regionOrder.indexOf(b.regionId);
                return ri !== 0 ? ri : a.position - b.position;
              })
              .map(m => {
                const t1 = m.team1;
                const t2 = m.team2;
                const total = (m.votes?.team1 || 0) + (m.votes?.team2 || 0);
                const region = data.regions.find(r => r.id === m.regionId);
                const canDeclareWinner = m.status === 'closed' && t1 && t2 && !m.winnerId;

                return (
                  <div key={m.id} className={`matchup-row status-${m.status}`}>
                    <div className="matchup-row-info">
                      <span className="matchup-row-label">
                        {region ? `${region.name} G${m.position}` : m.roundName || m.id}
                      </span>
                      <span className={`badge badge-${m.status}`}>{m.status}</span>
                    </div>

                    <div className="matchup-row-teams">
                      <TeamMiniCard
                        team={t1}
                        votes={m.votes?.team1 || 0}
                        total={total}
                        isWinner={m.winnerId === t1?.id}
                        canWin={canDeclareWinner}
                        isLeading={total > 0 && (m.votes?.team1 || 0) >= (m.votes?.team2 || 0)}
                        onWin={() => handleWinner(m.id, t1.id)}
                        slot={1}
                      />
                      <div className="matchup-row-vs">vs</div>
                      <TeamMiniCard
                        team={t2}
                        votes={m.votes?.team2 || 0}
                        total={total}
                        isWinner={m.winnerId === t2?.id}
                        canWin={canDeclareWinner}
                        isLeading={total > 0 && (m.votes?.team2 || 0) > (m.votes?.team1 || 0)}
                        onWin={() => handleWinner(m.id, t2.id)}
                        slot={2}
                      />
                    </div>

                    <div className="matchup-row-actions">
                      {m.status === 'pending' && t1 && t2 && (
                        <button className="btn btn-success" style={{ fontSize: '0.72rem', padding: '4px 10px' }} onClick={() => changeStatus(m.id, 'active')}>Open Voting</button>
                      )}
                      {m.status === 'active' && (
                        <button className="btn btn-outline" style={{ fontSize: '0.72rem', padding: '4px 10px' }} onClick={() => changeStatus(m.id, 'closed')}>Close Voting</button>
                      )}
                      {m.status === 'closed' && !m.winnerId && (
                        <button className="btn btn-outline" style={{ fontSize: '0.72rem', padding: '4px 10px' }} onClick={() => changeStatus(m.id, 'active')}>Reopen</button>
                      )}
                      {total > 0 && (
                        <button className="btn btn-ghost" style={{ fontSize: '0.72rem', padding: '4px 10px' }} onClick={() => handleReset(m.id)}>Reset Votes</button>
                      )}
                      {statusMsg[m.id] && <span style={{ color: 'var(--gold)', fontSize: '0.75rem' }}>{statusMsg[m.id]}</span>}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );
}

function TeamMiniCard({ team, votes, total, isWinner, canWin, isLeading, onWin, slot }) {
  const pct = total ? Math.round((votes / total) * 100) : 0;
  return (
    <div className={`team-mini ${isWinner ? 'is-winner' : ''} ${!team ? 'tbd' : ''}`}>
      {team?.image && <img src={team.image} alt="" className="team-mini-img" />}
      <div className="team-mini-info">
        <div className="team-mini-name">{team?.name || 'TBD'}</div>
        {total > 0 && <div className="team-mini-votes">{votes} votes ({pct}%)</div>}
      </div>
      {canWin && team && isLeading && (
        <button className="btn btn-gold" style={{ fontSize: '0.7rem', padding: '3px 10px', flexShrink: 0 }} onClick={onWin}>
          ♛ Confirm Win
        </button>
      )}
      {canWin && team && !isLeading && (
        <button className="btn btn-ghost" style={{ fontSize: '0.65rem', padding: '3px 8px', flexShrink: 0, opacity: 0.6 }} onClick={onWin}>
          Override Votes
        </button>
      )}
      {isWinner && <span style={{ color: 'var(--gold)', fontSize: '1.1rem' }}>♛</span>}
    </div>
  );
}

// ─── Dashboard Setup ───────────────────────────────────────────────────────────
function DashboardSetup({ data, token, onRefresh }) {
  const [order, setOrder] = useState(data.dashboardState?.matchupOrder || []);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const activeMatchups = data.matchups.filter(m => m.status === 'active' && m.team1 && m.team2);
  const allMatchupsWithTeams = data.matchups.filter(m => m.team1 && m.team2);

  function toggleMatchup(id) {
    setOrder(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function addAllActive() {
    const activeIds = activeMatchups.map(m => m.id).filter(id => !order.includes(id));
    setOrder(prev => [...prev, ...activeIds]);
  }

  function clearOrder() { setOrder([]); }

  function moveUp(idx) {
    if (idx === 0) return;
    const n = [...order];
    [n[idx - 1], n[idx]] = [n[idx], n[idx - 1]];
    setOrder(n);
  }
  function moveDown(idx) {
    if (idx === order.length - 1) return;
    const n = [...order];
    [n[idx], n[idx + 1]] = [n[idx + 1], n[idx]];
    setOrder(n);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const currentId = order.length > 0 ? order[0] : null;
      await updateDashboard({ matchupOrder: order, currentMatchupId: data.dashboardState?.currentMatchupId || currentId }, token);
      setMsg('Dashboard order saved!');
      onRefresh();
    } catch (e) { setMsg('Error: ' + (e.error || e.message)); }
    finally { setSaving(false); setTimeout(() => setMsg(''), 3000); }
  }

  async function setCurrentMatchup(id) {
    try {
      await updateDashboard({ currentMatchupId: id, matchupOrder: order }, token);
      setMsg('Dashboard updated!');
      onRefresh();
    } catch (e) { setMsg('Error: ' + e.error); }
    setTimeout(() => setMsg(''), 2000);
  }

  const ROUND_NAMES = { 1: 'R16', 2: 'R8', 3: 'S16', 4: 'E8', 5: 'FF', 6: 'Champ' };

  function matchupLabel(id) {
    const m = data.matchups.find(x => x.id === id);
    if (!m) return id;
    const region = data.regions.find(r => r.id === m.regionId);
    return `${ROUND_NAMES[m.round]} – ${region ? region.name : m.roundName} G${m.position}: ${m.team1?.name || '?'} vs ${m.team2?.name || '?'}`;
  }

  return (
    <div>
      <div className="admin-section-header">
        <h2>Stream Dashboard</h2>
        <a href="/stream" target="_blank" className="btn btn-outline" style={{ fontSize: '0.8rem' }}>📺 Open Stream View</a>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Available matchups */}
        <div className="card">
          <h3 className="card-section-title">Available Matchups</h3>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button className="btn btn-outline" style={{ fontSize: '0.75rem' }} onClick={addAllActive}>+ Add All Active</button>
            <button className="btn btn-ghost" style={{ fontSize: '0.75rem' }} onClick={clearOrder}>Clear All</button>
          </div>
          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            {allMatchupsWithTeams.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No matchups with teams yet.</div>
            ) : (
              allMatchupsWithTeams.map(m => {
                const inOrder = order.includes(m.id);
                const region = data.regions.find(r => r.id === m.regionId);
                return (
                  <div key={m.id} className={`dashboard-matchup-item ${inOrder ? 'in-order' : ''}`} onClick={() => toggleMatchup(m.id)}>
                    <span className={`badge badge-${m.status}`} style={{ fontSize: '0.6rem' }}>{ROUND_NAMES[m.round]}</span>
                    <span style={{ flex: 1, fontSize: '0.8rem', color: 'var(--text)' }}>
                      {m.team1.name} vs {m.team2.name}
                    </span>
                    {inOrder ? <span style={{ color: 'var(--gold)', fontSize: '0.75rem' }}>✓</span> : <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>+</span>}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Order */}
        <div className="card">
          <h3 className="card-section-title">Display Order ({order.length})</h3>
          {order.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Click matchups on the left to add them.</div>
          ) : (
            <div style={{ maxHeight: 340, overflowY: 'auto', marginBottom: 12 }}>
              {order.map((id, idx) => {
                const isCurrent = data.dashboardState?.currentMatchupId === id;
                return (
                  <div key={id} className={`order-item ${isCurrent ? 'current' : ''}`}>
                    <span className="order-num">{idx + 1}</span>
                    <span className="order-label">{matchupLabel(id)}</span>
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      <button className="btn btn-ghost" style={{ fontSize: '0.7rem', padding: '2px 6px' }} onClick={() => moveUp(idx)}>↑</button>
                      <button className="btn btn-ghost" style={{ fontSize: '0.7rem', padding: '2px 6px' }} onClick={() => moveDown(idx)}>↓</button>
                      <button className="btn btn-ghost" style={{ fontSize: '0.7rem', padding: '2px 6px' }} onClick={() => setCurrentMatchup(id)}>▶ Set Live</button>
                      <button className="btn btn-ghost" style={{ fontSize: '0.7rem', padding: '2px 6px', color: 'var(--red)' }} onClick={() => setOrder(o => o.filter(x => x !== id))}>✕</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {msg && <div className={msg.startsWith('Error') ? 'msg-error' : 'msg-success'} style={{ marginBottom: 8 }}>{msg}</div>}
          <button className="btn btn-gold" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save Order'}</button>
        </div>
      </div>

      <div className="dashboard-tip">
        <strong>📺 Stream Setup:</strong> Open the Stream View in a browser window and resize to 1920×1080. In OBS, add a "Browser Source" pointed at <code>http://localhost:5173/stream</code>. Use "Set Live" above or keyboard ← → on the stream page to advance.
      </div>
    </div>
  );
}

// ─── Settings ─────────────────────────────────────────────────────────────────
function Settings({ data, token, onRefresh }) {
  const [form, setForm] = useState({
    name: data.settings.name,
    year: data.settings.year,
    status: data.settings.status
  });
  const [regions, setRegions] = useState(data.regions.map(r => ({ ...r })));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [embedCopied, setEmbedCopied] = useState(false);
  const [imageCopied, setImageCopied] = useState(false);
  const [imageKey, setImageKey] = useState(Date.now());
  const [generating, setGenerating] = useState(false);
  const [genMsg, setGenMsg] = useState('');

  async function saveSettings(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await updateSettings(form, token);
      await Promise.all(regions.map(r => updateRegion(r.id, { name: r.name }, token)));
      setMsg('Settings saved!');
      onRefresh();
    } catch (e) { setMsg('Error: ' + e.error); }
    finally { setSaving(false); setTimeout(() => setMsg(''), 3000); }
  }

  const embedUrl = `${window.location.origin}/embed`;
  const embedCode = `<iframe src="${embedUrl}" width="100%" height="1100" style="border:0;overflow:hidden;" scrolling="auto" title="${data.settings.name} ${data.settings.year} Bracket"></iframe>`;

  function copyEmbed() {
    navigator.clipboard.writeText(embedCode).then(() => {
      setEmbedCopied(true);
      setTimeout(() => setEmbedCopied(false), 2500);
    });
  }

  // Bracket image (PNG)
  const imageApiUrl = `${window.location.origin.replace(':5173', ':3001')}/api/bracket/image`;
  const imageImgTag = `<img src="${imageApiUrl}" alt="${data.settings.name} ${data.settings.year} Bracket" style="max-width: 100%; height: auto;" />`;

  function downloadBracketImage() {
    const link = document.createElement('a');
    link.href = imageApiUrl;
    link.download = `MEMM-${data.settings.year}-bracket.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function copyImageCode() {
    navigator.clipboard.writeText(imageImgTag).then(() => {
      setImageCopied(true);
      setTimeout(() => setImageCopied(false), 2500);
    });
  }

  async function regenerateBracketImage() {
    setGenerating(true);
    setGenMsg('');
    try {
      const res = await fetch(`${window.location.origin.replace(':5173', ':3001')}/api/admin/bracket/generate`, {
        method: 'POST',
        headers: { 'x-admin-token': token },
      });
      const json = await res.json();
      if (json.success) {
        setGenMsg(`Generated! (${(json.size / 1024).toFixed(0)} KB)`);
        setImageKey(Date.now());
      } else {
        setGenMsg('Error: ' + (json.error || 'Unknown'));
      }
    } catch (e) {
      setGenMsg('Error: ' + e.message);
    } finally {
      setGenerating(false);
      setTimeout(() => setGenMsg(''), 5000);
    }
  }

  return (
    <div>
      <div className="admin-section-header"><h2>Settings</h2></div>
      <form onSubmit={saveSettings} style={{ maxWidth: 560 }}>
        <div className="card card-gold" style={{ marginBottom: 20 }}>
          <h3 className="card-section-title">Tournament</h3>
          <div className="form-group">
            <label className="form-label">Tournament Name</label>
            <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="form-row">
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Year</label>
              <input className="form-input" type="number" value={form.year} onChange={e => setForm(f => ({ ...f, year: e.target.value }))} />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Status</label>
              <select className="form-select" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                <option value="setup">Setup</option>
                <option value="active">Active</option>
                <option value="complete">Complete</option>
              </select>
            </div>
          </div>
        </div>

        <div className="card card-gold" style={{ marginBottom: 20 }}>
          <h3 className="card-section-title">Region Names</h3>
          {regions.map((r, i) => (
            <div key={r.id} className="form-group">
              <label className="form-label">Region {i + 1}</label>
              <input className="form-input" value={r.name} onChange={e => setRegions(rs => rs.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
            </div>
          ))}
        </div>

        {msg && <div className={msg.startsWith('Error') ? 'error-msg' : 'success-msg'} style={{ marginBottom: 12 }}>{msg}</div>}
        <button type="submit" className="btn btn-gold" disabled={saving}>{saving ? 'Saving…' : 'Save Settings'}</button>
      </form>

      {/* Embed Code Card */}
      <div className="card card-gold" style={{ maxWidth: 560, marginTop: 28 }}>
        <h3 className="card-section-title">WordPress Embed</h3>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-dim)', marginBottom: 14, lineHeight: 1.6 }}>
          Paste this code into a WordPress post using the <strong style={{ color: 'var(--text)' }}>Custom HTML</strong> block. The bracket updates live — visitors will always see the current tournament state.
        </p>
        <div className="embed-code-block">
          <code>{embedCode}</code>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 12, alignItems: 'center' }}>
          <button className="btn btn-gold" onClick={copyEmbed}>
            {embedCopied ? '✓ Copied!' : '⎘ Copy Code'}
          </button>
          <a href={embedUrl} target="_blank" rel="noopener noreferrer" className="btn btn-outline" style={{ fontSize: '0.8rem' }}>
            ↗ Preview Embed
          </a>
        </div>
        <div className="dashboard-tip" style={{ marginTop: 14 }}>
          <strong>Tip:</strong> Set the iframe <code>height</code> to <code>1100</code> for the full bracket view. The embed polls for live updates every 30 seconds.
        </div>
      </div>

      {/* Bracket Image Card */}
      <div className="card card-gold" style={{ maxWidth: 560, marginTop: 28 }}>
        <h3 className="card-section-title">Bracket Image (PNG)</h3>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-dim)', marginBottom: 14, lineHeight: 1.6 }}>
          High-resolution parchment bracket image for embedding in blog posts and sharing on social media. Click <strong style={{ color: 'var(--text)' }}>Regenerate</strong> after updating matchup results.
        </p>

        {/* Preview */}
        <div style={{
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          overflow: 'hidden',
          marginBottom: 14,
          background: '#d6c9ac',
        }}>
          <img
            src={`${imageApiUrl}?t=${imageKey}`}
            alt="Bracket Preview"
            style={{ width: '100%', height: 'auto', display: 'block' }}
            onError={e => { e.target.alt = 'Not yet generated — click Regenerate'; e.target.style.padding = '40px'; e.target.style.textAlign = 'center'; }}
          />
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn btn-gold" onClick={regenerateBracketImage} disabled={generating}>
            {generating ? '⟳ Generating…' : '⟳ Regenerate'}
          </button>
          <button className="btn btn-outline" onClick={downloadBracketImage}>
            ⬇ Download PNG
          </button>
          <a href={imageApiUrl} target="_blank" rel="noopener noreferrer" className="btn btn-outline" style={{ fontSize: '0.8rem' }}>
            ↗ Full Size
          </a>
          {genMsg && <span style={{ fontSize: '0.78rem', color: genMsg.startsWith('Error') ? '#c44' : 'var(--gold)' }}>{genMsg}</span>}
        </div>

        {/* Embed code */}
        <div className="embed-code-block">
          <code>{imageImgTag}</code>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 12, alignItems: 'center' }}>
          <button className="btn btn-gold" onClick={copyImageCode}>
            {imageCopied ? '✓ Copied!' : '⎘ Copy Embed Code'}
          </button>
        </div>

        <div className="dashboard-tip" style={{ marginTop: 14 }}>
          <strong>Tip:</strong> After closing a round and declaring winners, click "Regenerate" to update the bracket image. The PNG is cached for 5 minutes.
        </div>
      </div>

      <style>{`
        .embed-code-block {
          background: var(--bg-deepest);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 12px 14px;
          overflow-x: auto;
          font-size: 0.72rem;
          line-height: 1.5;
        }
        .embed-code-block code {
          font-family: 'Courier New', monospace;
          color: var(--gold-dim);
          white-space: pre;
        }
      `}</style>
    </div>
  );
}

// ─── Main Admin Page ───────────────────────────────────────────────────────────
export default function AdminPage() {
  const [token, setToken] = useState(() => sessionStorage.getItem('memm_admin_token'));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('seeding-config');

  useEffect(() => {
    if (token) loadData();
  }, [token]);

  async function loadData() {
    if (!data) setLoading(true);
    try { setData(await getTournament()); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  if (!token) return <AdminLogin onLogin={setToken} />;
  if (!data) return <div className="loading-wrap"><div className="loading-ring" /><span>Loading admin panel…</span></div>;

  const tabs = [
    { id: 'seeding-config', label: 'Seeding Config' },
    { id: 'seeding-contenders', label: 'Contenders' },
    { id: 'seeding-ballots', label: 'Ballots' },
    { id: 'teams', label: 'Teams' },
    { id: 'bracket', label: 'Bracket Setup' },
    { id: 'matchups', label: 'Matchups' },
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'settings', label: 'Settings' }
  ];

  return (
    <div className="page admin-page">
      <div className="admin-topbar">
        <div className="page-title" style={{ marginBottom: 0, fontSize: '1.5rem' }}>Admin Panel</div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontFamily: 'var(--font-heading)' }}>
            {data.settings.name} {data.settings.year}
          </span>
          <button className="btn btn-ghost" style={{ fontSize: '0.75rem' }} onClick={() => { sessionStorage.removeItem('memm_admin_token'); setToken(null); }}>Logout</button>
        </div>
      </div>

      <div className="tabs">
        {tabs.map(t => <button key={t.id} className={`tab-btn ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>)}
      </div>

      {tab === 'seeding-config' && <SeedingConfigTab token={token} />}
      {tab === 'seeding-contenders' && <SeedingContendersTab token={token} />}
      {tab === 'seeding-ballots' && <SeedingBallotsTab token={token} />}
      {tab === 'teams' && <TeamsManager data={data} token={token} onRefresh={loadData} />}
      {tab === 'bracket' && <BracketSetup data={data} token={token} onRefresh={loadData} />}
      {tab === 'matchups' && <MatchupManager data={data} token={token} onRefresh={loadData} />}
      {tab === 'dashboard' && <DashboardSetup data={data} token={token} onRefresh={loadData} />}
      {tab === 'settings' && <Settings data={data} token={token} onRefresh={loadData} />}

      <style>{`
        .admin-page { max-width: 1200px; }
        .admin-topbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 28px; }
        .admin-section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
        .admin-section-header h2 {
          font-family: var(--font-heading);
          font-size: 1.2rem;
          color: var(--text);
          letter-spacing: 0.05em;
        }
        .admin-count {
          font-size: 0.75rem;
          color: var(--text-muted);
          font-weight: normal;
          margin-left: 8px;
        }
        .card-section-title {
          font-family: var(--font-heading);
          font-size: 0.85rem;
          color: var(--gold-dim);
          letter-spacing: 0.1em;
          text-transform: uppercase;
          margin-bottom: 16px;
        }
        .region-team-header {
          font-family: var(--font-heading);
          font-size: 0.95rem;
          color: var(--gold-dim);
          letter-spacing: 0.08em;
          margin-bottom: 10px;
          padding-bottom: 6px;
          border-bottom: 1px solid var(--border);
        }

        /* Team form */
        .form-row { display: flex; gap: 12px; }
        .form-actions { display: flex; gap: 10px; align-items: center; margin-top: 12px; }

        /* Form image picker */
        .form-image-picker {
          width: 100px;
          height: 130px;
          flex-shrink: 0;
          border-radius: var(--radius);
          overflow: hidden;
          background: var(--bg-dark);
          border: 1px dashed var(--border);
          position: relative;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: border-color 0.18s;
        }
        .form-image-picker:hover { border-color: var(--gold-dim); }
        .form-image-preview { width: 100%; height: 100%; object-fit: cover; object-position: top; display: block; }
        .form-image-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 4px;
          color: var(--text-muted);
          font-family: var(--font-heading);
          font-size: 0.7rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          text-align: center;
          padding: 8px;
        }
        .form-image-overlay {
          position: absolute;
          inset: 0;
          background: rgba(0,0,0,0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: var(--font-heading);
          font-size: 0.65rem;
          color: rgba(255,255,255,0.8);
          letter-spacing: 0.1em;
          text-transform: uppercase;
          opacity: 0;
          transition: opacity 0.15s;
        }
        .form-image-picker:hover .form-image-overlay { opacity: 1; }
        .msg-success { color: var(--green-bright); font-family: var(--font-heading); font-size: 0.8rem; }
        .msg-error { color: #c05050; font-family: var(--font-heading); font-size: 0.8rem; }
        .success-msg { background: rgba(39,165,90,0.15); border: 1px solid var(--green); color: var(--green-bright); padding: 10px 14px; border-radius: var(--radius); margin-bottom: 12px; }

        /* Team grid */
        .team-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
        .team-card {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        .team-card-img {
          width: 100%;
          aspect-ratio: 3/4;
          background: var(--bg-mid);
          overflow: hidden;
          position: relative;
          cursor: pointer;
        }
        .team-card-img img { width: 100%; height: 100%; object-fit: cover; object-position: top; transition: transform 0.3s; }
        .team-card-img:hover img { transform: scale(1.04); }
        .team-card-img-placeholder { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 2.5rem; color: var(--text-muted); }
        .team-card-img-overlay {
          position: absolute;
          inset: 0;
          background: rgba(0,0,0,0.55);
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: var(--font-heading);
          font-size: 0.7rem;
          color: rgba(255,255,255,0.7);
          letter-spacing: 0.1em;
          text-transform: uppercase;
          opacity: 0;
          transition: opacity 0.18s;
        }
        .team-card-img:hover .team-card-img-overlay { opacity: 1; }
        .team-card-info { padding: 10px 12px; flex: 1; }
        .team-card-name { font-family: var(--font-heading); font-size: 0.85rem; color: var(--text); margin-bottom: 4px; }
        .team-card-seed { font-size: 0.7rem; color: var(--gold-dim); }
        .team-card-desc { font-size: 0.75rem; color: var(--text-muted); margin-top: 4px; font-style: italic; }
        .team-card-actions { display: flex; gap: 6px; padding: 8px 12px; border-top: 1px solid var(--border); background: var(--bg-dark); }

        /* Seed grid */
        .seed-grid { display: flex; flex-direction: column; gap: 8px; }
        .seed-row { display: flex; align-items: center; gap: 10px; padding: 8px; background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); }
        .seed-pos { font-family: var(--font-heading); font-size: 0.75rem; color: var(--text-muted); min-width: 28px; }
        .seed-vs { font-family: var(--font-heading); font-size: 0.7rem; color: var(--text-muted); flex-shrink: 0; }
        .team-select-wrap { display: flex; align-items: center; gap: 6px; flex: 1; }
        .team-select-thumb { width: 28px; height: 28px; border-radius: 3px; object-fit: cover; flex-shrink: 0; }

        /* Matchup manager */
        .matchup-manager-list { display: flex; flex-direction: column; gap: 8px; }
        .matchup-row {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 10px 14px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .matchup-row.status-active { border-color: var(--green); background: rgba(39,165,90,0.04); }
        .matchup-row.status-closed { opacity: 0.75; }
        .matchup-row-info { display: flex; align-items: center; gap: 10px; }
        .matchup-row-label { font-family: var(--font-heading); font-size: 0.75rem; color: var(--text-dim); flex: 1; letter-spacing: 0.06em; }
        .matchup-row-teams { display: flex; align-items: center; gap: 10px; }
        .matchup-row-vs { font-family: var(--font-heading); font-size: 0.7rem; color: var(--text-muted); flex-shrink: 0; }
        .matchup-row-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }

        .team-mini { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; }
        .team-mini.is-winner .team-mini-name { color: var(--gold); }
        .team-mini.tbd .team-mini-name { color: var(--text-muted); font-style: italic; }
        .team-mini-img { width: 32px; height: 32px; border-radius: 3px; object-fit: cover; object-position: top; flex-shrink: 0; }
        .team-mini-info { min-width: 0; }
        .team-mini-name { font-family: var(--font-heading); font-size: 1rem; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .team-mini-votes { font-size: 0.85rem; color: var(--gold-dim); font-weight: 600; }

        /* Dashboard setup */
        .dashboard-matchup-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 8px;
          border-radius: 4px;
          cursor: pointer;
          transition: background 0.12s;
          border: 1px solid transparent;
        }
        .dashboard-matchup-item:hover { background: var(--bg-hover); }
        .dashboard-matchup-item.in-order { background: rgba(212,175,55,0.08); border-color: var(--border-gold); }
        .order-item { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 4px; border: 1px solid var(--border); margin-bottom: 4px; background: var(--bg-mid); }
        .order-item.current { border-color: var(--gold-dim); background: rgba(212,175,55,0.08); }
        .order-num { font-family: var(--font-heading); font-size: 0.72rem; color: var(--text-muted); min-width: 20px; }
        .order-label { flex: 1; font-size: 0.75rem; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }

        .dashboard-tip {
          background: rgba(42, 37, 53, 0.5);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 14px 16px;
          font-size: 0.82rem;
          color: var(--text-dim);
          margin-top: 20px;
          line-height: 1.6;
        }
        .dashboard-tip code { background: var(--bg-dark); color: var(--gold); padding: 1px 6px; border-radius: 3px; font-size: 0.8em; }

        /* Misc */
        .empty-setup-msg { color: var(--text-dim); padding: 20px; font-size: 0.9rem; line-height: 1.6; }
      `}</style>
    </div>
  );
}

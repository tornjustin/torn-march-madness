import React, { useState, useEffect, useCallback } from 'react';
import { getSeedingData, updateSeedingConfig, setSeedingPhase } from '../../api';

const PHASE_LABELS = {
  intake: 'Staff Intake',
  ballot: 'Seeding Ballot',
  assignment: 'Division Assignment',
  complete: 'Complete',
};

const PHASE_DESCRIPTIONS = {
  intake: 'Staff can submit new contender suggestions. The /seeding page is active.',
  ballot: 'Staff can rank contenders via the /seeding/ballot page. The intake window will be closed automatically.',
  assignment: 'Ballot voting is closed. Compute rankings, assign divisions, and finalize the bracket.',
  complete: 'Seeding is finalized. The tournament bracket is ready to go live.',
};

const PHASE_WARNINGS = {
  ballot: 'This will close the intake window. Staff will no longer be able to submit new contenders.',
  assignment: 'This will close the ballot window. Staff will no longer be able to vote. Make sure all ballots are in!',
  complete: 'This marks seeding as done. Make sure divisions and seeds have been assigned before completing.',
};

const PHASE_ORDER = ['intake', 'ballot', 'assignment', 'complete'];

function StatusBadge({ status }) {
  const colors = { pending: 'var(--text-muted)', open: 'var(--green-bright)', closed: '#c05050' };
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 3,
      fontSize: '0.7rem',
      fontFamily: 'var(--font-heading)',
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      border: `1px solid ${colors[status] || 'var(--border)'}`,
      color: colors[status] || 'var(--text-muted)',
    }}>{status}</span>
  );
}

export default function SeedingConfigTab({ token }) {
  const [seeding, setSeeding] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [phaseLoading, setPhaseLoading] = useState(false);
  const [msg, setMsg] = useState('');

  // Local config form state
  const [intakeOpens, setIntakeOpens] = useState('');
  const [intakeCloses, setIntakeCloses] = useState('');
  const [intakeStatus, setIntakeStatus] = useState('pending');
  const [ballotOpens, setBallotOpens] = useState('');
  const [ballotCloses, setBallotCloses] = useState('');
  const [ballotStatus, setBallotStatus] = useState('pending');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getSeedingData(token);
      setSeeding(data);
      const c = data.config;
      setIntakeOpens(c.intake.opensAt ? toLocalDatetime(c.intake.opensAt) : '');
      setIntakeCloses(c.intake.closesAt ? toLocalDatetime(c.intake.closesAt) : '');
      setIntakeStatus(c.intake.status);
      setBallotOpens(c.ballot.opensAt ? toLocalDatetime(c.ballot.opensAt) : '');
      setBallotCloses(c.ballot.closesAt ? toLocalDatetime(c.ballot.closesAt) : '');
      setBallotStatus(c.ballot.status);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  function toLocalDatetime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function toISO(localDt) {
    if (!localDt) return null;
    return new Date(localDt).toISOString();
  }

  async function handleSaveConfig(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await updateSeedingConfig({
        intake: { opensAt: toISO(intakeOpens), closesAt: toISO(intakeCloses), status: intakeStatus },
        ballot: { opensAt: toISO(ballotOpens), closesAt: toISO(ballotCloses), status: ballotStatus },
      }, token);
      flash('Config saved!');
      load();
    } catch (e) {
      flash('Error: ' + (e.error || e.message), true);
    } finally {
      setSaving(false);
    }
  }

  async function handlePhase(phase) {
    const warning = PHASE_WARNINGS[phase];
    const msg = `Advance to "${PHASE_LABELS[phase]}" phase?` + (warning ? `\n\n⚠️ ${warning}` : '');
    if (!confirm(msg)) return;
    setPhaseLoading(true);
    try {
      await setSeedingPhase(phase, token);
      flash(`Phase set to ${PHASE_LABELS[phase]}`);
      load();
    } catch (e) {
      flash('Error: ' + (e.error || e.message), true);
    } finally {
      setPhaseLoading(false);
    }
  }

  function flash(text, isError) {
    setMsg(isError ? 'Error: ' + text.replace('Error: ', '') : text);
    setTimeout(() => setMsg(''), 3000);
  }

  if (loading || !seeding) {
    return <div style={{ color: 'var(--text-muted)', padding: 20 }}>Loading seeding data...</div>;
  }

  const { config, contenders, staff, ballots } = seeding;
  const currentIdx = PHASE_ORDER.indexOf(config.phase);
  const submittedBallots = ballots.filter(b => b.status === 'submitted').length;

  return (
    <div>
      <div className="admin-section-header">
        <h2>Seeding Configuration</h2>
      </div>

      {/* Stats cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
        <StatCard label="Current Phase" value={PHASE_LABELS[config.phase]} />
        <StatCard label="Contenders" value={contenders.length} />
        <StatCard label="Staff Members" value={staff.length} />
        <StatCard label="Ballots Submitted" value={`${submittedBallots} / ${staff.length}`} />
      </div>

      {/* Phase controls */}
      <div className="card card-gold" style={{ marginBottom: 24 }}>
        <h3 className="card-section-title">Phase Control</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {PHASE_ORDER.map((p, i) => (
            <button
              key={p}
              className={`btn ${config.phase === p ? 'btn-gold' : 'btn-outline'}`}
              style={{ fontSize: '0.78rem', opacity: i < currentIdx ? 0.5 : 1 }}
              disabled={phaseLoading || config.phase === p}
              onClick={() => handlePhase(p)}
            >
              {PHASE_LABELS[p]}
            </button>
          ))}
        </div>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 10 }}>
          {PHASE_DESCRIPTIONS[config.phase]}
        </p>
        {PHASE_WARNINGS[PHASE_ORDER[currentIdx + 1]] && (
          <p style={{
            fontSize: '0.75rem',
            color: 'var(--gold)',
            marginTop: 8,
            padding: '8px 12px',
            background: 'rgba(var(--gold-rgb, 198,163,80), 0.08)',
            border: '1px solid rgba(var(--gold-rgb, 198,163,80), 0.2)',
            borderRadius: 'var(--radius)',
          }}>
            Next phase: <strong>{PHASE_LABELS[PHASE_ORDER[currentIdx + 1]]}</strong> — {PHASE_WARNINGS[PHASE_ORDER[currentIdx + 1]]}
          </p>
        )}
      </div>

      {/* Window config */}
      <form onSubmit={handleSaveConfig}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
          {/* Intake window */}
          <div className="card card-gold">
            <h3 className="card-section-title">
              Intake Window <StatusBadge status={intakeStatus} />
            </h3>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0 0 14px' }}>
              When open, staff can submit new contender suggestions via the <strong>/seeding</strong> page.
              Set dates to auto-open/close, or override manually with the status dropdown.
            </p>
            <div className="form-group">
              <label className="form-label">Opens At</label>
              <input type="datetime-local" className="form-input" value={intakeOpens} onChange={e => setIntakeOpens(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Closes At</label>
              <input type="datetime-local" className="form-input" value={intakeCloses} onChange={e => setIntakeCloses(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Status</label>
              <select className="form-select" value={intakeStatus} onChange={e => setIntakeStatus(e.target.value)}>
                <option value="pending">Pending</option>
                <option value="open">Open</option>
                <option value="closed">Closed</option>
              </select>
            </div>
          </div>

          {/* Ballot window */}
          <div className="card card-gold">
            <h3 className="card-section-title">
              Ballot Window <StatusBadge status={ballotStatus} />
            </h3>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0 0 14px' }}>
              When open, staff can rank contenders on the <strong>/seeding/ballot</strong> page by
              assigning them to tiers (4-pt favorites down to 1-pt honorable mentions).
              Ballots can be saved as drafts or submitted as final.
            </p>
            <div className="form-group">
              <label className="form-label">Opens At</label>
              <input type="datetime-local" className="form-input" value={ballotOpens} onChange={e => setBallotOpens(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Closes At</label>
              <input type="datetime-local" className="form-input" value={ballotCloses} onChange={e => setBallotCloses(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Status</label>
              <select className="form-select" value={ballotStatus} onChange={e => setBallotStatus(e.target.value)}>
                <option value="pending">Pending</option>
                <option value="open">Open</option>
                <option value="closed">Closed</option>
              </select>
            </div>
          </div>
        </div>

        {msg && <div className={msg.startsWith('Error') ? 'msg-error' : 'msg-success'} style={{ marginBottom: 12 }}>{msg}</div>}
        <button type="submit" className="btn btn-gold" disabled={saving}>
          {saving ? 'Saving...' : 'Save Config'}
        </button>
      </form>

      <style>{`
        @media (max-width: 700px) {
          .card-grid-2col { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      padding: '14px 16px',
      textAlign: 'center',
    }}>
      <div style={{
        fontFamily: 'var(--font-heading)',
        fontSize: '1.3rem',
        color: 'var(--gold)',
        marginBottom: 4,
      }}>{value}</div>
      <div style={{
        fontFamily: 'var(--font-heading)',
        fontSize: '0.65rem',
        color: 'var(--text-muted)',
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
      }}>{label}</div>
    </div>
  );
}

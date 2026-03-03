import React, { useState, useEffect, useCallback } from 'react';
import { getSeedingData, updateSeedingConfig, setSeedingPhase } from '../../api';

const PHASE_LABELS = {
  intake: 'Staff Intake',
  ballot: 'Seeding Ballot',
  assignment: 'Division Assignment',
  complete: 'Complete',
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
    if (!confirm(`Advance to "${PHASE_LABELS[phase]}" phase?`)) return;
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
          Current phase determines which pages are accessible to staff.
        </p>
      </div>

      {/* Window config */}
      <form onSubmit={handleSaveConfig}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
          {/* Intake window */}
          <div className="card card-gold">
            <h3 className="card-section-title">
              Intake Window <StatusBadge status={intakeStatus} />
            </h3>
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

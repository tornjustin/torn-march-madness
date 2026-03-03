import React, { useState } from 'react';
import { staffLogin } from '../api';

export default function StaffLogin({ onLogin }) {
  const [email, setEmail] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setErr('');

    const trimmed = email.trim().toLowerCase();
    if (!trimmed.endsWith('@theonering.net')) {
      setErr('Please use your @theonering.net email address');
      return;
    }

    setLoading(true);
    try {
      const result = await staffLogin(trimmed);
      sessionStorage.setItem('memm_staff_token', result.token);
      onLogin(result);
    } catch (e) {
      setErr(e.error || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="staff-login-page">
      <div className="staff-login-box">
        <div className="staff-login-icon">&#x1F9DD;</div>
        <h1 className="staff-login-title">Staff Portal</h1>
        <p className="staff-login-sub">Middle-earth March Madness</p>
        <form onSubmit={handleSubmit}>
          <input
            type="email"
            className="form-input"
            placeholder="you@theonering.net"
            value={email}
            onChange={e => setEmail(e.target.value)}
            autoFocus
            style={{ marginBottom: 12 }}
          />
          {err && <div className="error-msg" style={{ marginBottom: 12 }}>{err}</div>}
          <button type="submit" className="btn btn-gold" style={{ width: '100%' }} disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
        <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 16, lineHeight: 1.5 }}>
          Use your @theonering.net email to sign in.
          No password needed — your email is your identity.
        </p>
      </div>

      <style>{`
        .staff-login-page {
          min-height: calc(100vh - 64px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          background: radial-gradient(ellipse at center, var(--bg-mid) 0%, var(--bg-deepest) 70%);
        }
        .staff-login-box {
          background: var(--bg-card);
          border: 1px solid var(--border-gold);
          border-radius: var(--radius-lg);
          padding: 40px;
          width: 100%;
          max-width: 380px;
          text-align: center;
          box-shadow: var(--shadow), var(--shadow-gold);
        }
        .staff-login-icon { font-size: 2.5rem; margin-bottom: 12px; }
        .staff-login-title {
          font-family: var(--font-title);
          font-size: 1.5rem;
          color: var(--gold);
          margin-bottom: 4px;
        }
        .staff-login-sub {
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

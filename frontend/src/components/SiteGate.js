import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import axios from 'axios';
import { usePublicConfig } from '../context/PublicConfigContext';

const API_BASE = process.env.REACT_APP_API_BASE || '/api';

export default function SiteGate({ children }) {
  const location = useLocation();
  const { config, refetch } = usePublicConfig();
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    refetch();
  }, [location.pathname, refetch]);

  const bypass = location.pathname.startsWith('/setup');
  if (bypass) {
    return children;
  }

  if (!config) {
    return <div className="site-gate-loading">Loading…</div>;
  }

  const gated = config.site_gated && !config.site_unlocked;
  if (!gated) {
    return children;
  }

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setErr('');
    try {
      await axios.post(`${API_BASE}/site-unlock`, { password });
      await refetch();
      setPassword('');
    } catch (err) {
      if (err.response?.status === 401) {
        setErr('Wrong password.');
      } else {
        setErr('Could not unlock. Try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="site-gate">
      <div className="site-gate-modal">
        <h2>{config.title || 'Password required'}</h2>
        {config.subtitle ? <p className="site-gate-sub">{config.subtitle}</p> : null}
        <p className="site-gate-copy">
          Enter the guest password to open the vote and results pages.
        </p>
        <form onSubmit={submit}>
          <div className="form-group">
            <label htmlFor="siteGatePw">Password</label>
            <input
              id="siteGatePw"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Guest password"
              autoComplete="current-password"
              autoFocus
            />
          </div>
          {err ? <p className="error">{err}</p> : null}
          <button type="submit" className="submit-btn" disabled={submitting}>
            {submitting ? 'Checking…' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  );
}

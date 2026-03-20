import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Navigate, Link } from 'react-router-dom';
import axios from 'axios';
import SetupPreview from './SetupPreview';
import { SETUP_DEFAULTS, setupValue } from '../setupDefaults';
import { isoToDatetimeLocal, datetimeLocalToIso } from '../utils/countdown';

const API_BASE = process.env.REACT_APP_API_BASE || '/api';
const EXPECTED_SLUG = process.env.REACT_APP_ADMIN_SETUP_PATH || 'dev';

const TABS = [
  { id: 'site', label: 'Basics' },
  { id: 'look', label: 'Colours' },
  { id: 'media', label: 'Photo' },
  { id: 'access', label: 'Guest access' },
  { id: 'reveal', label: 'Reveal & reset' },
  { id: 'voters', label: 'Votes' },
];

function adminHeaders(key) {
  return { 'X-Admin-Key': key };
}

function DefaultHint({ fieldKey }) {
  const d = SETUP_DEFAULTS[fieldKey];
  if (fieldKey === 'subtitle' && (d === '' || d === undefined)) {
    return <span className="field-default-hint">Default: none</span>;
  }
  if (d === undefined || d === '') return null;
  return (
    <span className="field-default-hint">
      Default: <span className="default-value-sample">{d}</span>
    </span>
  );
}

export default function AdminSetupPage() {
  const { setupSlug } = useParams();
  const [tab, setTab] = useState('site');
  const [adminKey, setAdminKey] = useState('');
  const [draft, setDraft] = useState(null);
  const [votes, setVotes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [gender, setGender] = useState('');
  const [sitePasswordNew, setSitePasswordNew] = useState('');
  const [sitePasswordConfirm, setSitePasswordConfirm] = useState('');
  const [partyStatus, setPartyStatus] = useState(null);
  const [adminKeyToast, setAdminKeyToast] = useState(null);
  const adminKeyToastTimerRef = useRef(null);

  const showAdminKeyToast = useCallback((text) => {
    setAdminKeyToast(text);
    if (adminKeyToastTimerRef.current) clearTimeout(adminKeyToastTimerRef.current);
    adminKeyToastTimerRef.current = setTimeout(() => {
      setAdminKeyToast(null);
      adminKeyToastTimerRef.current = null;
    }, 4200);
  }, []);

  useEffect(
    () => () => {
      if (adminKeyToastTimerRef.current) clearTimeout(adminKeyToastTimerRef.current);
    },
    [],
  );

  const voterLink =
    typeof window !== 'undefined' ? `${window.location.origin}/` : '/';

  useEffect(() => {
    axios
      .get(`${API_BASE}/config`)
      .then((r) => setDraft(r.data))
      .catch(() => setDraft({}));
  }, []);

  useEffect(() => {
    const key = adminKey.trim();
    if (!key) {
      setPartyStatus(null);
      return undefined;
    }
    let cancelled = false;
    const load = () => {
      axios
        .get(`${API_BASE}/admin/party-status`, { headers: adminHeaders(key) })
        .then((r) => {
          if (!cancelled) setPartyStatus({ ...r.data, invalidKey: false, loadError: false });
        })
        .catch((err) => {
          if (!cancelled) {
            if (err.response?.status === 401) {
              setPartyStatus({ invalidKey: true, loadError: false });
            } else {
              setPartyStatus({ loadError: true, invalidKey: false });
            }
          }
        });
    };
    load();
    const id = setInterval(load, 8000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [adminKey]);

  useEffect(() => {
    const key = adminKey.trim();
    if (!key) return undefined;
    const t = setTimeout(() => {
      axios
        .get(`${API_BASE}/admin/config`, { headers: adminHeaders(key) })
        .then((r) => {
          const d = r.data;
          setDraft((prev) =>
            prev
              ? {
                  ...prev,
                  scheduled_reveal_gender: d.scheduled_reveal_gender ?? '',
                  scheduled_reveal_auto: !!d.scheduled_reveal_auto,
                }
              : prev,
          );
        })
        .catch(() => {});
    }, 500);
    return () => clearTimeout(t);
  }, [adminKey]);

  const setField = (key, value) => {
    setDraft((d) => ({ ...d, [key]: value }));
  };

  const applyQuickBoyColor = (hex) => {
    if (!hex || typeof hex !== 'string') return;
    const v = hex.trim();
    setDraft((d) => {
      const next = { ...d, primary_color: v };
      if (/^#[0-9A-Fa-f]{6}$/.test(v)) {
        next.header_start = v;
      }
      return next;
    });
  };

  const applyQuickGirlColor = (hex) => {
    if (!hex || typeof hex !== 'string') return;
    const v = hex.trim();
    setDraft((d) => {
      const next = { ...d, secondary_color: v };
      if (/^#[0-9A-Fa-f]{6}$/.test(v)) {
        next.header_end = v;
      }
      return next;
    });
  };

  const saveConfig = async () => {
    if (!adminKey.trim()) {
      showAdminKeyToast('Enter your admin key to save.');
      return;
    }
    if (draft?.scheduled_reveal_auto) {
      if (!draft.scheduled_reveal_at?.trim()) {
        showAdminKeyToast('Set a date and time for auto-reveal, or turn off auto-reveal.');
        return;
      }
      const g = (draft.scheduled_reveal_gender || '').trim();
      if (g !== 'boy' && g !== 'girl') {
        showAdminKeyToast('Choose boy or girl for auto-reveal.');
        return;
      }
    }
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const res = await axios.put(`${API_BASE}/admin/config`, draft, {
        headers: adminHeaders(adminKey.trim()),
      });
      if (res.data && typeof res.data === 'object') {
        setDraft((d) => ({ ...d, ...res.data }));
      }
      setMessage('Saved.');
    } catch (err) {
      if (err.response?.status === 401) showAdminKeyToast('Invalid admin key.');
      else if (err.response?.status === 503) setError('Set ADMIN_KEY in backend/.env');
      else setError('Save failed.');
    } finally {
      setLoading(false);
    }
  };

  const clearScheduledReveal = async () => {
    if (!adminKey.trim()) {
      showAdminKeyToast('Enter your admin key.');
      return;
    }
    if (!draft) return;
    setError('');
    setMessage('');
    setLoading(true);
    try {
      await axios.put(
        `${API_BASE}/admin/config`,
        {
          ...draft,
          scheduled_reveal_at: '',
          scheduled_reveal_auto: false,
          scheduled_reveal_gender: '',
        },
        { headers: adminHeaders(adminKey.trim()) },
      );
      const r = await axios.get(`${API_BASE}/config`);
      setDraft((d) => ({
        ...d,
        ...r.data,
        scheduled_reveal_at: '',
        scheduled_reveal_auto: false,
        scheduled_reveal_gender: '',
      }));
      setMessage('Scheduled time cleared.');
    } catch (err) {
      if (err.response?.status === 401) showAdminKeyToast('Invalid admin key.');
      else setError('Could not clear schedule.');
    } finally {
      setLoading(false);
    }
  };

  const uploadHero = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !adminKey.trim()) {
      showAdminKeyToast('Choose a file and enter your admin key first.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await axios.post(`${API_BASE}/admin/upload`, fd, {
        headers: adminHeaders(adminKey.trim()),
      });
      const url = res.data?.url;
      if (url) {
        setDraft((d) => ({ ...d, hero_image_url: url }));
        setMessage('Uploaded — click Save to persist the image URL.');
      }
    } catch (err) {
      if (err.response?.status === 401) showAdminKeyToast('Invalid admin key.');
      else setError('Upload failed.');
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  };

  const uploadRevealAudio = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !adminKey.trim()) {
      showAdminKeyToast('Choose a file and enter your admin key first.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await axios.post(`${API_BASE}/admin/upload`, fd, {
        headers: adminHeaders(adminKey.trim()),
      });
      const url = res.data?.url;
      if (url) {
        setDraft((d) => ({ ...d, reveal_audio_url: url }));
        setMessage('Audio uploaded — click Save audio settings to persist.');
      }
    } catch (err) {
      if (err.response?.status === 401) showAdminKeyToast('Invalid admin key.');
      else setError(err.response?.data?.error || 'Upload failed.');
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  };

  const clearRevealAudio = async () => {
    if (!adminKey.trim()) {
      showAdminKeyToast('Enter your admin key.');
      return;
    }
    if (!draft) return;
    setError('');
    setMessage('');
    setLoading(true);
    try {
      await axios.put(
        `${API_BASE}/admin/config`,
        { ...draft, reveal_audio_url: '' },
        { headers: adminHeaders(adminKey.trim()) },
      );
      const r = await axios.get(`${API_BASE}/config`);
      setDraft((d) => ({ ...d, ...r.data, reveal_audio_url: '' }));
      setMessage('Reveal audio cleared.');
    } catch (err) {
      if (err.response?.status === 401) showAdminKeyToast('Invalid admin key.');
      else setError('Could not clear audio.');
    } finally {
      setLoading(false);
    }
  };

  const fetchVotes = useCallback(async () => {
    if (!adminKey.trim()) {
      showAdminKeyToast('Enter your admin key to load votes.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/admin/votes`, {
        headers: adminHeaders(adminKey.trim()),
      });
      setVotes(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      if (err.response?.status === 401) showAdminKeyToast('Invalid admin key.');
      else setError('Could not load votes.');
      setVotes([]);
    } finally {
      setLoading(false);
    }
  }, [adminKey, showAdminKeyToast]);

  const saveSiteAccess = async (clear) => {
    if (!adminKey.trim()) {
      showAdminKeyToast('Enter your admin key.');
      return;
    }
    if (!clear) {
      if (sitePasswordNew !== sitePasswordConfirm) {
        setError('Passwords do not match.');
        return;
      }
      if (!sitePasswordNew.trim()) {
        setError('Enter a new guest password, or use Remove password.');
        return;
      }
    }
    setError('');
    setMessage('');
    setLoading(true);
    try {
      await axios.put(
        `${API_BASE}/admin/config`,
        clear ? { clear_site_password: true } : { site_password: sitePasswordNew.trim() },
        { headers: adminHeaders(adminKey.trim()) },
      );
      const r = await axios.get(`${API_BASE}/config`);
      setDraft(r.data);
      setSitePasswordNew('');
      setSitePasswordConfirm('');
      setMessage(clear ? 'Guest password removed.' : 'Guest password saved.');
    } catch (err) {
      if (err.response?.status === 401) showAdminKeyToast('Invalid admin key.');
      else setError('Could not update guest password.');
    } finally {
      setLoading(false);
    }
  };

  const deleteVote = async (id) => {
    if (!adminKey.trim()) {
      showAdminKeyToast('Enter your admin key.');
      return;
    }
    if (!window.confirm('Delete this vote?')) return;
    try {
      await axios.delete(`${API_BASE}/admin/votes/${id}`, {
        headers: adminHeaders(adminKey.trim()),
      });
      await fetchVotes();
    } catch {
      setError('Delete failed.');
    }
  };

  const doReveal = async (e) => {
    e.preventDefault();
    if (!adminKey.trim()) {
      showAdminKeyToast('Enter your admin key.');
      return;
    }
    if (!gender) {
      setError('Choose boy or girl to reveal.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await axios.post(
        `${API_BASE}/admin/reveal`,
        { gender },
        { headers: adminHeaders(adminKey.trim()) },
      );
      setMessage('Revealed.');
    } catch (err) {
      if (err.response?.status === 401) showAdminKeyToast('Invalid admin key.');
      else setError('Reveal failed.');
    } finally {
      setLoading(false);
    }
  };

  const doReset = async () => {
    if (!adminKey.trim()) {
      showAdminKeyToast('Enter your admin key.');
      return;
    }
    if (!window.confirm('Reset ALL votes and clear reveal?')) return;
    setLoading(true);
    setError('');
    try {
      await axios.post(`${API_BASE}/admin/reset`, {}, { headers: adminHeaders(adminKey.trim()) });
      setMessage('Reset complete.');
      try {
        const r = await axios.get(`${API_BASE}/admin/party-status`, {
          headers: adminHeaders(adminKey.trim()),
        });
        setPartyStatus({ ...r.data, invalidKey: false, loadError: false });
      } catch {
        /* interval will retry */
      }
    } catch (err) {
      if (err.response?.status === 401) showAdminKeyToast('Invalid admin key.');
      else setError('Reset failed.');
    } finally {
      setLoading(false);
    }
  };

  if (setupSlug !== EXPECTED_SLUG) {
    return <Navigate to="/" replace />;
  }

  if (!draft) {
    return <div className="admin-setup-loading">Loading setup…</div>;
  }

  const boyHex =
    draft.primary_color && /^#[0-9A-Fa-f]{6}$/.test(draft.primary_color)
      ? draft.primary_color
      : setupValue(draft, 'primary_color');
  const girlHex =
    draft.secondary_color && /^#[0-9A-Fa-f]{6}$/.test(draft.secondary_color)
      ? draft.secondary_color
      : setupValue(draft, 'secondary_color');

  return (
    <div className="admin-setup">
      <div className="admin-setup-intro">
        <h2>Party setup</h2>
        <p className="admin-setup-lead">
          Start with <strong>Basics</strong> and <strong>Colours</strong> — the preview updates as you type.
          Open <strong>Advanced</strong> only if you want to tweak every label or the header gradient by hand.
        </p>
        <p className="voter-link-row">
          <span className="voter-link-label">Guest voting link:</span>
          <code className="voter-link-url">{voterLink}</code>
          <button
            type="button"
            className="copy-link-btn"
            onClick={() => {
              navigator.clipboard.writeText(voterLink);
              setMessage('Link copied.');
            }}
          >
            Copy
          </button>
        </p>
        <p>
          <Link to="/">Preview site</Link>
          {' · '}
          <Link to="/results">Preview results</Link>
        </p>
      </div>

      {!adminKey.trim() ? (
        <p className="admin-setup-event-banner admin-setup-event-banner--muted">
          Enter your <strong>admin key</strong> below to see whether guests have already voted or the reveal has
          happened — setup does not reset the database by itself.
        </p>
      ) : partyStatus?.invalidKey ? (
        <p className="admin-setup-event-banner admin-setup-event-banner--muted">
          Could not load party status — check your admin key.
        </p>
      ) : partyStatus?.loadError ? (
        <p className="admin-setup-event-banner admin-setup-event-banner--muted">
          Could not load party status. Check the API and try again.
        </p>
      ) : partyStatus ? (
        <div
          className={`admin-setup-event-banner ${
            partyStatus.revealed
              ? 'admin-setup-event-banner--revealed'
              : partyStatus.total_votes > 0
                ? 'admin-setup-event-banner--voting'
                : 'admin-setup-event-banner--fresh'
          }`}
        >
          {partyStatus.revealed ? (
            <>
              <strong>Reveal already happened.</strong> It&apos;s a{' '}
              {partyStatus.actual_gender === 'boy' ? 'boy' : 'girl'}. Guests see full results on{' '}
              <Link to="/results">/results</Link>. To run another round, open{' '}
              <strong>Reveal &amp; reset</strong> and use <strong>Reset all data</strong> (clears votes and the
              reveal).
            </>
          ) : partyStatus.total_votes > 0 ? (
            <>
              <strong>Voting in progress.</strong> {partyStatus.total_votes} vote
              {partyStatus.total_votes === 1 ? '' : 's'} so far (boy {partyStatus.boy}, girl {partyStatus.girl}
              ).
            </>
          ) : (
            <>
              <strong>No votes yet.</strong> Share the guest link above when you&apos;re ready.
            </>
          )}
        </div>
      ) : null}

      <div className="form-group admin-key-row">
        <label htmlFor="setupAdminKey">Admin key (from backend/.env)</label>
        <input
          id="setupAdminKey"
          type="password"
          value={adminKey}
          onChange={(e) => setAdminKey(e.target.value)}
          placeholder="ADMIN_KEY"
          autoComplete="off"
        />
      </div>

      <div className="admin-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={tab === t.id ? 'active' : ''}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <p className="error">{error}</p>}
      {message && <p className="admin-msg">{message}</p>}

      {tab === 'site' && (
        <section className="admin-panel">
          <SetupPreview draft={draft} />

          <h3 className="admin-section-title">Quick edits</h3>
          <p className="hint admin-section-lead">
            These are the fields most hosts change. Empty fields use the defaults shown in italics.
          </p>

          <div className="form-group">
            <label>
              Event title <DefaultHint fieldKey="title" />
            </label>
            <input
              value={draft.title ?? ''}
              onChange={(e) => setField('title', e.target.value)}
              placeholder={SETUP_DEFAULTS.title}
            />
          </div>
          <div className="form-group">
            <label>
              Subtitle <DefaultHint fieldKey="subtitle" />
            </label>
            <input
              value={draft.subtitle ?? ''}
              onChange={(e) => setField('subtitle', e.target.value)}
              placeholder="Optional line under the title"
            />
          </div>
          <div className="form-group">
            <label>
              Main question <DefaultHint fieldKey="vote_heading" />
            </label>
            <input
              value={draft.vote_heading ?? ''}
              onChange={(e) => setField('vote_heading', e.target.value)}
              placeholder={SETUP_DEFAULTS.vote_heading}
            />
          </div>
          <div className="form-group">
            <label>
              Name field label <DefaultHint fieldKey="name_label" />
            </label>
            <input
              value={draft.name_label ?? ''}
              onChange={(e) => setField('name_label', e.target.value)}
              placeholder={SETUP_DEFAULTS.name_label}
            />
          </div>
          <div className="form-group">
            <label>
              Name box placeholder <DefaultHint fieldKey="name_placeholder" />
            </label>
            <input
              value={draft.name_placeholder ?? ''}
              onChange={(e) => setField('name_placeholder', e.target.value)}
              placeholder={SETUP_DEFAULTS.name_placeholder}
            />
          </div>
          <div className="form-group">
            <label>
              Girl button <DefaultHint fieldKey="girl_button_text" />
            </label>
            <input
              value={draft.girl_button_text ?? ''}
              onChange={(e) => setField('girl_button_text', e.target.value)}
              placeholder={SETUP_DEFAULTS.girl_button_text}
            />
          </div>
          <div className="form-group">
            <label>
              Boy button <DefaultHint fieldKey="boy_button_text" />
            </label>
            <input
              value={draft.boy_button_text ?? ''}
              onChange={(e) => setField('boy_button_text', e.target.value)}
              placeholder={SETUP_DEFAULTS.boy_button_text}
            />
          </div>
          <div className="form-group">
            <label>
              Submit button <DefaultHint fieldKey="submit_button_text" />
            </label>
            <input
              value={draft.submit_button_text ?? ''}
              onChange={(e) => setField('submit_button_text', e.target.value)}
              placeholder={SETUP_DEFAULTS.submit_button_text}
            />
          </div>

          <button type="button" className="submit-btn" onClick={saveConfig} disabled={loading}>
            Save guest page
          </button>

          <details className="admin-advanced">
            <summary>Advanced — results page wording</summary>
            <p className="hint">
              Shown on the live results and reveal screens. Leave blank to use defaults.
            </p>
            <div className="form-group">
              <label>
                Live results heading <DefaultHint fieldKey="live_results_heading" />
              </label>
              <input
                value={draft.live_results_heading ?? ''}
                onChange={(e) => setField('live_results_heading', e.target.value)}
                placeholder={SETUP_DEFAULTS.live_results_heading}
              />
            </div>
            <div className="form-group">
              <label>
                After reveal — section title <DefaultHint fieldKey="guessing_results_heading" />
              </label>
              <input
                value={draft.guessing_results_heading ?? ''}
                onChange={(e) => setField('guessing_results_heading', e.target.value)}
                placeholder={SETUP_DEFAULTS.guessing_results_heading}
              />
            </div>
            <div className="form-group">
              <label>Correct / incorrect column titles</label>
              <input
                value={draft.correct_guesses_label ?? ''}
                onChange={(e) => setField('correct_guesses_label', e.target.value)}
                placeholder={SETUP_DEFAULTS.correct_guesses_label}
              />
              <input
                style={{ marginTop: 8 }}
                value={draft.incorrect_guesses_label ?? ''}
                onChange={(e) => setField('incorrect_guesses_label', e.target.value)}
                placeholder={SETUP_DEFAULTS.incorrect_guesses_label}
              />
            </div>
            <div className="form-group">
              <label>
                Live results footnote <DefaultHint fieldKey="refresh_note" />
              </label>
              <input
                value={draft.refresh_note ?? ''}
                onChange={(e) => setField('refresh_note', e.target.value)}
                placeholder={SETUP_DEFAULTS.refresh_note}
              />
            </div>
            <button type="button" className="submit-btn admin-advanced-save" onClick={saveConfig} disabled={loading}>
              Save wording
            </button>
          </details>
        </section>
      )}

      {tab === 'look' && (
        <section className="admin-panel">
          <SetupPreview draft={draft} />

          <h3 className="admin-section-title">Quick theme</h3>
          <p className="hint admin-section-lead">
            Girl and boy colours drive the vote buttons and the top banner gradient (girl → right, boy → left).
          </p>
          <div className="quick-theme-row">
            <div className="form-group quick-color">
              <label>Boy (left of banner, boy button)</label>
              <div className="quick-color-inputs">
                <input
                  type="color"
                  value={boyHex}
                  onChange={(e) => applyQuickBoyColor(e.target.value)}
                  aria-label="Boy colour"
                />
                <input
                  type="text"
                  value={draft.primary_color ?? ''}
                  placeholder={SETUP_DEFAULTS.primary_color}
                  onChange={(e) => applyQuickBoyColor(e.target.value)}
                  spellCheck={false}
                />
              </div>
            </div>
            <div className="form-group quick-color">
              <label>Girl (right of banner, girl button)</label>
              <div className="quick-color-inputs">
                <input
                  type="color"
                  value={girlHex}
                  onChange={(e) => applyQuickGirlColor(e.target.value)}
                  aria-label="Girl colour"
                />
                <input
                  type="text"
                  value={draft.secondary_color ?? ''}
                  placeholder={SETUP_DEFAULTS.secondary_color}
                  onChange={(e) => applyQuickGirlColor(e.target.value)}
                  spellCheck={false}
                />
              </div>
            </div>
          </div>
          <button type="button" className="submit-btn" onClick={saveConfig} disabled={loading}>
            Save colours
          </button>

          <details className="admin-advanced">
            <summary>Advanced — separate header gradient &amp; chart colours</summary>
            <p className="hint">
              Override the quick theme if you want the banner to differ from the buttons or charts.
            </p>
            {['header_start', 'header_end', 'primary_color', 'secondary_color'].map((k) => (
              <div className="form-group color-row" key={k}>
                <label>{k.replace(/_/g, ' ')}</label>
                <input
                  type="color"
                  value={
                    draft[k] && /^#[0-9A-Fa-f]{6}$/.test(draft[k]) ? draft[k] : SETUP_DEFAULTS[k] || '#89cff0'
                  }
                  onChange={(e) => setField(k, e.target.value)}
                />
                <input
                  value={draft[k] ?? ''}
                  onChange={(e) => setField(k, e.target.value)}
                  placeholder={SETUP_DEFAULTS[k]}
                />
              </div>
            ))}
            <button type="button" className="submit-btn admin-advanced-save" onClick={saveConfig} disabled={loading}>
              Save advanced colours
            </button>
          </details>
        </section>
      )}

      {tab === 'access' && (
        <section className="admin-panel">
          <h3>Guest site password</h3>
          <p className="hint">
            When set, visitors must enter this password before the vote and results pages (not the setup
            URL). Share it only with guests you invite.
          </p>
          <p className="hint">
            Status:{' '}
            <strong>{draft.site_gated ? 'Enabled' : 'Off'}</strong>
          </p>
          <div className="form-group">
            <label htmlFor="sitePw1">New guest password</label>
            <input
              id="sitePw1"
              type="password"
              value={sitePasswordNew}
              onChange={(e) => setSitePasswordNew(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div className="form-group">
            <label htmlFor="sitePw2">Confirm</label>
            <input
              id="sitePw2"
              type="password"
              value={sitePasswordConfirm}
              onChange={(e) => setSitePasswordConfirm(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <button
            type="button"
            className="submit-btn"
            onClick={() => saveSiteAccess(false)}
            disabled={loading}
          >
            Save guest password
          </button>
          <button
            type="button"
            className="reset-btn"
            style={{ marginLeft: 12 }}
            onClick={() => saveSiteAccess(true)}
            disabled={loading || !draft.site_gated}
          >
            Remove password
          </button>
        </section>
      )}

      {tab === 'media' && (
        <section className="admin-panel">
          <SetupPreview draft={draft} />
          <h3 className="admin-section-title">Hero photo</h3>
          <p className="hint">
            Optional image above the question on the vote page. PNG, JPG, GIF, or WebP (max 20 MB).
          </p>
          <div className="form-group">
            <label>Upload</label>
            <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={uploadHero} />
          </div>
          <div className="form-group">
            <label>Or paste image URL</label>
            <input
              value={draft.hero_image_url ?? ''}
              onChange={(e) => setField('hero_image_url', e.target.value)}
              placeholder="e.g. /uploads/...."
            />
          </div>
          {draft.hero_image_url ? (
            <div className="hero-preview">
              <img src={draft.hero_image_url} alt="Hero preview" />
            </div>
          ) : null}
          <button type="button" className="submit-btn" onClick={saveConfig} disabled={loading}>
            Save photo
          </button>
        </section>
      )}

      {tab === 'reveal' && (
        <section className="admin-panel">
          <h3>Scheduled reveal (optional)</h3>
          <p className="hint">
            On <strong>/results</strong>, guests see a live countdown until this moment. The picker uses your
            browser&apos;s timezone. You can also let the server reveal automatically at that time (no need to
            click Reveal below).
          </p>
          <div className="form-group admin-checkbox-row">
            <label>
              <input
                type="checkbox"
                checked={!!draft.scheduled_reveal_auto}
                onChange={(e) => setField('scheduled_reveal_auto', e.target.checked)}
              />{' '}
              Automatically reveal at this time
            </label>
          </div>
          {draft.scheduled_reveal_auto ? (
            <div className="form-group">
              <span className="admin-label">Auto-reveal gender</span>
              <div className="gender-options">
                <button
                  type="button"
                  className={`gender-btn ${(draft.scheduled_reveal_gender || '') === 'girl' ? 'selected' : ''}`}
                  onClick={() => setField('scheduled_reveal_gender', 'girl')}
                >
                  Girl
                </button>
                <button
                  type="button"
                  className={`gender-btn ${(draft.scheduled_reveal_gender || '') === 'boy' ? 'selected' : ''}`}
                  onClick={() => setField('scheduled_reveal_gender', 'boy')}
                >
                  Boy
                </button>
              </div>
              <p className="hint">Stored only on the server — never shown to guests until reveal.</p>
            </div>
          ) : null}
          <div className="form-group">
            <label htmlFor="scheduledRevealAt">Date &amp; time</label>
            <input
              id="scheduledRevealAt"
              type="datetime-local"
              value={isoToDatetimeLocal(draft.scheduled_reveal_at ?? '')}
              onChange={(e) => setField('scheduled_reveal_at', datetimeLocalToIso(e.target.value))}
            />
          </div>
          <div className="form-group">
            <label htmlFor="scheduledRevealHeading">Countdown heading</label>
            <input
              id="scheduledRevealHeading"
              value={draft.scheduled_reveal_heading ?? ''}
              onChange={(e) => setField('scheduled_reveal_heading', e.target.value)}
              placeholder={SETUP_DEFAULTS.scheduled_reveal_heading}
            />
          </div>
          <div className="admin-schedule-actions">
            <button type="button" className="submit-btn" onClick={saveConfig} disabled={loading}>
              Save schedule
            </button>
            <button type="button" className="reset-btn" onClick={clearScheduledReveal} disabled={loading}>
              Clear scheduled time
            </button>
          </div>

          <hr className="admin-divider" />

          <h3>Reveal</h3>
          <form onSubmit={doReveal} className="reveal-mini-form">
            <div className="gender-options">
              <button
                type="button"
                className={`gender-btn ${gender === 'girl' ? 'selected' : ''}`}
                onClick={() => setGender('girl')}
              >
                Girl
              </button>
              <button
                type="button"
                className={`gender-btn ${gender === 'boy' ? 'selected' : ''}`}
                onClick={() => setGender('boy')}
              >
                Boy
              </button>
            </div>
            <button type="submit" className="reveal-btn" disabled={loading}>
              Reveal gender
            </button>
          </form>

          <h3>Celebration audio (optional)</h3>
          <p className="hint">
            Plays on <strong>/results</strong> when the gender is revealed. Many browsers block autoplay until
            the visitor interacts — a play button appears if needed. MP3, M4A, WAV, OGG, FLAC, AAC, WebM (upload
            max ~20 MB).
          </p>
          <div className="form-group">
            <label>Upload</label>
            <input
              type="file"
              accept="audio/*,.mp3,.m4a,.wav,.ogg,.aac,.flac,.webm"
              onChange={uploadRevealAudio}
            />
          </div>
          <div className="form-group">
            <label htmlFor="revealAudioUrl">Or paste audio URL</label>
            <input
              id="revealAudioUrl"
              value={draft.reveal_audio_url ?? ''}
              onChange={(e) => setField('reveal_audio_url', e.target.value)}
              placeholder="e.g. /uploads/...."
            />
          </div>
          <div className="form-group">
            <label htmlFor="revealAudioBtnLabel">Play button label (if autoplay is blocked)</label>
            <input
              id="revealAudioBtnLabel"
              value={draft.reveal_audio_button_label ?? ''}
              onChange={(e) => setField('reveal_audio_button_label', e.target.value)}
              placeholder={SETUP_DEFAULTS.reveal_audio_button_label}
            />
          </div>
          {draft.reveal_audio_url ? (
            <div className="form-group">
              <span className="admin-label">Preview</span>
              <audio controls src={draft.reveal_audio_url} className="reveal-audio-preview-el" />
            </div>
          ) : null}
          <div className="admin-schedule-actions">
            <button type="button" className="submit-btn" onClick={saveConfig} disabled={loading}>
              Save audio settings
            </button>
            <button type="button" className="reset-btn" onClick={clearRevealAudio} disabled={loading}>
              Clear audio
            </button>
          </div>

          <h3>Reset</h3>
          <p className="hint">Clears every vote and the reveal state.</p>
          <button type="button" className="reset-btn" onClick={doReset} disabled={loading}>
            Reset all data
          </button>
        </section>
      )}

      {tab === 'voters' && (
        <section className="admin-panel">
          <h3>Votes</h3>
          <button type="button" className="submit-btn" onClick={fetchVotes} disabled={loading}>
            Load votes
          </button>
          {votes.length > 0 && (
            <table className="admin-votes-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Vote</th>
                  <th>IP</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {votes.map((v) => (
                  <tr key={v.id}>
                    <td>{v.id}</td>
                    <td>{v.name}</td>
                    <td>{v.vote}</td>
                    <td>{v.ip_address}</td>
                    <td>
                      <button type="button" onClick={() => deleteVote(v.id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {adminKeyToast ? (
        <div className="admin-key-toast" role="alert" aria-live="assertive">
          {adminKeyToast}
        </div>
      ) : null}
    </div>
  );
}

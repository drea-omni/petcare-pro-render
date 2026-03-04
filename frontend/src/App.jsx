import { useState, useEffect, useRef } from 'react';

// ─── Constants ───────────────────────────────────────────────────────────────
const PERMISSIONS = ['VIEWER', 'RESTRICTED_QUERIER'];
const MODES = [
  { value: 'SINGLE_CONTENT', label: 'Single Content Mode' },
  { value: 'APPLICATION', label: 'Application Mode' },
];

// ─── App ─────────────────────────────────────────────────────────────────────
export default function App() {
  // State
  const [isDark, setIsDark] = useState(false);
  const [clinics, setClinics] = useState([]);
  const [selectedClinic, setSelectedClinic] = useState(null);
  const [permission, setPermission] = useState('VIEWER');
  const [mode, setMode] = useState('SINGLE_CONTENT');
  const [embedUrl, setEmbedUrl] = useState('');
  const [clinicTheme, setClinicTheme] = useState({ accent: '#e37803', background: '#FAFAFA' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [events, setEvents] = useState([]);
  const iframeRef = useRef(null);

  // ─── Smart mode enforcement ─────────────────────────────────────────────────
  useEffect(() => {
    if (permission === 'RESTRICTED_QUERIER') {
      setMode('APPLICATION');
    }
  }, [permission]);

  // ─── Fetch clinics from backend ─────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/clinics')
      .then(r => r.json())
      .then(data => {
        setClinics(data);
        if (data.length > 0) setSelectedClinic(data[0]);
      })
      .catch(err => setError('Failed to load clinics: ' + err.message));
  }, []);

  // ─── Listen for Omni postMessage events ────────────────────────────────────
  useEffect(() => {
    const handler = (event) => {
      if (!event.data?.type?.startsWith('omni:')) return;
      const entry = {
        time: new Date().toLocaleTimeString(),
        type: event.data.type,
        data: JSON.stringify(event.data, null, 2),
      };
      setEvents(prev => [entry, ...prev].slice(0, 20));
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // ─── Generate embed URL ─────────────────────────────────────────────────────
  async function handleGenerate() {
    if (!selectedClinic) return;
    setLoading(true);
    setError('');
    setEmbedUrl('');

    try {
      const res = await fetch('/api/embed-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinicId: selectedClinic.clinic_id,
          clinicName: selectedClinic.clinic_name,
          permission,
          mode,
          isDark,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate URL');

      setEmbedUrl(data.embedUrl);
      if (data.theme) setClinicTheme(data.theme);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // ─── Theme vars ─────────────────────────────────────────────────────────────
  const appBg = isDark ? '#1a0e05' : '#FAFAFA';
  const headerBg = isDark
    ? 'linear-gradient(135deg, #372006, #4e3922)'
    : 'linear-gradient(135deg, #e37803, #fc9e36)';
  const cardBg = isDark ? '#2d1a0a' : '#ffffff';
  const textPrimary = isDark ? '#f4cea4' : '#4e3922';
  const textSecondary = isDark ? '#c9a07a' : '#7a5c3e';
  const borderColor = isDark ? '#4e3922' : '#f0dcc8';
  const accent = clinicTheme.accent;

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: appBg, fontFamily: "'Segoe UI', system-ui, sans-serif", transition: 'all 0.3s' }}>

      {/* ── Header ── */}
      <header style={{ background: headerBg, padding: '0 24px', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 2px 12px rgba(0,0,0,0.15)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ background: '#fff', borderRadius: '10px', padding: '6px 10px', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
            <img src="/petcarepro_logo.png" alt="PetCare Pro" style={{ height: '32px', display: 'block' }} />
          </div>
          <span style={{ color: '#fff', fontWeight: 700, fontSize: '18px', letterSpacing: '-0.3px' }}>
            PetCare Pro
          </span>
        </div>
        <span style={{ color: '#fff', opacity: 0.8, fontSize: '13px', fontWeight: 500 }}>
          Analytics Portal
        </span>
        <button
          onClick={() => setIsDark(d => !d)}
          title="Toggle theme"
          style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '8px', padding: '8px 12px', cursor: 'pointer', fontSize: '18px', transition: 'all 0.2s' }}
        >
          {isDark ? '☀️' : '🌙'}
        </button>
      </header>

      {/* ── Main Layout ── */}
      <div style={{ display: 'flex', gap: '20px', padding: '24px', maxWidth: '1600px', margin: '0 auto' }}>

        {/* ── Control Panel ── */}
        <aside style={{ width: '280px', flexShrink: 0 }}>
          <div style={{ background: cardBg, borderRadius: '16px', padding: '24px', border: `1px solid ${borderColor}`, boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
            <h2 style={{ color: textPrimary, fontSize: '15px', fontWeight: 700, margin: '0 0 20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              🐾 Launch Cradle
            </h2>

            {/* Clinic Select */}
            <label style={{ display: 'block', marginBottom: '16px' }}>
              <span style={{ color: textSecondary, fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Clinic</span>
              <select
                value={selectedClinic?.clinic_id || ''}
                onChange={e => {
                  const c = clinics.find(x => x.clinic_id === e.target.value);
                  setSelectedClinic(c);
                  setEmbedUrl('');
                }}
                style={{ width: '100%', marginTop: '6px', padding: '10px 12px', borderRadius: '10px', border: `1px solid ${borderColor}`, background: appBg, color: textPrimary, fontSize: '14px', outline: 'none', cursor: 'pointer' }}
              >
                {clinics.map(c => (
                  <option key={c.clinic_id} value={c.clinic_id}>{c.clinic_name}</option>
                ))}
              </select>
            </label>

            {/* Permission */}
            <div style={{ marginBottom: '16px' }}>
              <span style={{ color: textSecondary, fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '8px' }}>Permission</span>
              <div style={{ display: 'flex', gap: '8px' }}>
                {PERMISSIONS.map(p => (
                  <button
                    key={p}
                    onClick={() => setPermission(p)}
                    style={{
                      flex: 1, padding: '8px 4px', borderRadius: '8px', border: `2px solid ${permission === p ? accent : borderColor}`,
                      background: permission === p ? accent : 'transparent', color: permission === p ? '#fff' : textSecondary,
                      fontSize: '12px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
                    }}
                  >
                    {p === 'VIEWER' ? '👁 Viewer' : '🔍 Explorer'}
                  </button>
                ))}
              </div>
              {permission === 'RESTRICTED_QUERIER' && (
                <p style={{ color: accent, fontSize: '11px', margin: '6px 0 0', fontStyle: 'italic' }}>
                  ↑ Auto-switched to Application Mode
                </p>
              )}
            </div>

            {/* Mode */}
            <div style={{ marginBottom: '20px' }}>
              <span style={{ color: textSecondary, fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '8px' }}>Embed Mode</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {MODES.map(m => {
                  const isDisabled = m.value === 'SINGLE_CONTENT' && permission === 'RESTRICTED_QUERIER';
                  const isActive = mode === m.value;
                  return (
                    <button
                      key={m.value}
                      onClick={() => !isDisabled && setMode(m.value)}
                      disabled={isDisabled}
                      style={{
                        padding: '10px 12px', borderRadius: '8px',
                        border: `2px solid ${isActive ? accent : borderColor}`,
                        background: isActive ? `${accent}18` : 'transparent',
                        color: isDisabled ? textSecondary : (isActive ? accent : textSecondary),
                        fontSize: '13px', fontWeight: isActive ? 700 : 500,
                        cursor: isDisabled ? 'not-allowed' : 'pointer',
                        opacity: isDisabled ? 0.5 : 1,
                        textAlign: 'left', transition: 'all 0.2s',
                      }}
                    >
                      {m.value === 'SINGLE_CONTENT' ? '📊 ' : '🖥️ '}{m.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Generate Button */}
            <button
              onClick={handleGenerate}
              disabled={loading || !selectedClinic}
              style={{
                width: '100%', padding: '12px', borderRadius: '10px',
                background: loading ? textSecondary : `linear-gradient(135deg, ${accent}, ${accent}cc)`,
                color: '#fff', border: 'none', fontSize: '15px', fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer', boxShadow: `0 4px 14px ${accent}55`,
                transition: 'all 0.2s',
              }}
            >
              {loading ? '⏳ Generating...' : '🚀 Launch Analytics'}
            </button>

            {error && (
              <div style={{ marginTop: '12px', padding: '10px', background: '#fee2e2', borderRadius: '8px', color: '#dc2626', fontSize: '12px' }}>
                ❌ {error}
              </div>
            )}

            {/* Clinic Theme Swatch */}
            {selectedClinic && (
              <div style={{ marginTop: '20px', padding: '12px', background: `${clinicTheme.accent}18`, borderRadius: '10px', border: `1px solid ${clinicTheme.accent}44` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: clinicTheme.accent }} />
                  <span style={{ color: textSecondary, fontSize: '12px', fontWeight: 600 }}>Clinic Theme</span>
                </div>
                <p style={{ color: textSecondary, fontSize: '11px', margin: '4px 0 0' }}>{clinicTheme.accent}</p>
              </div>
            )}
          </div>

          {/* Event Log */}
          {events.length > 0 && (
            <div style={{ marginTop: '16px', background: cardBg, borderRadius: '16px', padding: '16px', border: `1px solid ${borderColor}` }}>
              <h3 style={{ color: textPrimary, fontSize: '13px', fontWeight: 700, margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                📡 Omni Events
              </h3>
              <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                {events.map((ev, i) => (
                  <div key={i} style={{ marginBottom: '8px', padding: '8px', background: `${accent}10`, borderRadius: '6px', borderLeft: `3px solid ${accent}` }}>
                    <div style={{ color: accent, fontSize: '11px', fontWeight: 700 }}>{ev.time} · {ev.type}</div>
                    <pre style={{ color: textSecondary, fontSize: '10px', margin: '4px 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                      {ev.data}
                    </pre>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* ── Embed Area ── */}
        <main style={{ flex: 1, minWidth: 0 }}>
          {embedUrl ? (
            <div style={{ borderRadius: '16px', overflow: 'hidden', boxShadow: '0 8px 40px rgba(0,0,0,0.12)', border: `1px solid ${borderColor}`, height: 'calc(100vh - 112px)' }}>
              <iframe
                ref={iframeRef}
                src={embedUrl}
                title="PetCare Pro Analytics"
                style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
                allow="fullscreen"
              />
            </div>
          ) : (
            <div style={{ height: 'calc(100vh - 112px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRadius: '16px', border: `2px dashed ${borderColor}`, background: cardBg }}>
              <div style={{ fontSize: '64px', marginBottom: '16px' }}>🐾</div>
              <h2 style={{ color: textPrimary, margin: '0 0 8px', fontWeight: 700 }}>Ready to Explore</h2>
              <p style={{ color: textSecondary, margin: 0, fontSize: '15px' }}>
                Select a clinic and click <strong>Launch Analytics</strong> to begin
              </p>
              <div style={{ marginTop: '24px', display: 'flex', gap: '12px' }}>
                {[
                  { icon: '📊', label: 'Dashboard View' },
                  { icon: '🔍', label: 'Data Exploration' },
                  { icon: '🔒', label: 'Row-Level Security' },
                  { icon: '🎨', label: 'Per-Tenant Theming' },
                ].map(f => (
                  <div key={f.label} style={{ padding: '12px 16px', background: `${accent}12`, borderRadius: '10px', textAlign: 'center', border: `1px solid ${accent}30` }}>
                    <div style={{ fontSize: '24px' }}>{f.icon}</div>
                    <div style={{ color: textSecondary, fontSize: '12px', marginTop: '4px', fontWeight: 600 }}>{f.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

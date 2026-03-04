import React, { useState } from 'react';

function App() {
  const [email, setEmail] = useState('');
  const [connectionRole, setConnectionRole] = useState('VIEWER');
  const [mode, setMode] = useState('SINGLE_CONTENT'); // Dashboard by default
  const [embedUrl, setEmbedUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [clinics, setClinics] = useState([]);
  const [loadingClinics, setLoadingClinics] = useState(true);
  const [theme, setTheme] = useState('light'); // Theme state

  // Apply theme to document
  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  // Auto-switch to APPLICATION mode when RESTRICTED_QUERIER is selected
  React.useEffect(() => {
    if (connectionRole === 'RESTRICTED_QUERIER' && mode === 'SINGLE_CONTENT') {
      setMode('APPLICATION');
    }
  }, [connectionRole, mode]);

  // Fetch clinic list on mount
  React.useEffect(() => {
    const fetchClinics = async () => {
      try {
        const response = await fetch('/api/clinics');
        const data = await response.json();
        if (data.success) {
          setClinics(data.clinics);
        }
      } catch (err) {
        console.error('Failed to fetch clinics:', err);
      } finally {
        setLoadingClinics(false);
      }
    };
    fetchClinics();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/embed-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, connectionRole, mode }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to generate embed URL');
      }

      setEmbedUrl(data.embedUrl);
    } catch (err) {
      setError(err.message);
      setEmbedUrl(null);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setEmail('');
    setEmbedUrl(null);
    setError(null);
  };

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <img 
          src="/petcarepro_logo.png" 
          alt="PetCare Pro" 
          className="header-logo"
        />
        <div className="header-content">
          <h1>🐾 PetCare Pro Analytics</h1>
          <p className="subtitle">Embedded Analytics Demo</p>
        </div>
        <button onClick={toggleTheme} className="theme-toggle" aria-label="Toggle theme">
          {theme === 'light' ? '🌙' : '☀️'}
        </button>
      </header>

      {/* Main Content */}
      <main className="main-content">
        {!embedUrl ? (
          /* Login Form */
          <div className="login-container">
            {/* Logo Section */}
            <div className="logo-section">
              <img 
                src="/petcarepro_logo.png" 
                alt="PetCare Pro" 
                className="app-logo"
              />
            </div>

            <div className="login-card">
              <div className="card-icon">📊</div>
              <h2>Access Your Analytics</h2>
              <p className="login-description">
                Enter your clinic email to view your personalized dashboard
              </p>

              <form onSubmit={handleSubmit}>
                <div className="form-group">
                  <label htmlFor="email">Select Clinic</label>
                  {loadingClinics ? (
                    <div className="loading-message">Loading clinics...</div>
                  ) : (
                    <select
                      id="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      disabled={loading}
                      className="clinic-select"
                    >
                      <option value="">-- Choose a clinic --</option>
                      {clinics.map((clinic) => (
                        <option key={clinic.email} value={clinic.email}>
                          {clinic.clinic_name} ({clinic.email})
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="form-group">
                  <label htmlFor="connectionRole">Connection Role</label>
                  <select
                    id="connectionRole"
                    value={connectionRole}
                    onChange={(e) => setConnectionRole(e.target.value)}
                    disabled={loading}
                    className="role-select"
                  >
                    <option value="VIEWER">Viewer - Read-only access</option>
                    <option value="RESTRICTED_QUERIER">Restricted Querier - Can explore data</option>
                  </select>
                  <small className="role-hint">
                    {connectionRole === 'VIEWER' 
                      ? '👁️ View dashboards only, no editing' 
                      : '🔍 Explore data and create custom analyses'}
                  </small>
                </div>

                <div className="form-group">
                  <label>Experience Mode</label>
                  <div className="mode-selector">
                    <button
                      type="button"
                      className={`mode-button ${mode === 'SINGLE_CONTENT' ? 'active' : ''} ${connectionRole === 'RESTRICTED_QUERIER' ? 'disabled' : ''}`}
                      onClick={() => setMode('SINGLE_CONTENT')}
                      disabled={loading || connectionRole === 'RESTRICTED_QUERIER'}
                    >
                      <span className="mode-icon">📊</span>
                      <div className="mode-text">
                        <strong>Single Content Mode</strong>
                      </div>
                    </button>

                    <button
                      type="button"
                      className={`mode-button ${mode === 'APPLICATION' ? 'active' : ''}`}
                      onClick={() => setMode('APPLICATION')}
                      disabled={loading}
                    >
                      <span className="mode-icon">🔍</span>
                      <div className="mode-text">
                        <strong>Application Mode</strong>
                      </div>
                    </button>
                  </div>
                  {connectionRole === 'RESTRICTED_QUERIER' && (
                    <small className="mode-hint">
                      ℹ️ Restricted Querier requires Application Mode
                    </small>
                  )}
                </div>

                {error && (
                  <div className="error-message">
                    ⚠️ {error}
                  </div>
                )}

                <button 
                  type="submit" 
                  className="submit-button"
                  disabled={loading}
                >
                  {loading ? 'Loading...' : 'Access Analytics'}
                </button>
              </form>

              <div className="demo-hint">
                <small>💡 <strong>Demo Tip:</strong> Select a clinic, pick permissions, and see RLS in action!</small>
              </div>
            </div>
          </div>
        ) : (
          /* Embedded Analytics */
          <div className="embed-container">
            {/* Simple Header */}
            <div className="embed-header">
              <div className="embed-info">
                <span className="user-email">👤 {email}</span>
                <span className="role-badge">
                  {connectionRole === 'VIEWER' ? '👁️ Viewer' : '🔍 Restricted Querier'}
                </span>
                <span className="mode-badge">
                  {mode === 'SINGLE_CONTENT' ? '📊 Single Content Mode' : '🔍 Application Mode'}
                </span>
              </div>
              <button onClick={handleReset} className="reset-button">
                ← Back to Login
              </button>
            </div>

            {/* Omni Embed */}
            <div className="embed-wrapper">
              <iframe
                src={embedUrl}
                className="embed-iframe"
                title="PetCare Pro Analytics"
                allow="clipboard-write"
              />
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="app-footer">
        <p>Powered by <strong>Omni Analytics</strong> • Multi-tenant embedded analytics showcase</p>
      </footer>
    </div>
  );
}

export default App;

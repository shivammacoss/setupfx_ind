import { useState } from 'react';
import '../Auth/Auth.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function AdminLogin({ onLogin, adminTheme = 'dark', onToggleTheme }) {
  const [formData, setFormData] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleChange = (e) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/api/auth/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Login failed');
        setLoading(false);
        return;
      }

      if (data.success) {
        localStorage.setItem('SetupFX-admin-token', data.token);
        localStorage.setItem('SetupFX-admin-user', JSON.stringify(data.user));
        onLogin(data.user, data.token);
      }
    } catch (err) {
      setError('Server not reachable. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {typeof onToggleTheme === 'function' && (
        <button
          type="button"
          className="admin-login-theme-toggle"
          onClick={onToggleTheme}
          aria-label={adminTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          title={adminTheme === 'dark' ? 'Light theme' : 'Dark theme'}
        >
          {adminTheme === 'dark' ? '☀️' : '🌙'}
        </button>
      )}
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <h1 className="auth-logo">SetupFX</h1>
          <p className="auth-subtitle">Admin Panel Login</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {error && <div className="auth-error">{error}</div>}

          <div className="form-group">
            <label>Email or User ID</label>
            <input
              type="text"
              name="username"
              placeholder="admin@SetupFX.com"
              value={formData.username}
              onChange={handleChange}
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <div className="password-input-wrapper">
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                placeholder="Enter admin password"
                value={formData.password}
                onChange={handleChange}
                required
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? '👁️' : '👁️‍🗨️'}
              </button>
            </div>
          </div>

          <button type="submit" className="auth-submit-btn" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In to Admin'}
          </button>
        </form>

        <div className="auth-footer">
          <p>
            <a href="/">Back to Trading Platform</a>
          </p>
        </div>
      </div>
    </div>
    </>
  );
}

export default AdminLogin;

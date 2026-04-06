import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../Auth/Auth.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function SubAdminLogin() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/api/admin/auth/login`, {
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

      if (data.success && data.admin) {
        // Check if this is a sub_admin
        if (data.admin.role !== 'sub_admin') {
          setError('Access denied. This login is for Sub-Admins only.');
          setLoading(false);
          return;
        }
        
        // Store admin data
        localStorage.setItem('SetupFX-admin-token', 'admin-' + data.admin._id);
        localStorage.setItem('SetupFX-admin-user', JSON.stringify(data.admin));
        localStorage.setItem('SetupFX-admin', JSON.stringify(data.admin));
        navigate('/subadmin-panel');
        window.location.reload();
      }
    } catch (err) {
      setError('Server not reachable. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <h1 className="auth-logo">SetupFX</h1>
          <p className="auth-subtitle">Sub-Admin Login</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {error && <div className="auth-error">{error}</div>}

          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              name="email"
              placeholder="admin@example.com"
              value={formData.email}
              onChange={handleChange}
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              name="password"
              placeholder="Enter your password"
              value={formData.password}
              onChange={handleChange}
              required
            />
          </div>

          <button type="submit" className="auth-submit-btn" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In as Sub-Admin'}
          </button>
        </form>

        <div className="auth-footer">
          <p>
            <a href="/">Back to Trading Platform</a>
          </p>
          <p style={{ marginTop: 8 }}>
            <a href="/broker">Broker Login</a> | <a href="/admin">Super Admin Login</a>
          </p>
        </div>
      </div>
    </div>
  );
}

export default SubAdminLogin;

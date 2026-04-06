import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import TubesBackground from '../../components/TubesBackground';
import tradingSounds from '../../utils/sounds';
import './Auth.css';

const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

function Login({ onLogin }) {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    username: '',
    password: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Validation
    if (!formData.username || !formData.password) {
      setError('Please fill in all fields');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: formData.username,
          password: formData.password
        })
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Login failed');
        setLoading(false);
        return;
      }

      // Login successful
      const authData = {
        isAuthenticated: true,
        token: data.token,
        user: data.user
      };
      
      localStorage.setItem('SetupFX-auth', JSON.stringify(authData));
      localStorage.setItem('SetupFX-token', data.token);
      
      // Play login sound
      tradingSounds.playLogin();
      
      onLogin(authData);
      navigate('/');
    } catch (err) {
      setError('Server error. Please try again.');
      console.error('Login error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
    <TubesBackground enableClickInteraction={true}>
      <div className="auth-container tubes-auth">
        <div className="auth-card">
          <div className="auth-header">
            <img src="/landing/img/logo1.png" alt="SetupFX" className="auth-logo-img" />
            <p className="auth-subtitle">Welcome back! Please login to continue.</p>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            {error && <div className="auth-error">{error}</div>}

            <div className="form-group">
              <label htmlFor="username">User ID / Email / Phone</label>
              <input
                type="text"
                id="username"
                name="username"
                value={formData.username}
                onChange={handleChange}
                placeholder="Enter your ID, email or phone"
                autoComplete="username"
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <div className="password-input-wrapper">
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="Enter your password"
                  autoComplete="current-password"
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

            <div className="form-options">
              <label className="remember-me">
                <input type="checkbox" />
                <span>Remember me</span>
              </label>
              <Link to="/forgot-password" className="forgot-link">Forgot Password?</Link>
            </div>

            <button type="submit" className="auth-submit-btn" disabled={loading}>
              {loading ? 'Logging in...' : 'Login'}
            </button>
          </form>

          <div className="auth-footer">
            <p>Don't have an account? <Link to="/register">Register Now</Link></p>
          </div>
        </div>
        
        <div className="tubes-hint">
          <span>✨ Click anywhere to change colors</span>
        </div>
      </div>
    </TubesBackground>
    </div>
  );
}

export default Login;

import { useState } from 'react';
import { Link } from 'react-router-dom';
import TubesBackground from '../../components/TubesBackground';
import './Auth.css';

const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

function ForgotPassword() {
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const sendCode = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Request failed');
        setLoading(false);
        return;
      }
      setSuccess(data.message || 'Check your email for a reset code.');
      setStep(2);
    } catch {
      setError('Server error. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    const otpDigits = otp.trim();
    if (!/^\d{6}$/.test(otpDigits)) {
      setError('Enter the 6-digit code from your email');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          otp: otpDigits,
          newPassword,
          confirmPassword
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Reset failed');
        setLoading(false);
        return;
      }
      setSuccess(data.message || 'Password updated.');
      setStep(3);
    } catch {
      setError('Server error. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <TubesBackground enableClickInteraction>
      <div className="auth-container tubes-auth">
        <div className="auth-card">
          <div className="auth-header">
            <img src="/landing/img/logo1.png" alt="SetupFX" className="auth-logo-img" />
            <p className="auth-subtitle">
              {step === 1 && 'Enter your email to receive a reset code.'}
              {step === 2 && 'Enter the code from your email and choose a new password.'}
              {step === 3 && 'You can log in with your new password.'}
            </p>
          </div>

          {error && <div className="auth-error">{error}</div>}
          {success && step !== 3 && <div className="auth-success" style={{ marginBottom: 12, color: '#22c55e' }}>{success}</div>}

          {step === 1 && (
            <form className="auth-form" onSubmit={sendCode}>
              <div className="form-group">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Registered email address"
                  required
                  autoComplete="email"
                />
              </div>
              <button type="submit" className="auth-submit-btn" disabled={loading}>
                {loading ? 'Sending…' : 'Send reset code'}
              </button>
            </form>
          )}

          {step === 2 && (
            <form className="auth-form" onSubmit={resetPassword}>
              <div className="form-group">
                <label htmlFor="otp">Reset code</label>
                <input
                  id="otp"
                  type="text"
                  inputMode="numeric"
                  maxLength={8}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  placeholder="6-digit code"
                  required
                  autoComplete="one-time-code"
                />
              </div>
              <div className="form-group">
                <label htmlFor="np">New password</label>
                <input
                  id="np"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  required
                  minLength={6}
                  autoComplete="new-password"
                />
              </div>
              <div className="form-group">
                <label htmlFor="cp">Confirm password</label>
                <input
                  id="cp"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat password"
                  required
                  autoComplete="new-password"
                />
              </div>
              <button type="submit" className="auth-submit-btn" disabled={loading}>
                {loading ? 'Updating…' : 'Update password'}
              </button>
            </form>
          )}

          {step === 3 && (
            <div style={{ textAlign: 'center', marginTop: 8 }}>
              <Link to="/login" className="auth-submit-btn" style={{ display: 'inline-block', textDecoration: 'none', padding: '12px 24px' }}>
                Back to login
              </Link>
            </div>
          )}

          <div className="auth-footer">
            <p><Link to="/login">← Back to login</Link></p>
          </div>
        </div>
      </div>
    </TubesBackground>
  );
}

export default ForgotPassword;

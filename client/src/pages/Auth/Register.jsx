import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import TubesBackground from '../../components/TubesBackground';
import './Auth.css';

const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

// Country codes list
const countries = [
  { code: '+91', name: 'India', flag: '🇮🇳' },
  { code: '+1', name: 'United States', flag: '🇺🇸' },
  { code: '+44', name: 'United Kingdom', flag: '🇬🇧' },
  { code: '+971', name: 'UAE', flag: '🇦🇪' },
  { code: '+966', name: 'Saudi Arabia', flag: '🇸🇦' },
  { code: '+65', name: 'Singapore', flag: '🇸🇬' },
  { code: '+61', name: 'Australia', flag: '🇦🇺' },
  { code: '+49', name: 'Germany', flag: '🇩🇪' },
  { code: '+33', name: 'France', flag: '🇫🇷' },
  { code: '+81', name: 'Japan', flag: '🇯🇵' },
  { code: '+86', name: 'China', flag: '🇨🇳' },
  { code: '+82', name: 'South Korea', flag: '🇰🇷' },
  { code: '+7', name: 'Russia', flag: '🇷🇺' },
  { code: '+55', name: 'Brazil', flag: '🇧🇷' },
  { code: '+27', name: 'South Africa', flag: '🇿🇦' },
  { code: '+234', name: 'Nigeria', flag: '🇳🇬' },
  { code: '+254', name: 'Kenya', flag: '🇰🇪' },
  { code: '+60', name: 'Malaysia', flag: '🇲🇾' },
  { code: '+63', name: 'Philippines', flag: '🇵🇭' },
  { code: '+62', name: 'Indonesia', flag: '🇮🇩' },
  { code: '+66', name: 'Thailand', flag: '🇹🇭' },
  { code: '+84', name: 'Vietnam', flag: '🇻🇳' },
  { code: '+92', name: 'Pakistan', flag: '🇵🇰' },
  { code: '+880', name: 'Bangladesh', flag: '🇧🇩' },
  { code: '+94', name: 'Sri Lanka', flag: '🇱🇰' },
  { code: '+977', name: 'Nepal', flag: '🇳🇵' },
];

function Register({ onLogin }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const termsRef = useRef(null);
  const [referralId, setReferralId] = useState('');
  const [referralFromLink, setReferralFromLink] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    countryCode: '+91',
    phone: '',
    city: '',
    state: '',
    password: '',
    confirmPassword: '',
    emailOtp: ''
  });
  const [signupOtpRequired, setSignupOtpRequired] = useState(false);
  const [emailConfigLoaded, setEmailConfigLoaded] = useState(false);
  const [otpSending, setOtpSending] = useState(false);
  const [otpCooldown, setOtpCooldown] = useState(0);

  useEffect(() => {
    const ref = searchParams.get('ref');
    if (ref) {
      setReferralId(ref);
      setReferralFromLink(true);
    }
  }, [searchParams]);

  useEffect(() => {
    let cancelled;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/auth/email-config`);
        const data = await res.json();
        if (!cancelled) setSignupOtpRequired(!!data.signupOtpRequired);
      } catch {
        if (!cancelled) setSignupOtpRequired(false);
      } finally {
        if (!cancelled) setEmailConfigLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (otpCooldown <= 0) return undefined;
    const t = setInterval(() => setOtpCooldown((c) => (c <= 1 ? 0 : c - 1)), 1000);
    return () => clearInterval(t);
  }, [otpCooldown]);

  const sendSignupOtp = async () => {
    setError('');
    setSuccess('');
    const email = formData.email?.trim();
    if (!email) {
      setError('Enter your email first, then request a code.');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Enter a valid email address');
      return;
    }
    setOtpSending(true);
    try {
      const res = await fetch(`${API_URL}/auth/send-signup-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not send code');
        return;
      }
      setSuccess(data.message || 'Verification code sent. Check your inbox.');
      setOtpCooldown(60);
    } catch {
      setError('Server error. Try again.');
    } finally {
      setOtpSending(false);
    }
  };

  useEffect(() => {
    document.body.style.overflow = 'auto';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    
    // For phone, only allow digits
    if (name === 'phone') {
      const digitsOnly = value.replace(/[^0-9]/g, '');
      setFormData({ ...formData, phone: digitsOnly });
    } else {
      setFormData({ ...formData, [name]: value });
    }
    setError('');
  };

  const selectedCountry = countries.find(c => c.code === formData.countryCode) || countries[0];

  // Handle terms scroll to enable accept button
  const handleTermsScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    if (scrollTop + clientHeight >= scrollHeight - 50) {
      setHasScrolledToBottom(true);
    }
  };

  // Open terms modal
  const openTermsModal = (e) => {
    e.preventDefault();
    setShowTermsModal(true);
    setHasScrolledToBottom(false);
  };

  // Accept terms
  const acceptTerms = () => {
    setTermsAccepted(true);
    setShowTermsModal(false);
  };

  // Decline terms
  const declineTerms = () => {
    setTermsAccepted(false);
    setShowTermsModal(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    // Validation
    if (!formData.name || !formData.email || !formData.phone || !formData.password || !formData.confirmPassword) {
      setError('Please fill in all fields');
      setLoading(false);
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters');
      setLoading(false);
      return;
    }

    if (signupOtpRequired) {
      const otp = String(formData.emailOtp || '').trim();
      if (!/^\d{6}$/.test(otp)) {
        setError('Enter the 6-digit email verification code (use “Send verification code” first).');
        setLoading(false);
        return;
      }
    }

    try {
      const response = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          emailOtp: formData.emailOtp?.trim() || undefined,
          parentAdminId: referralId || undefined
        })
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Registration failed');
        setLoading(false);
        return;
      }

      // Registration successful — auto-login and go straight to the market page
      setSuccess(`Registration successful! Your User ID is: ${data.user.oderId}`);

      if (data.token && data.user && typeof onLogin === 'function') {
        const authData = {
          isAuthenticated: true,
          token: data.token,
          user: data.user,
        };
        localStorage.setItem('SetupFX-auth', JSON.stringify(authData));
        localStorage.setItem('SetupFX-token', data.token);
        // Brief delay so the user sees their User ID, then drop them on the market
        setTimeout(() => {
          onLogin(authData);
          navigate('/app/market');
        }, 1500);
      } else {
        // Fallback: token missing for some reason — send them to login
        setTimeout(() => {
          navigate('/login');
        }, 3000);
      }
    } catch (err) {
      setError('Server error. Please try again.');
      console.error('Registration error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDemoRegister = async () => {
    setLoading(true);
    setError('');
    setSuccess('');

    // Validation
    if (!formData.name || !formData.email || !formData.phone || !formData.password || !formData.confirmPassword) {
      setError('Please fill in all fields for demo account');
      setLoading(false);
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters');
      setLoading(false);
      return;
    }

    if (signupOtpRequired) {
      const otp = String(formData.emailOtp || '').trim();
      if (!/^\d{6}$/.test(otp)) {
        setError('Enter the 6-digit email verification code for demo signup (same as full registration).');
        setLoading(false);
        return;
      }
    }

    try {
      const response = await fetch(`${API_URL}/auth/demo-register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          emailOtp: formData.emailOtp?.trim() || undefined
        })
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Demo registration failed');
        setLoading(false);
        return;
      }

      // Demo registration successful - auto login
      localStorage.setItem('SetupFX-token', data.token);
      localStorage.setItem('SetupFX-user', JSON.stringify(data.user));
      
      setSuccess(`Demo account created! ID: ${data.user.oderId}. Redirecting...`);
      
      setTimeout(() => {
        window.location.href = '/app/market';
      }, 1500);
    } catch (err) {
      setError('Server error. Please try again.');
      console.error('Demo registration error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <TubesBackground enableClickInteraction={true}>
      <div className="auth-container tubes-auth">
        <div className="auth-card">
          <div className="auth-header">
            <img src="/landing/img/logo1.png" alt="SetupFX" className="auth-logo-img" />
            <p className="auth-subtitle">Create your account to start trading</p>
          </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {error && <div className="auth-error">{error}</div>}
          {success && <div className="auth-success">{success}</div>}

          <div className="form-group">
            <label htmlFor="name">Full Name</label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="Enter your full name"
              autoComplete="name"
            />
          </div>

          <div className="form-group">
            <label htmlFor="email">Email Address</label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="Enter your email"
              autoComplete="email"
            />
            {signupOtpRequired && (
              <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <button
                  type="button"
                  className="auth-submit-btn"
                  onClick={sendSignupOtp}
                  disabled={otpSending || otpCooldown > 0}
                  style={{
                    padding: '8px 14px',
                    fontSize: 13,
                    background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                    flex: '1 1 auto',
                    minWidth: 140
                  }}
                >
                  {otpSending ? 'Sending…' : otpCooldown > 0 ? `Resend in ${otpCooldown}s` : 'Send verification code'}
                </button>
              </div>
            )}
          </div>

          {signupOtpRequired && (
            <div className="form-group">
              <label htmlFor="emailOtp">Email verification code</label>
              <input
                type="text"
                id="emailOtp"
                name="emailOtp"
                inputMode="numeric"
                maxLength={8}
                value={formData.emailOtp}
                onChange={(e) => setFormData({ ...formData, emailOtp: e.target.value.replace(/\D/g, '') })}
                placeholder="6-digit code from email"
                autoComplete="one-time-code"
              />
              <span className="password-hint">Required to complete signup when email verification is enabled.</span>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="phone">Phone Number</label>
            <div className="phone-input-group">
              <select
                name="countryCode"
                value={formData.countryCode}
                onChange={handleChange}
                className="country-select"
              >
                {countries.map(country => (
                  <option key={country.code} value={country.code}>
                    {country.flag} {country.code}
                  </option>
                ))}
              </select>
              <input
                type="tel"
                id="phone"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                placeholder="Phone number"
                autoComplete="tel"
                className="phone-input"
              />
            </div>
            <span className="phone-hint">{selectedCountry.flag} {selectedCountry.name}</span>
          </div>

          <div className="form-row" style={{ display: 'flex', gap: '12px' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label htmlFor="city">City</label>
              <input
                type="text"
                id="city"
                name="city"
                value={formData.city}
                onChange={handleChange}
                placeholder="Enter your city"
                autoComplete="address-level2"
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label htmlFor="state">State</label>
              <input
                type="text"
                id="state"
                name="state"
                value={formData.state}
                onChange={handleChange}
                placeholder="Enter your state"
                autoComplete="address-level1"
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              placeholder="Create password"
              autoComplete="new-password"
            />
            <span className="password-hint">Must be at least 6 characters</span>
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">Confirm Password</label>
            <input
              type="password"
              id="confirmPassword"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              placeholder="Confirm password"
              autoComplete="new-password"
            />
          </div>

          <div className="form-group">
            <label htmlFor="referralCode">Referral Code (Optional)</label>
            <input
              type="text"
              id="referralCode"
              name="referralCode"
              value={referralId}
              onChange={(e) => !referralFromLink && setReferralId(e.target.value)}
              placeholder="Enter referral code if you have one"
              readOnly={referralFromLink}
              style={referralFromLink ? { 
                background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(16, 185, 129, 0.08) 100%)', 
                borderColor: 'rgba(16, 185, 129, 0.4)',
                cursor: 'not-allowed',
                color: '#34d399'
              } : {}}
            />
            {referralFromLink && (
              <span className="password-hint" style={{ color: '#34d399', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '14px' }}>✓</span> Referral code applied from link
              </span>
            )}
          </div>

          <div className="form-options">
            <label className="remember-me">
              <input 
                type="checkbox" 
                checked={termsAccepted}
                onChange={() => {}}
                required 
              />
              <span>
                I agree to the{' '}
                <button type="button" className="terms-link" onClick={openTermsModal}>
                  Terms & Conditions
                </button>
              </span>
            </label>
          </div>

          {!emailConfigLoaded && (
            <p className="password-hint" style={{ textAlign: 'center', marginBottom: 8 }}>
              Checking email verification settings…
            </p>
          )}

          <button 
            type="submit" 
            className="auth-submit-btn" 
            disabled={loading || !termsAccepted || !emailConfigLoaded}
          >
            {loading ? 'Creating Account...' : 'Register'}
          </button>

          <div style={{ textAlign: 'center', margin: '16px 0', color: '#888', fontSize: '13px' }}>
            or
          </div>

          <button 
            type="button" 
            className="auth-submit-btn demo-btn"
            onClick={handleDemoRegister}
            disabled={loading || !emailConfigLoaded}
            style={{ 
              background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
              marginBottom: '8px'
            }}
          >
            {loading ? 'Creating Demo...' : '🎮 Try Demo Account'}
          </button>
          <p style={{ fontSize: '11px', color: '#888', textAlign: 'center', margin: '4px 0 0' }}>
            Practice trading with virtual money - No deposit required
          </p>
        </form>

        <div className="auth-footer">
          <p>Already have an account? <Link to="/login">Login</Link></p>
        </div>
      </div>

      {/* Terms & Conditions Modal */}
      {showTermsModal && (
        <div className="terms-modal-overlay">
          <div className="terms-modal">
            <div className="terms-modal-header">
              <h2>📋 Terms & Conditions</h2>
              <button className="terms-modal-close" onClick={declineTerms}>×</button>
            </div>
            
            <div 
              className="terms-modal-body" 
              ref={termsRef}
              onScroll={handleTermsScroll}
            >
              {!hasScrolledToBottom && (
                <div className="scroll-indicator">
                  ⬇️ Please scroll down to read all terms before accepting
                </div>
              )}

              <section className="terms-section">
                <h2>1. Risk Disclosure</h2>
                <p>
                  <strong>Trading in financial markets involves substantial risk of loss.</strong> 
                  You should carefully consider whether trading is appropriate for you in light of 
                  your financial condition. The high degree of leverage that is often obtainable in 
                  trading can work against you as well as for you. The use of leverage can lead to 
                  large losses as well as gains.
                </p>
              </section>

              <section className="terms-section warning-section">
                <h2>⚠️ Important Warning</h2>
                <ul>
                  <li>Past performance is not indicative of future results</li>
                  <li>You may lose more than your initial investment</li>
                  <li>Trading can cause significant mental stress and anxiety</li>
                  <li>Financial losses can impact your personal life and relationships</li>
                  <li>Never invest money you cannot afford to lose</li>
                </ul>
              </section>

              <section className="terms-section">
                <h2>2. Mental Health Advisory</h2>
                <p>
                  Trading in financial markets can be mentally and emotionally challenging. 
                  The stress of potential financial losses, market volatility, and the pressure 
                  of making quick decisions can lead to:
                </p>
                <ul>
                  <li>Anxiety and stress-related disorders</li>
                  <li>Sleep disturbances</li>
                  <li>Depression in cases of significant losses</li>
                  <li>Addiction-like behaviors</li>
                </ul>
                <p>
                  We strongly recommend seeking professional guidance and maintaining a healthy 
                  work-life balance. If you experience any mental health issues related to trading, 
                  please seek professional help immediately.
                </p>
              </section>

              <section className="terms-section">
                <h2>3. Educational Requirement</h2>
                <p>Before engaging in any trading activity, you should:</p>
                <ul>
                  <li>Complete proper education about financial markets</li>
                  <li>Understand technical and fundamental analysis</li>
                  <li>Practice with demo accounts before using real money</li>
                  <li>Develop a solid trading strategy and risk management plan</li>
                  <li>Consult with licensed financial advisors</li>
                </ul>
              </section>

              <section className="terms-section">
                <h2>4. Company's Role</h2>
                <p>
                  SetupFX provides <strong>technical support and platform services only</strong>. 
                  We do not provide:
                </p>
                <ul>
                  <li>Investment advice or recommendations</li>
                  <li>Guaranteed returns or profit promises</li>
                  <li>Financial planning services</li>
                  <li>Trading signals or tips</li>
                </ul>
                <p>
                  All trading decisions are made solely by you. The company is not responsible 
                  for any profits or losses resulting from your trading activities.
                </p>
              </section>

              <section className="terms-section">
                <h2>5. Your Responsibilities</h2>
                <p>By using SetupFX, you acknowledge and agree that:</p>
                <ul>
                  <li>All investment decisions are your own responsibility</li>
                  <li>You have read and understood the risks involved</li>
                  <li>You are of legal age to trade in your jurisdiction</li>
                  <li>You will not hold the company liable for any losses</li>
                  <li>You will trade only with funds you can afford to lose</li>
                  <li>You will seek professional advice when needed</li>
                </ul>
              </section>

              <section className="terms-section">
                <h2>6. No Guarantee of Profits</h2>
                <p>
                  There is <strong>no guarantee of profits</strong> in trading. Market movements 
                  are unpredictable and past performance does not guarantee future results. 
                  You should be prepared for the possibility of losing your entire investment.
                </p>
              </section>

              <section className="terms-section">
                <h2>7. Regulatory Compliance</h2>
                <p>
                  You are responsible for ensuring that your trading activities comply with 
                  all applicable laws and regulations in your jurisdiction. SetupFX does not 
                  provide services in jurisdictions where such services are prohibited.
                </p>
              </section>

              <section className="terms-section disclaimer-section">
                <h2>📋 Final Disclaimer</h2>
                <p>
                  By registering on SetupFX, you confirm that you have read, understood, 
                  and agree to all the terms and conditions stated above. You acknowledge 
                  that trading involves substantial risk and that you are solely responsible 
                  for your trading decisions and their outcomes.
                </p>
                <p>
                  <strong>Trade responsibly. Learn before you invest. Never risk more than 
                  you can afford to lose.</strong>
                </p>
              </section>
            </div>

            <div className="terms-modal-footer">
              <button className="terms-decline-btn" onClick={declineTerms}>
                Decline
              </button>
              <button 
                className="terms-accept-btn" 
                onClick={acceptTerms}
                disabled={!hasScrolledToBottom}
              >
                {hasScrolledToBottom ? 'I Accept' : 'Scroll to Accept'}
              </button>
            </div>
          </div>
        </div>
      )}
      
      <div className="tubes-hint">
        <span>✨ Click anywhere to change colors</span>
      </div>
    </div>
    </TubesBackground>
  );
}

export default Register;

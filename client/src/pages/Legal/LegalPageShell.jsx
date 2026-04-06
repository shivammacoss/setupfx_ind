import { Link } from 'react-router-dom';
import '../Auth/Auth.css';

const legalNav = [
  { to: '/terms', label: 'Terms & Conditions' },
  { to: '/privacy-policy', label: 'Privacy Policy' },
  { to: '/refund-policy', label: 'Refund Policy' },
  { to: '/risk-disclaimer', label: 'Risk Disclaimer' }
];

export default function LegalPageShell({ title, subtitle, lastUpdated, children }) {
  return (
    <div className="auth-container">
      <div className="auth-card terms-card">
        <div className="auth-header">
          <Link to="/" style={{ textDecoration: 'none', color: 'inherit' }}>
            <h1 className="auth-logo">SetupFX</h1>
          </Link>
          <p className="auth-subtitle">{title}</p>
          {subtitle && <p className="password-hint" style={{ marginTop: 8 }}>{subtitle}</p>}
          {lastUpdated && (
            <p className="password-hint" style={{ marginTop: 4 }}>
              Last updated: {lastUpdated}
            </p>
          )}
        </div>

        <div className="terms-content">{children}</div>

        <div className="terms-footer" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 12 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
            {legalNav.map((l) => (
              <Link key={l.to} to={l.to} className="back-to-register" style={{ fontSize: 13 }}>
                {l.label}
              </Link>
            ))}
          </div>
          <Link to="/" className="back-to-register">
            ← Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}

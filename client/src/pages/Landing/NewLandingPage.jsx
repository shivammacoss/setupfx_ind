import { Link } from 'react-router-dom';
import ScrollyCanvas from './components/ScrollyCanvas';
import WhatIsSetupFX from './components/WhatIsSetupFX';
import HowItWorks from './components/HowItWorks';
import TradingMarkets from './components/TradingMarkets';
import FeaturesSection from './components/FeaturesSection';
import LandingFooter from './components/LandingFooter';

export default function NewLandingPage() {
  return (
    <main style={{ position: 'relative', background: '#121212' }}>
      {/* Logo - Top Left */}
      <div style={{ position: 'fixed', left: 24, top: 16, zIndex: 40 }}>
        <img src="/landing/img/logo1.png" alt="SetupFX" style={{ height: 36, width: 'auto', objectFit: 'contain' }} />
      </div>

      {/* Sign In - Top Right */}
      <div style={{ position: 'fixed', right: 24, top: 16, zIndex: 40, display: 'flex', gap: 12 }}>
        <Link to="/login" style={{
          display: 'inline-flex', alignItems: 'center',
          padding: '8px 20px', borderRadius: 999,
          border: '1px solid rgba(255,255,255,0.4)',
          color: 'white', textDecoration: 'none', fontSize: 14, fontWeight: 500,
          background: 'transparent', transition: 'all 0.3s'
        }}>
          Sign In
        </Link>
        <Link to="/register" style={{
          display: 'inline-flex', alignItems: 'center',
          padding: '8px 20px', borderRadius: 999,
          background: 'linear-gradient(to right, #a855f7, #ec4899)',
          color: 'white', textDecoration: 'none', fontSize: 14, fontWeight: 500,
        }}>
          Get Started
        </Link>
      </div>

      {/* Scrolly Hero */}
      <ScrollyCanvas />

      {/* What is SetupFX */}
      <WhatIsSetupFX />

      {/* How It Works */}
      <HowItWorks />

      {/* Trading Markets */}
      <TradingMarkets />

      {/* Features */}
      <FeaturesSection />

      {/* Footer */}
      <LandingFooter />
    </main>
  );
}

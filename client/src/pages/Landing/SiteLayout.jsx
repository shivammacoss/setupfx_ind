import { useEffect, useState, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import './SiteLanding.css';

export default function SiteLayout({ children }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  // Load Google Fonts + Font Awesome once
  useEffect(() => {
    if (!document.querySelector('link[href*="Inter+Tight"]')) {
      const gf = document.createElement('link');
      gf.rel = 'stylesheet';
      gf.href = 'https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;700;900&family=JetBrains+Mono:wght@400;500;700&family=Inter:wght@300;400;500;600&family=Outfit:wght@400;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap';
      document.head.appendChild(gf);
    }
    if (!document.querySelector('link[href*="font-awesome"]')) {
      const fa = document.createElement('link');
      fa.rel = 'stylesheet';
      fa.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css';
      document.head.appendChild(fa);
    }
  }, []);

  // Navbar scroll effect
  useEffect(() => {
    const navbar = document.getElementById('navbar');
    if (!navbar) return;
    const onScroll = () => {
      if (window.scrollY > 50) navbar.classList.add('scrolled');
      else navbar.classList.remove('scrolled');
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const toggleMobile = useCallback(() => {
    setMobileOpen(prev => !prev);
  }, []);

  const isActive = (path) => location.pathname === path ? 'active' : '';

  const navLinks = [
    { to: '/', label: 'Home' },
    { to: '/services', label: 'Services' },
    { to: '/digital-marketing', label: 'Digital Marketing' },
    { to: '/solutions', label: 'Solutions' },
    { to: '/pricing', label: 'Pricing' },
    { to: '/contact', label: 'Contact' },
  ];

  return (
    <div className="site-landing">
      {/* NAVBAR */}
      <header id="navbar">
        <div className="nav-inner">
          <Link to="/" className="nav-brand">
            <img src="/landing/img/logo1.png" alt="SetupFX" style={{ height: '28px', width: 'auto' }} />
          </Link>
          <ul className="nav-links">
            {navLinks.map(link => (
              <li key={link.to}>
                <Link to={link.to} className={isActive(link.to)}>{link.label}</Link>
              </li>
            ))}
          </ul>
          <div className="nav-right">
            <Link to="/login" className="nav-cta-ghost">Login</Link>
            <Link to="/register" className="nav-cta">Sign_Up</Link>
          </div>
          <button
            className="nav-hamburger"
            aria-expanded={mobileOpen}
            onClick={toggleMobile}
          >
            <span></span><span></span><span></span>
          </button>
        </div>
      </header>

      {/* MOBILE NAV */}
      <nav id="nav-mobile" className={mobileOpen ? 'open' : ''}>
        <ul>
          {navLinks.map(link => (
            <li key={link.to}>
              <Link to={link.to}>{link.label}</Link>
            </li>
          ))}
        </ul>
        <div className="mobile-cta-wrap">
          <Link to="/login" className="nav-cta-ghost" style={{display:'block',textAlign:'center',padding:'14px',marginBottom:'12px',border:'1px solid rgba(255,255,255,0.3)',color:'#fff',fontSize:'11px',letterSpacing:'0.2em',fontFamily:'var(--font-mono)'}}>LOGIN</Link>
          <Link to="/register" className="nav-cta">Sign_Up</Link>
        </div>
      </nav>

      {/* PAGE CONTENT */}
      <main>
        {children}
      </main>

      {/* FOOTER */}
      <footer id="footer">
        <div className="container">
          <div className="footer-grid">
            <div className="footer-col">
              <div className="footer-brand-name">SetupFX24</div>
              <div className="footer-brand-sub">SetupFX Softtech (OPC) Private Limited</div>
              <p className="footer-desc">Global software development and digital marketing company powering brokerages and businesses worldwide.</p>
              <div className="footer-contact-item">
                <i className="fa-solid fa-envelope" style={{marginTop:'2px',color:'rgba(255,255,255,0.2)'}}></i>
                setupfx24@gmail.com
              </div>
              <div className="footer-contact-item">
                <i className="fa-brands fa-whatsapp" style={{marginTop:'2px',color:'rgba(255,255,255,0.2)'}}></i>
                +1 (908) 228-0305
              </div>
              <div className="footer-contact-item" style={{fontSize:'10px',color:'rgba(255,255,255,0.2)'}}>
                <i className="fa-solid fa-location-dot" style={{marginTop:'2px'}}></i>
                Office 9364hn 3 Fitzroy Place, Glasgow, G3 7RH, UK
              </div>
            </div>
            <div className="footer-col">
              <div className="footer-col-title">Solutions</div>
              <ul className="footer-links">
                <li><Link to="/solutions">Solutions</Link></li>
                <li><Link to="/liquidity">Liquidity</Link></li>
                <li><Link to="/pricing">Pricing</Link></li>
                <li><Link to="/case-studies">Case Studies</Link></li>
              </ul>
            </div>
            <div className="footer-col">
              <div className="footer-col-title">Company</div>
              <ul className="footer-links">
                <li><Link to="/blog">Blog</Link></li>
                <li><Link to="/faq">FAQs</Link></li>
                <li><Link to="/contact">Contact</Link></li>
                <li><Link to="/about">About Us</Link></li>
              </ul>
            </div>
            <div className="footer-col">
              <div className="footer-col-title">Legal</div>
              <ul className="footer-links">
                <li><Link to="/privacy">Privacy Policy</Link></li>
                <li><Link to="/terms">Terms of Service</Link></li>
                <li><Link to="/cookies">Cookie Policy</Link></li>
              </ul>
            </div>
          </div>
          <div className="footer-bottom">
            <div className="footer-copy">&copy; 2026 SetupFX24. All rights reserved.</div>
            <div className="footer-legal">
              <Link to="/privacy">Privacy</Link>
              <Link to="/terms">Terms</Link>
              <Link to="/cookies">Cookies</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

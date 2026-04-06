import { Twitter, Linkedin, Github, Instagram, Youtube, ArrowRight, Shield } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useScrollAnimation } from '../hooks/useScrollAnimation';
import TradingViewLegalNotice from './TradingViewLegalNotice';

const footerLinks = {
  'About Company': [
    { label: 'About Us', href: '#' },
    { label: 'Our Team', href: '#' },
    { label: 'Careers', href: '#' },
    { label: 'Press & Media', href: '#' },
    { label: 'Blog', href: '#' },
  ],
  Markets: [
    { label: 'NSE & BSE', href: '#markets' },
    { label: 'Forex Trading', href: '#markets' },
    { label: 'Cryptocurrencies', href: '#markets' },
    { label: 'US Stocks & ETFs', href: '#markets' },
    { label: 'Commodities', href: '#markets' },
  ],
  Platforms: [
    { label: 'Web Platform', href: '#platform' },
    { label: 'Android App', href: '#platform' },
    { label: 'iOS App', href: '#platform' },
    { label: 'Windows App', href: '#platform' },
    { label: 'API Access', href: '#' },
  ],
  Tools: [
    { label: 'Advanced Charts', href: '#tools' },
    { label: 'Market Scanner', href: '#tools' },
    { label: 'Options Chain', href: '#tools' },
    { label: 'Portfolio Tracker', href: '#tools' },
    { label: 'Trading Signals', href: '#tools' },
  ],
  Education: [
    { label: 'Trading Guides', href: '#education' },
    { label: 'Video Tutorials', href: '#education' },
    { label: 'Webinars', href: '#education' },
    { label: 'Market Insights', href: '#education' },
    { label: 'Glossary', href: '#education' },
  ],
  Legal: [
    { label: 'Terms & Conditions', href: '/terms' },
    { label: 'Charts (TradingView)', href: '#tradingview-charts-notice' },
    { label: 'Privacy Policy', href: '/privacy-policy' },
    { label: 'Refund Policy', href: '/refund-policy' },
    { label: 'Risk Disclaimer', href: '/risk-disclaimer' },
    { label: 'Grievance Policy', href: '#' },
  ],
};

const socialLinks = [
  { icon: Twitter, label: 'Twitter', href: '#', color: 'hover:text-sky-500' },
  { icon: Linkedin, label: 'LinkedIn', href: '#', color: 'hover:text-blue-600' },
  { icon: Instagram, label: 'Instagram', href: '#', color: 'hover:text-pink-500' },
  { icon: Youtube, label: 'YouTube', href: '#', color: 'hover:text-red-500' },
  { icon: Github, label: 'GitHub', href: '#', color: 'hover:text-slate-900' },
];

export default function Footer() {
  const { ref: linksRef } = useScrollAnimation(0.05);
  const { ref: disclaimerRef } = useScrollAnimation(0.1);

  return (
    <footer className="bg-white border-t-2 border-slate-200 relative overflow-hidden">

      {/* Newsletter Banner */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 py-12 px-6">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <div className="text-white font-bold text-xl font-manrope mb-1">Stay ahead of the markets</div>
            <div className="text-slate-400 text-sm">Get daily market insights, trading tips, and platform updates.</div>
          </div>
          <form className="flex gap-3 w-full md:w-auto" onSubmit={(e) => e.preventDefault()}>
            <input
              type="email"
              placeholder="Enter your email"
              className="flex-1 md:w-64 px-5 py-3 rounded-full bg-white/10 border border-white/20 text-white placeholder-slate-400 text-sm focus:outline-none focus:border-[#2563eb] transition-all"
            />
            <button
              type="submit"
              className="px-6 py-3 rounded-full bg-[#2563eb] text-white font-bold text-sm hover:bg-blue-700 transition-all flex items-center gap-2 shrink-0"
            >
              Subscribe <ArrowRight size={14} />
            </button>
          </form>
        </div>
      </div>

      {/* Main Footer */}
      <div className="max-w-7xl mx-auto px-6 pt-16 pb-8">

        {/* Top: Logo + Links */}
        <div ref={linksRef} className="scroll-reveal grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-8 mb-16">
          {/* Brand */}
          <div className="col-span-2 md:col-span-4 lg:col-span-1">
            <a href="#home" className="flex items-center gap-2 mb-4 group">
              <img 
                src="/landing/img/logo1.png" 
                alt="SetupFX" 
                className="h-7 w-auto"
              />
            </a>
            <p className="text-sm text-slate-500 leading-relaxed mb-5">
              India's leading zero-brokerage trading platform for stocks, forex, crypto, and more.
            </p>
            {/* Social Links */}
            <div className="flex gap-3">
              {socialLinks.map((s) => {
                const Icon = s.icon;
                return (
                  <a
                    key={s.label}
                    href={s.href}
                    aria-label={s.label}
                    className={`w-8 h-8 rounded-lg bg-slate-100 border-2 border-slate-200 flex items-center justify-center text-slate-400 ${s.color} hover:border-[#2563eb] transition-all`}
                  >
                    <Icon size={14} />
                  </a>
                );
              })}
            </div>
          </div>

          {/* Links */}
          {Object.entries(footerLinks).map(([title, links]) => (
            <div key={title}>
              <h4 className="text-xs font-bold text-[#2563eb] uppercase tracking-widest mb-4">{title}</h4>
              <ul className="space-y-2.5">
                {links.map((link) => (
                  <li key={link.label}>
                    {link.href.startsWith('/') ? (
                      <Link
                        to={link.href}
                        className="text-sm text-slate-500 hover:text-slate-900 transition-colors"
                      >
                        {link.label}
                      </Link>
                    ) : (
                      <a
                        href={link.href}
                        className="text-sm text-slate-500 hover:text-slate-900 transition-colors"
                      >
                        {link.label}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* TradingView — third-party chart attribution (application / widget terms) */}
        <div className="scroll-reveal mb-8">
          <TradingViewLegalNotice />
        </div>

        {/* Risk Disclaimer */}
        <div ref={disclaimerRef} className="scroll-reveal mb-8 p-5 rounded-xl bg-amber-50 border-2 border-amber-100">
          <div className="flex items-start gap-3">
            <Shield size={16} className="text-amber-600 shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-bold text-amber-700 mb-1 uppercase tracking-wide">Risk Disclaimer</div>
              <p className="text-xs text-amber-700/80 leading-relaxed">
                Trading in financial instruments involves significant risk of loss and is not suitable for all investors.
                Past performance is not indicative of future results. Please ensure you fully understand the risks involved
                and seek independent financial advice if necessary.
              </p>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-slate-400">
          <p>© 2024 SetupFX Financial Services Pvt. Ltd. All rights reserved.</p>
          <div className="flex flex-wrap gap-4 justify-center">
            <Link to="/terms" className="hover:text-slate-600 transition-colors">Terms & Conditions</Link>
            <Link to="/privacy-policy" className="hover:text-slate-600 transition-colors">Privacy Policy</Link>
            <Link to="/refund-policy" className="hover:text-slate-600 transition-colors">Refund Policy</Link>
            <Link to="/risk-disclaimer" className="hover:text-slate-600 transition-colors">Risk Disclaimer</Link>
          </div>
        </div>
      </div>

      {/* Huge Watermark Text */}
      <div className="flex justify-center items-center py-6 overflow-hidden pointer-events-none select-none">
        <h1 className="text-[12vw] leading-none font-bold font-manrope tracking-tighter text-stroke opacity-30 whitespace-nowrap">
          SetupFX
        </h1>
      </div>
    </footer>
  );
}

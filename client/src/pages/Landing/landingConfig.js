/**
 * ========================================
 * SETUPFX LANDING PAGE CONFIGURATION
 * ========================================
 * 
 * Edit this file to customize your landing page.
 * No React knowledge needed — just change the values below.
 * 
 * After saving, the page will hot-reload automatically.
 */

const landingConfig = {

  // ─── BRAND ─────────────────────────────────────
  brand: {
    name: 'SetupFX',
    tagline: 'Trade Smarter. Grow Faster.',
    logo: '/landing/img/logo.png', // emoji or image URL
  },

  // ─── HERO SECTION ──────────────────────────────
  hero: {
    title: 'Trade Global Markets',
    highlight: 'With Confidence',
    subtitle: 'Access Forex, Stocks, Crypto, Indices & Commodities — all from one powerful platform with real-time charts, advanced order types, and lightning-fast execution.',
    primaryCTA: {
      text: 'Start Trading Now',
      link: '/register',
    },
    secondaryCTA: {
      text: 'Login to Account',
      link: '/login',
    },
    // Floating instrument badges shown in hero
    floatingBadges: ['XAUUSD', 'BTCUSD', 'EURUSD', 'AAPL', 'US100'],
  },

  // ─── FEATURES SECTION ─────────────────────────
  // Add, remove, or reorder items. Each needs icon, title, description.
  features: [
    {
      icon: '⚡',
      title: 'Lightning Execution',
      description: 'Execute trades in milliseconds with our optimized engine supporting Hedging, Netting, and Binary modes.',
    },
    {
      icon: '📊',
      title: 'Advanced Charts',
      description:
        'Professional charts powered by TradingView (third-party): indicators, timeframes, and drawing tools — see site footer for TradingView terms and attribution.',
    },
    {
      icon: '🔐',
      title: 'Bank-Grade Security',
      description: 'Enterprise-level encryption, 2FA authentication, and real-time fraud detection to protect your funds.',
    },
    {
      icon: '🌍',
      title: '500+ Instruments',
      description: 'Trade Forex, Stocks, Crypto, Indices, Commodities & Metals — all from a single account.',
    },
    {
      icon: '📱',
      title: 'Trade Anywhere',
      description: 'Fully responsive platform that works beautifully on desktop, tablet, and mobile devices.',
    },
    {
      icon: '👥',
      title: 'Copy Trading',
      description: 'Follow and automatically copy the trades of top-performing master traders with verified track records.',
    },
  ],

  // ─── STATS SECTION ────────────────────────────
  stats: [
    { value: '50K+', label: 'Active Traders' },
    { value: '$2B+', label: 'Monthly Volume' },
    { value: '500+', label: 'Instruments' },
    { value: '99.9%', label: 'Uptime' },
  ],

  // ─── HOW IT WORKS ─────────────────────────────
  steps: [
    {
      step: '01',
      title: 'Create Account',
      description: 'Sign up in under 60 seconds. No paperwork, no hassle.',
    },
    {
      step: '02',
      title: 'Fund Your Wallet',
      description: 'Deposit via UPI, Bank Transfer, or Crypto. Instant processing.',
    },
    {
      step: '03',
      title: 'Start Trading',
      description: 'Choose your instrument, set your strategy, and execute trades instantly.',
    },
  ],

  // ─── TESTIMONIALS ─────────────────────────────
  testimonials: [
    {
      name: 'Rajesh K.',
      role: 'Forex Trader',
      avatar: 'RK',
      text: 'SetupFX changed the way I trade. The execution speed is unmatched and the interface is incredibly intuitive.',
      rating: 5,
    },
    {
      name: 'Priya M.',
      role: 'Crypto Investor',
      avatar: 'PM',
      text: 'Finally a platform that handles both crypto and forex seamlessly. The copy trading feature has been a game changer for me.',
      rating: 5,
    },
    {
      name: 'Amit S.',
      role: 'Day Trader',
      avatar: 'AS',
      text: 'The advanced charting tools and multiple order types give me everything I need. Best trading platform I\'ve used.',
      rating: 5,
    },
  ],

  // ─── CTA BANNER ───────────────────────────────
  ctaBanner: {
    title: 'Ready to Start Your Trading Journey?',
    subtitle: 'Join thousands of traders who trust SetupFX for their daily trading needs.',
    buttonText: 'Create Free Account',
    buttonLink: '/register',
  },

  // ─── FOOTER ───────────────────────────────────
  footer: {
    description: 'A next-generation trading platform built for speed, security, and simplicity.',
    links: {
      Platform: [
        { text: 'Login', href: '/login' },
        { text: 'Register', href: '/register' },
        { text: 'Terms & Conditions', href: '/terms' },
      ],
      Markets: [
        { text: 'Forex', href: '/register' },
        { text: 'Crypto', href: '/register' },
        { text: 'Stocks', href: '/register' },
        { text: 'Indices', href: '/register' },
      ],
      Support: [
        { text: 'Help Center', href: '#' },
        { text: 'Contact Us', href: '#' },
        { text: 'FAQ', href: '#' },
      ],
    },
    copyright: `© ${new Date().getFullYear()} SetupFX. All rights reserved.`,
    disclaimer: 'Trading involves risk. Past performance is not indicative of future results.',
  },

  // ─── SECTION VISIBILITY ───────────────────────
  // Set any to false to hide that section
  sections: {
    hero: true,
    features: true,
    stats: true,
    howItWorks: true,
    testimonials: true,
    ctaBanner: true,
    footer: true,
  },
};

export default landingConfig;

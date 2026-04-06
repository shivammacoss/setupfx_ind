import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import config from './landingConfig';
import './LandingPage.css';

export default function LandingPage() {
    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        const handleScroll = () => setScrolled(window.scrollY > 20);
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const { brand, hero, features, stats, steps, testimonials, ctaBanner, footer, sections } = config;

    return (
        <div className="landing-page">
            {/* ─── NAVBAR ─── */}
            <nav className={`lp-navbar ${scrolled ? 'scrolled' : ''}`}>
                <Link to="/landing" className="lp-nav-brand">
                    <span className="brand-icon">
                        {brand.logo && (brand.logo.startsWith('/') || brand.logo.startsWith('http'))
                            ? <img src={brand.logo} alt={brand.name} className="brand-logo-img" />
                            : brand.logo}
                    </span>
                    <span className="brand-highlight">{brand.name}</span>
                </Link>
                <div className="lp-nav-actions">
                    <Link to={hero.secondaryCTA.link} className="lp-btn lp-btn-ghost">
                        {hero.secondaryCTA.text}
                    </Link>
                    <Link to={hero.primaryCTA.link} className="lp-btn lp-btn-primary">
                        {hero.primaryCTA.text}
                    </Link>
                </div>
            </nav>

            {/* ─── HERO ─── */}
            {sections.hero && (
                <section className="lp-hero">
                    <div className="lp-hero-bg">
                        <div className="lp-hero-grid" />
                    </div>
                    <div className="lp-hero-content">
                        <div className="lp-hero-badge">
                            <span className="badge-dot" />
                            {brand.tagline}
                        </div>
                        <h1>
                            {hero.title}
                            <span className="highlight">{hero.highlight}</span>
                        </h1>
                        <p className="lp-hero-subtitle">{hero.subtitle}</p>
                        <div className="lp-hero-ctas">
                            <Link to={hero.primaryCTA.link} className="lp-btn lp-btn-primary lp-btn-large">
                                {hero.primaryCTA.text}
                            </Link>
                            <Link to={hero.secondaryCTA.link} className="lp-btn lp-btn-ghost lp-btn-large">
                                {hero.secondaryCTA.text}
                            </Link>
                        </div>
                        {hero.floatingBadges && hero.floatingBadges.length > 0 && (
                            <div className="lp-hero-badges">
                                {hero.floatingBadges.map((symbol) => (
                                    <div key={symbol} className="lp-floating-badge">
                                        <span className="badge-live" />
                                        {symbol}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </section>
            )}

            {/* ─── FEATURES ─── */}
            {sections.features && features.length > 0 && (
                <section className="lp-section">
                    <div className="lp-container">
                        <div className="lp-section-header">
                            <span className="lp-section-label">Features</span>
                            <h2>Everything You Need to Trade</h2>
                            <p>Professional-grade tools designed for traders of all levels.</p>
                        </div>
                        <div className="lp-features-grid">
                            {features.map((feature, i) => (
                                <div key={i} className="lp-feature-card">
                                    <span className="lp-feature-icon">{feature.icon}</span>
                                    <h3>{feature.title}</h3>
                                    <p>{feature.description}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>
            )}

            {/* ─── STATS ─── */}
            {sections.stats && stats.length > 0 && (
                <section className="lp-section lp-stats">
                    <div className="lp-container">
                        <div className="lp-stats-grid">
                            {stats.map((stat, i) => (
                                <div key={i} className="lp-stat-item">
                                    <div className="lp-stat-value">{stat.value}</div>
                                    <div className="lp-stat-label">{stat.label}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>
            )}

            {/* ─── HOW IT WORKS ─── */}
            {sections.howItWorks && steps.length > 0 && (
                <section className="lp-section">
                    <div className="lp-container">
                        <div className="lp-section-header">
                            <span className="lp-section-label">How It Works</span>
                            <h2>Get Started in Minutes</h2>
                            <p>Three simple steps to begin your trading journey.</p>
                        </div>
                        <div className="lp-steps-grid">
                            {steps.map((step, i) => (
                                <div key={i} className="lp-step-card">
                                    <div className="lp-step-number">{step.step}</div>
                                    <h3>{step.title}</h3>
                                    <p>{step.description}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>
            )}

            {/* ─── TESTIMONIALS ─── */}
            {sections.testimonials && testimonials.length > 0 && (
                <section className="lp-section" style={{ background: 'var(--lp-bg-secondary)' }}>
                    <div className="lp-container">
                        <div className="lp-section-header">
                            <span className="lp-section-label">Testimonials</span>
                            <h2>Loved by Traders</h2>
                            <p>See what our community has to say about SetupFX.</p>
                        </div>
                        <div className="lp-testimonials-grid">
                            {testimonials.map((t, i) => (
                                <div key={i} className="lp-testimonial-card">
                                    <div className="lp-testimonial-stars">
                                        {'★'.repeat(t.rating)}{'☆'.repeat(5 - t.rating)}
                                    </div>
                                    <p className="lp-testimonial-text">"{t.text}"</p>
                                    <div className="lp-testimonial-author">
                                        <div className="lp-testimonial-avatar">{t.avatar}</div>
                                        <div>
                                            <div className="lp-testimonial-name">{t.name}</div>
                                            <div className="lp-testimonial-role">{t.role}</div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>
            )}

            {/* ─── CTA BANNER ─── */}
            {sections.ctaBanner && (
                <section className="lp-section lp-cta-banner">
                    <div className="lp-container">
                        <div className="lp-cta-inner">
                            <h2>{ctaBanner.title}</h2>
                            <p>{ctaBanner.subtitle}</p>
                            <Link to={ctaBanner.buttonLink} className="lp-btn lp-btn-primary lp-btn-large">
                                {ctaBanner.buttonText}
                            </Link>
                        </div>
                    </div>
                </section>
            )}

            {/* ─── FOOTER ─── */}
            {sections.footer && (
                <footer className="lp-footer">
                    <div className="lp-footer-grid">
                        <div className="lp-footer-brand">
                            <div className="lp-footer-brand-name">
                                <span>
                                    {brand.logo && (brand.logo.startsWith('/') || brand.logo.startsWith('http'))
                                        ? <img src={brand.logo} alt={brand.name} className="brand-logo-img" />
                                        : brand.logo}
                                </span>
                                <span className="brand-highlight">{brand.name}</span>
                            </div>
                            <p>{footer.description}</p>
                        </div>
                        {Object.entries(footer.links).map(([title, links]) => (
                            <div key={title} className="lp-footer-col">
                                <h4>{title}</h4>
                                <ul>
                                    {links.map((link, i) => (
                                        <li key={i}>
                                            {link.href.startsWith('/') ? (
                                                <Link to={link.href}>{link.text}</Link>
                                            ) : (
                                                <a href={link.href} target="_blank" rel="noopener noreferrer">{link.text}</a>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                    <div className="lp-footer-bottom">
                        <span className="lp-footer-copyright">{footer.copyright}</span>
                        <span className="lp-footer-disclaimer">{footer.disclaimer}</span>
                    </div>
                </footer>
            )}
        </div>
    );
}

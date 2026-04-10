import { useEffect, useRef } from 'react';
import SiteLayout from '../SiteLayout';

const htmlContent = `
<section class="hero-forcefield-wrap" style="position:relative;width:100%;height:100vh;overflow:visible;background:#000">
  <div id="hero-forcefield" style="position:absolute;inset:0;width:100%;height:100%;z-index:0"></div>
  <div class="hero-glitch-content">
    <div class="hero-glitch-lines">
      <h1 class="text-glitch" data-text="INSTITUTIONAL" data-hover="TIER-1 ACCESS" data-delay="0">INSTITUTIONAL</h1>
      <h1 class="text-glitch" data-text="LIQUIDITY" data-hover="50+ PROVIDERS" data-delay="0.15">LIQUIDITY</h1>
      <h1 class="text-glitch" data-text="ACCESS" data-hover="CONNECTED" data-delay="0.3">ACCESS</h1>
    </div>
    <p style="font-family:'Inter',sans-serif;font-size:15px;color:rgba(255,255,255,0.5);margin-top:16px;position:relative;z-index:10;max-width:560px;line-height:1.8">Connect to 50+ global liquidity providers with our enterprise-grade aggregation technology and bridge solutions.</p>
    <div class="hero-glitch-cta" style="pointer-events:auto">
      <button class="btn-shimmer" onclick="location.href='contact.html'"><i class="fa-solid fa-rocket"></i>Get Consultation</button>
      <button class="btn-hero-ghost" onclick="location.href='solutions.html'">View Solutions<span class="btn-icon"><i class="fa-solid fa-arrow-right"></i></span></button>
    </div>
  </div>
</section>

<section class="section">
<div class="container">
<div class="sec-label reveal">Overview</div>
<div class="sec-title reveal">Multi-Source Liquidity<br>Aggregation</div>
<p class="sec-sub reveal" style="max-width:700px">SetupFX24 provides institutional-grade liquidity access to brokerages of all sizes. We aggregate pricing from Tier-1 banks, Prime-of-Prime providers, and ECN liquidity pools into a unified feed with smart order routing, ensuring your clients always receive the best available pricing with minimal slippage and maximum fill rates.</p>
</div>
</section>

<section class="section section-alt">
<div class="container">
<div class="sec-label reveal">Providers</div>
<div class="sec-title reveal">Liquidity Providers<br>We Connect</div>
<div class="lp-badges reveal">
<span class="lp-badge">Integral OCX</span><span class="lp-badge">IS Prime</span><span class="lp-badge">B2Prime</span><span class="lp-badge">Finalto</span><span class="lp-badge">CFH Clearing</span><span class="lp-badge">LMAX Exchange</span><span class="lp-badge">OneZero</span><span class="lp-badge">PrimeXM</span><span class="lp-badge">Advanced Markets</span><span class="lp-badge">Sucden Financial</span><span class="lp-badge">Saxo Bank Prime</span><span class="lp-badge">Marex Prime</span><span class="lp-badge">X Open Hub</span><span class="lp-badge">B2C2</span><span class="lp-badge">Cumberland</span><span class="lp-badge">Binance</span><span class="lp-badge">Coinbase Prime</span>
</div>
<div class="services-grid reveal" style="margin-top:48px">
<div class="service-card"><div class="service-num">01</div><div class="service-title">A-Book Execution</div><p class="service-desc">Full STP/ECN pass-through to liquidity providers. Broker earns from spread markup or commission with zero market risk.</p><a href="solutions.html#liquidity" class="service-link">Learn More <span class="service-arrow">→</span></a></div>
<div class="service-card"><div class="service-num">02</div><div class="service-title">B-Book Management</div><p class="service-desc">Sophisticated risk management for internalized flow. Real-time exposure dashboards, auto-hedging triggers, and P&amp;L monitoring.</p><a href="solutions.html#liquidity" class="service-link">Learn More <span class="service-arrow">→</span></a></div>
<div class="service-card"><div class="service-num">03</div><div class="service-title">Hybrid Model</div><p class="service-desc">Smart routing logic — internalize small retail flow, pass large/profitable traders to LPs. Automatic classification per account.</p><a href="solutions.html#liquidity" class="service-link">Learn More <span class="service-arrow">→</span></a></div>
</div>
</div>
</section>

<section class="section">
<div class="container">
<div class="sec-header-centered">
<div class="sec-label reveal">Features</div>
<div class="sec-title reveal">Enterprise-Grade Infrastructure</div>
</div>
<div class="choose-grid reveal">
<div class="choose-card"><div class="choose-icon"><i class="fa-solid fa-route" style="color:#6366f1"></i></div><div class="choose-title">Smart Order Routing</div><p class="choose-desc">Evaluates spread, depth, fill rate, and latency to route each order to the optimal provider.</p></div>
<div class="choose-card"><div class="choose-icon"><i class="fa-solid fa-bridge" style="color:#6366f1"></i></div><div class="choose-title">Bridge Technology</div><p class="choose-desc">OneZero Hub, PrimeXM XCore, custom bridges with failover in under 50ms.</p></div>
<div class="choose-card"><div class="choose-icon"><i class="fa-solid fa-sliders" style="color:#6366f1"></i></div><div class="choose-title">Spread Management</div><p class="choose-desc">Dynamic markup per instrument, account group, and news event with configurable widening.</p></div>
<div class="choose-card"><div class="choose-icon"><i class="fa-brands fa-bitcoin" style="color:#6366f1"></i></div><div class="choose-title">Crypto Liquidity</div><p class="choose-desc">Binance, Coinbase Prime, Kraken, B2C2, Cumberland for 24/7 digital asset markets.</p></div>
<div class="choose-card"><div class="choose-icon"><i class="fa-solid fa-server" style="color:#6366f1"></i></div><div class="choose-title">Colocation</div><p class="choose-desc">Equinix NY4, LD4, TY3 with sub-1ms cross-connect fiber to major LPs.</p></div>
<div class="choose-card"><div class="choose-icon"><i class="fa-solid fa-shield-halved" style="color:#6366f1"></i></div><div class="choose-title">24/7 Monitoring</div><p class="choose-desc">Round-the-clock feed monitoring, automatic failover, and SLA-backed uptime guarantees.</p></div>
</div>
</div>
</section>

<section class="cta-section"><div class="cta-box reveal"><div class="cta-bg-light l1"></div><div class="cta-bg-light l2"></div><div class="cta-inner">
<div class="cta-title">Ready to Connect<br>Your Platform?</div>
<p class="cta-sub">Get a free liquidity consultation. We'll assess your requirements and recommend the optimal LP setup.</p>
<div class="cta-btns"><a href="/contact" class="btn-white">Get Consultation</a><a href="/pricing" class="btn-outline-white">View Pricing</a></div>
</div></div></section>
`;

export default function LiquidityPage() {
  const contentRef = useRef(null);

  useEffect(() => {
    window.scrollTo(0, 0);
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
    }, { threshold: 0.1 });
    document.querySelectorAll('.reveal').forEach(el => obs.observe(el));

    document.querySelectorAll('.dm-tab').forEach(tab => {
      tab.addEventListener('click', function() {
        document.querySelectorAll('.dm-tab').forEach(t => t.classList.remove('active'));
        this.classList.add('active');
      });
    });

    const stepsFill = document.querySelector('.steps-line-fill');
    if (stepsFill) {
      const so = new IntersectionObserver((entries) => {
        entries.forEach(e => { if (e.isIntersecting) stepsFill.style.width = '100%'; });
      }, { threshold: 0.3 });
      so.observe(stepsFill.parentElement || stepsFill);
    }

    const track = document.querySelector('.testimonials-track');
    if (track && !track.dataset.cloned) {
      track.innerHTML += track.innerHTML;
      track.dataset.cloned = 'true';
    }

    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const scripts = [];
    const load = (src) => new Promise((resolve) => {
      if (document.querySelector('script[src="' + src + '"]')) { resolve(); return; }
      const s = document.createElement('script'); s.src = src; s.onload = resolve;
      document.body.appendChild(s); scripts.push(s);
    });
    load('https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.9.4/p5.min.js')
      .then(() => load('/site/js/forcefield.js')).catch(() => {});
    load('https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js')
      .then(() => load('/site/js/text-glitch.js')).catch(() => {});
    return () => scripts.forEach(s => { try { s.remove(); } catch(e){} });
  }, []);
  return (
    <SiteLayout>
      <div ref={contentRef} dangerouslySetInnerHTML={{ __html: htmlContent }} />
    </SiteLayout>
  );
}

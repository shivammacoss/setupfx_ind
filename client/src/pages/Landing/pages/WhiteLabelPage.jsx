import { useEffect, useRef } from 'react';
import SiteLayout from '../SiteLayout';
import { initForceField, initTextGlitch } from '../heroEffects';

const htmlContent = `
<!-- =====================
     HERO
===================== -->
<section class="hero-forcefield-wrap" style="position:relative;width:100%;height:100vh;overflow:visible;background:#000">
  <div id="hero-forcefield" style="position:absolute;inset:0;width:100%;height:100%;z-index:0"></div>
  <div class="hero-glitch-content">
    <div class="hero-glitch-lines">
      <h1 class="text-glitch" data-text="WHITE LABEL" data-hover="YOUR BRAND" data-delay="0">WHITE LABEL</h1>
      <h1 class="text-glitch" data-text="YOUR BRAND" data-hover="YOUR PLATFORM" data-delay="0.15">YOUR BRAND</h1>
      <h1 class="text-glitch" data-text="YOUR PLATFORM" data-hover="ZERO TRACE" data-delay="0.3">YOUR PLATFORM</h1>
    </div>
    <p style="font-family:'Inter',sans-serif;font-size:15px;color:rgba(255,255,255,0.5);margin-top:16px;position:relative;z-index:10;max-width:600px;line-height:1.8">Get a complete, production-ready trading ecosystem that looks and feels 100% yours. From web trader and mobile apps to CRM and client portal — every pixel carries your brand identity.</p>
    <div class="hero-glitch-cta" style="pointer-events:auto">
      <button class="btn-shimmer" onclick="location.href='contact.html'"><i class="fa-solid fa-rocket"></i>Get Demo</button>
      <button class="btn-hero-ghost" onclick="location.href='pricing.html'">View Pricing<span class="btn-icon"><i class="fa-solid fa-arrow-right"></i></span></button>
    </div>
  </div>
</section>

<!-- =====================
     WHAT'S INCLUDED
===================== -->
<section class="section" id="included">
  <div class="container">
    <div class="sec-header-centered">
      <div class="sec-label reveal">What's Included</div>
      <div class="sec-title reveal">Everything you need to launch<br>and run a successful brokerage.</div>
    </div>
    <div class="wl-features-grid reveal">
      <div class="wl-feature-card">
        <div class="wl-feature-num">01</div>
        <div class="wl-feature-icon"><i class="fa-solid fa-palette"></i></div>
        <div class="wl-feature-title">Full Brand Customization</div>
        <p class="wl-feature-desc">Custom logos, colors, fonts, domains, and email templates across all platforms.</p>
      </div>
      <div class="wl-feature-card">
        <div class="wl-feature-num">02</div>
        <div class="wl-feature-icon"><i class="fa-solid fa-chart-line"></i></div>
        <div class="wl-feature-title">Web Trader Platform</div>
        <p class="wl-feature-desc">Browser-based trading with real-time charts, order management, and multi-asset support.</p>
      </div>
      <div class="wl-feature-card">
        <div class="wl-feature-num">03</div>
        <div class="wl-feature-icon"><i class="fa-solid fa-mobile-screen"></i></div>
        <div class="wl-feature-title">Mobile Trading App</div>
        <p class="wl-feature-desc">Flutter-based iOS & Android app published under your own developer account.</p>
      </div>
      <div class="wl-feature-card">
        <div class="wl-feature-num">04</div>
        <div class="wl-feature-icon"><i class="fa-solid fa-users-gear"></i></div>
        <div class="wl-feature-title">Client Portal & CRM</div>
        <p class="wl-feature-desc">Self-service dashboard for deposits, withdrawals, KYC, and complete admin panel.</p>
      </div>
      <div class="wl-feature-card">
        <div class="wl-feature-num">05</div>
        <div class="wl-feature-icon"><i class="fa-solid fa-shield-halved"></i></div>
        <div class="wl-feature-title">Enterprise Security</div>
        <p class="wl-feature-desc">Bank-grade encryption, 2FA, DDoS protection, and full regulatory compliance.</p>
      </div>
      <div class="wl-feature-card">
        <div class="wl-feature-num">06</div>
        <div class="wl-feature-icon"><i class="fa-solid fa-chart-bar"></i></div>
        <div class="wl-feature-title">Analytics & Reporting</div>
        <p class="wl-feature-desc">Real-time dashboards with trading volume, revenue, and client activity insights.</p>
      </div>
    </div>
  </div>
</section>

<!-- =====================
     HOW IT WORKS
===================== -->
<section class="section section-alt" id="process">
  <div class="container">
    <div class="sec-header-centered">
      <div class="sec-label reveal">How It Works</div>
      <div class="sec-title reveal">From consultation to go-live<br>in 4 simple steps.</div>
    </div>
    <div class="wl-steps reveal">
      <div class="wl-step">
        <div class="wl-step-num">01</div>
        <div class="wl-step-line"></div>
        <div class="wl-step-title">Consultation</div>
        <p class="wl-step-desc">We discuss your brand, requirements, and target market.</p>
      </div>
      <div class="wl-step">
        <div class="wl-step-num">02</div>
        <div class="wl-step-line"></div>
        <div class="wl-step-title">Customization</div>
        <p class="wl-step-desc">Your platform is branded and configured to your specifications.</p>
      </div>
      <div class="wl-step">
        <div class="wl-step-num">03</div>
        <div class="wl-step-line"></div>
        <div class="wl-step-title">Testing</div>
        <p class="wl-step-desc">Full QA, UAT, and performance testing before launch.</p>
      </div>
      <div class="wl-step">
        <div class="wl-step-num">04</div>
        <div class="wl-step-line"></div>
        <div class="wl-step-title">Go Live</div>
        <p class="wl-step-desc">Deploy on your domain with ongoing support and updates.</p>
      </div>
    </div>
  </div>
</section>

<!-- =====================
     WHY CHOOSE
===================== -->
<section class="section" id="why">
  <div class="container">
    <div class="wl-why-grid reveal">
      <div class="wl-why-left">
        <div class="sec-label">Why Choose Our White Label</div>
        <div class="sec-title">Built for brokers who want full control without the development headache.</div>
      </div>
      <div class="wl-why-right">
        <ul class="wl-why-list">
          <li>100% white-label — zero SetupFX24 branding visible to your clients</li>
          <li>Go live in as little as 2–4 weeks with a fully branded platform</li>
          <li>Mobile apps published under your own App Store &amp; Play Store accounts</li>
          <li>Continuous updates and new features without any downtime</li>
          <li>Dedicated account manager and 24/7 technical support</li>
          <li>Scalable infrastructure that grows with your client base</li>
          <li>Multi-language and multi-currency support out of the box</li>
          <li>Full API access for custom integrations and third-party tools</li>
        </ul>
      </div>
    </div>
  </div>
</section>

<!-- =====================
     PLATFORM PRICING
===================== -->
<section class="section section-alt" id="pricing">
  <div class="container">
    <div class="sec-header-centered">
      <div class="sec-label reveal">Choose Your Plan</div>
      <div class="sec-title reveal">Platform Pricing</div>
      <p class="sec-sub reveal">Select the package that fits your brokerage model. All plans include company incorporation support.</p>
    </div>
    <div class="pricing-grid reveal" style="margin-top:48px">

      <!-- Managed System -->
      <div class="price-card">
        <div class="price-tier">
          <span style="font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:0.4em;text-transform:uppercase;color:rgba(255,255,255,0.5);font-weight:400">Managed_System</span>
        </div>
        <div class="price-amount"><span class="price-currency">&#8377;</span>7,00,000</div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:0.4em;text-transform:uppercase;color:rgba(255,255,255,0.3);margin-top:4px">ONE-TIME PAYMENT</div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:0.25em;color:#6366f1;margin-top:6px;display:flex;align-items:center;gap:6px;text-transform:uppercase">
          <span style="display:inline-block;width:6px;height:6px;background:#6366f1;border-radius:50%;flex-shrink:0"></span>
          + &#8377;25,000 / Month Maintenance
        </div>
        <p class="price-desc">Perfect for managed growth. Full brokerage platform deployed and managed by our team.</p>
        <ul class="price-features">
          <li>IB System</li>
          <li>Prop Trading Module</li>
          <li>Copy Trading</li>
          <li>Bot + Human Support System</li>
          <li>Company Incorporation (UK, USA, Canada)</li>
          <li>Mobile &amp; Web Trading Terminals</li>
          <li>Managed System (No Source Code)</li>
          <li>Ongoing Updates &amp; Support</li>
        </ul>
        <a href="/contact" class="price-btn price-btn-outline">Get Started</a>
      </div>

      <!-- Premium Plan (featured) -->
      <div class="price-card featured">
        <div class="price-tier">
          <span style="font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:0.4em;text-transform:uppercase;color:rgba(255,255,255,0.7);font-weight:400">Premium_Plan</span>
          <span class="popular-badge" style="margin-left:8px">Most_Popular</span>
        </div>
        <div class="price-amount"><span class="price-currency">&#8377;</span>10,00,000</div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:0.4em;text-transform:uppercase;color:rgba(255,255,255,0.3);margin-top:4px">ONE-TIME PAYMENT</div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:0.25em;color:#6366f1;margin-top:6px;display:flex;align-items:center;gap:6px;text-transform:uppercase">
          <span style="display:inline-block;width:6px;height:6px;background:#6366f1;border-radius:50%;flex-shrink:0"></span>
          Full Source Code Access
        </div>
        <p class="price-desc">Complete control and ownership. Modify anything, build on top of it, own it forever.</p>
        <ul class="price-features">
          <li>Everything in Managed System</li>
          <li>Full Source Code Access</li>
          <li>Lifetime Ownership</li>
          <li>Modifications as per your need</li>
          <li>No monthly fees after purchase</li>
          <li>Deploy on your own servers</li>
          <li>White label ready</li>
        </ul>
        <a href="/contact" class="price-btn price-btn-filled">Get Started</a>
      </div>

      <!-- Rental / White Label -->
      <div class="price-card">
        <div class="price-tier">
          <span style="font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:0.4em;text-transform:uppercase;color:rgba(255,255,255,0.5);font-weight:400">White_Label_Rental</span>
        </div>
        <div class="price-amount"><span class="price-currency">&#8377;</span>1,00,000</div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:0.4em;text-transform:uppercase;color:rgba(255,255,255,0.3);margin-top:4px">ONE-TIME SETUP</div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:0.25em;color:#6366f1;margin-top:6px;display:flex;align-items:center;gap:6px;text-transform:uppercase">
          <span style="display:inline-block;width:6px;height:6px;background:#6366f1;border-radius:50%;flex-shrink:0"></span>
          + &#8377;50,000 / Month Rental
        </div>
        <p class="price-desc">Launch under your own brand with zero development. No source code, no modifications — pure white label.</p>
        <ul class="price-features">
          <li>Your brand name &amp; logo</li>
          <li>Mobile &amp; Web Trading Terminals</li>
          <li>IB System included</li>
          <li>Bot + Human Support</li>
          <li>No source code access</li>
          <li>No modifications</li>
          <li>White label only</li>
          <li>Ongoing support included</li>
        </ul>
        <a href="/contact" class="price-btn price-btn-outline">Contact Sales</a>
      </div>

    </div>
    <p style="text-align:center;margin-top:32px;font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:0.3em;text-transform:uppercase;color:rgba(255,255,255,0.25);line-height:1.8">All packages include company incorporation support for UK, USA, and Canada.<br>Prices are exclusive of applicable taxes.</p>
  </div>
</section>

<!-- =====================
     CTA
===================== -->
<section class="cta-section" id="demo">
  <div class="cta-box reveal">
    <div class="cta-bg-light l1"></div>
    <div class="cta-bg-light l2"></div>
    <div class="cta-inner">
      <div class="cta-title">Ready to Launch<br>Your Platform?</div>
      <p class="cta-sub">Schedule a free demo and see how our white-label solution can power your brokerage business.</p>
      <div class="cta-btns">
        <a href="#" class="btn-white">Get Demo</a>
        <a href="/pricing" class="btn-outline-white">View Pricing</a>
      </div>
    </div>
  </div>
</section>

<!-- FOOTER -->
`;

export default function WhiteLabelPage() {
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
      .then(() => { setTimeout(initForceField, 100); });
    load('https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js')
      .then(() => { setTimeout(initTextGlitch, 100); });
    return () => scripts.forEach(s => { try { s.remove(); } catch(e){} });
  }, []);
  return (
    <SiteLayout>
      <div ref={contentRef} dangerouslySetInnerHTML={{ __html: htmlContent }} />
    </SiteLayout>
  );
}

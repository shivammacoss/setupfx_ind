import { useEffect, useRef } from 'react';
import SiteLayout from '../SiteLayout';
import { initForceField, initTextGlitch } from '../heroEffects';

const htmlContent = `
<!-- PAGE HERO -->
<section class="hero-forcefield-wrap" style="position:relative;width:100%;height:100vh;overflow:visible;background:#000">
  <div id="hero-forcefield" style="position:absolute;inset:0;width:100%;height:100%;z-index:0"></div>
  <div class="hero-glitch-content">
    <div class="hero-glitch-lines">
      <h1 class="text-glitch" data-text="WHAT WE BUILD" data-hover="SETUPFX24" data-delay="0">WHAT WE BUILD</h1>
      <h1 class="text-glitch" data-text="SOFTWARE" data-hover="CUSTOM APPS" data-delay="0.15">SOFTWARE</h1>
      <h1 class="text-glitch" data-text="DEVELOPMENT" data-hover="WEB & MOBILE" data-delay="0.3">DEVELOPMENT</h1>
      <h1 class="text-glitch" data-text="SERVICES" data-hover="SINCE 2023" data-delay="0.45">SERVICES</h1>
    </div>
    <p style="font-family:'Inter',sans-serif;font-size:15px;color:rgba(255,255,255,0.5);margin-top:16px;position:relative;z-index:10;max-width:560px;line-height:1.8">From concept to deployment — we build custom applications that power your business forward.</p>
    <div class="hero-glitch-cta" style="pointer-events:auto">
      <button class="btn-shimmer" onclick="location.href='contact.html'"><i class="fa-solid fa-rocket"></i>Get Started</button>
      <button class="btn-hero-ghost" onclick="location.href='pricing.html'">View Pricing<span class="btn-icon"><i class="fa-solid fa-arrow-right"></i></span></button>
    </div>
  </div>
</section>

<!-- SERVICES GRID -->
<section class="section">
  <div class="container">
    <div class="services-grid">
      <div class="service-card reveal">
        <div class="service-num">01</div>
        <div class="service-icon">⚙️</div>
        <div class="service-title">Software Development</div>
        <p class="service-desc">Custom software solutions built with modern technologies, tailored to solve your unique business challenges.</p>
        <a href="#" class="service-link">Learn more <span class="service-arrow">→</span></a>
      </div>
      <div class="service-card reveal">
        <div class="service-num">02</div>
        <div class="service-icon">🌐</div>
        <div class="service-title">Web Application Development</div>
        <p class="service-desc">Scalable, responsive web applications using React, Next.js, and modern frameworks for optimal performance.</p>
        <a href="#" class="service-link">Learn more <span class="service-arrow">→</span></a>
      </div>
      <div class="service-card reveal">
        <div class="service-num">03</div>
        <div class="service-icon">📱</div>
        <div class="service-title">Mobile App Development</div>
        <p class="service-desc">Native and cross-platform mobile apps for iOS and Android that deliver seamless user experiences.</p>
        <a href="#" class="service-link">Learn more <span class="service-arrow">→</span></a>
      </div>
      <div class="service-card reveal">
        <div class="service-num">04</div>
        <div class="service-icon">🗂️</div>
        <div class="service-title">CRM &amp; Business Systems</div>
        <p class="service-desc">Custom CRM, ERP, and admin panel development to streamline your operations and boost productivity.</p>
        <a href="#" class="service-link">Learn more <span class="service-arrow">→</span></a>
      </div>
      <div class="service-card reveal">
        <div class="service-num">05</div>
        <div class="service-icon">🎨</div>
        <div class="service-title">UI / UX Design</div>
        <p class="service-desc">User-centered design that converts visitors into customers with intuitive interfaces and beautiful aesthetics.</p>
        <a href="#" class="service-link">Learn more <span class="service-arrow">→</span></a>
      </div>
      <!-- White Label — full row -->
      <div class="service-card service-card-wl reveal" style="grid-column: 1 / -1">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:48px;align-items:center">
          <div>
            <div class="service-num">06</div>
            <div style="display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border:0.5px solid rgba(99,102,241,0.4);font-family:'JetBrains Mono',monospace;font-size:8px;letter-spacing:0.35em;text-transform:uppercase;color:#6366f1;margin-bottom:16px">WHITE_LABEL</div>
            <div class="service-title" style="font-size:clamp(1.4rem,3vw,2rem)">White Label Solution</div>
            <p class="service-desc" style="margin-top:12px;max-width:480px">Launch your own fully branded trading platform. Your brand, your clients, your business — powered by our technology.</p>
            <a href="/white-label" class="service-link" style="margin-top:20px;color:#6366f1;font-size:10px">
              Explore White Label <span class="service-arrow">→</span>
            </a>
          </div>
          <div style="border:0.5px solid rgba(255,255,255,0.1);overflow:hidden;position:relative">
            <img src="/landing/img/site/services.png" alt="White Label Platform"
              style="width:100%;display:block;opacity:0.85;transition:opacity 300ms,transform 300ms"
              onmouseover="this.style.opacity='1';this.style.transform='scale(1.02)'"
              onmouseout="this.style.opacity='0.85';this.style.transform='scale(1)'"/>
            <div style="position:absolute;top:12px;left:12px;padding:4px 10px;background:rgba(0,0,0,0.7);border:0.5px solid rgba(99,102,241,0.4);font-family:'JetBrains Mono',monospace;font-size:8px;letter-spacing:0.3em;text-transform:uppercase;color:#6366f1">Live_Preview</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- CTA -->
<section class="cta-section">
  <div class="cta-box reveal">
    <div class="cta-bg-light l1"></div>
    <div class="cta-bg-light l2"></div>
    <div class="cta-inner">
      <div class="cta-title">Ready to Start<br>Building?</div>
      <p class="cta-sub">Tell us about your project and we'll put together a custom proposal within 24 hours.</p>
      <div class="cta-btns">
        <a href="/contact" class="btn-white">Get Free Consultation</a>
        <a href="/pricing" class="btn-outline-white">View Pricing</a>
      </div>
    </div>
  </div>
</section>

<!-- FOOTER -->
`;

export default function ServicesPage() {
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

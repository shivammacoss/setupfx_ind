import { useEffect, useRef } from 'react';
import SiteLayout from '../SiteLayout';
import { initForceField, initTextGlitch } from '../heroEffects';

const htmlContent = `
<section class="hero-forcefield-wrap" style="position:relative;width:100%;height:100vh;overflow:visible;background:#000">
  <div id="hero-forcefield" style="position:absolute;inset:0;width:100%;height:100%;z-index:0"></div>
  <div class="hero-glitch-content">
    <div class="hero-glitch-lines">
      <h1 class="text-glitch" data-text="INSIGHTS &" data-hover="SETUPFX24" data-delay="0">INSIGHTS &</h1>
      <h1 class="text-glitch" data-text="RESOURCES" data-hover="KNOWLEDGE" data-delay="0.15">RESOURCES</h1>
      <h1 class="text-glitch" data-text="BLOG" data-hover="READ NOW" data-delay="0.3">BLOG</h1>
    </div>
    <p style="font-family:'Inter',sans-serif;font-size:15px;color:rgba(255,255,255,0.5);margin-top:16px;position:relative;z-index:10;max-width:560px;line-height:1.8">Industry insights, technical guides, and company news from the SetupFX24 team.</p>
  </div>
</section>

<section class="section">
<div class="container">
<div class="blog-grid reveal">
  <div class="blog-card"><div class="blog-tag">Technology</div><div class="blog-title">How We Build Trading Platforms That Handle 100K+ Users</div><p class="blog-excerpt">A deep dive into the architecture, technology stack, and performance optimization strategies behind our trading platform infrastructure.</p><div class="blog-meta"><span class="blog-date">Dec 2025 &middot; 8 min</span><a href="#" class="blog-link">Read More &rarr;</a></div></div>
  <div class="blog-card"><div class="blog-tag">Marketing</div><div class="blog-title">5 SEO Strategies That Tripled Our Client's Organic Traffic</div><p class="blog-excerpt">Real case study breakdown of the SEO tactics we used to achieve 320% organic traffic growth for a B2B SaaS company.</p><div class="blog-meta"><span class="blog-date">Nov 2025 &middot; 6 min</span><a href="#" class="blog-link">Read More &rarr;</a></div></div>
  <div class="blog-card"><div class="blog-tag">Industry</div><div class="blog-title">The Future of White-Label Brokerage Solutions in 2026</div><p class="blog-excerpt">Market trends, regulatory changes, and technology shifts shaping the white-label brokerage platform landscape.</p><div class="blog-meta"><span class="blog-date">Oct 2025 &middot; 10 min</span><a href="#" class="blog-link">Read More &rarr;</a></div></div>
  <div class="blog-card"><div class="blog-tag">Development</div><div class="blog-title">React vs Next.js: Choosing the Right Framework for Your App</div><p class="blog-excerpt">A practical comparison of React and Next.js for different project types, with recommendations based on real-world experience.</p><div class="blog-meta"><span class="blog-date">Sep 2025 &middot; 7 min</span><a href="#" class="blog-link">Read More &rarr;</a></div></div>
  <div class="blog-card"><div class="blog-tag">Case_Study</div><div class="blog-title">How We Helped a Fitness Brand Launch Their App in 12 Weeks</div><p class="blog-excerpt">From concept to App Store — the full story of building a cross-platform fitness tracking app with social features.</p><div class="blog-meta"><span class="blog-date">Aug 2025 &middot; 5 min</span><a href="#" class="blog-link">Read More &rarr;</a></div></div>
  <div class="blog-card"><div class="blog-tag">Marketing</div><div class="blog-title">Google Ads vs Meta Ads: Where Should You Spend Your Budget?</div><p class="blog-excerpt">Data-driven analysis comparing ROI, cost per acquisition, and audience quality across Google and Meta advertising platforms.</p><div class="blog-meta"><span class="blog-date">Jul 2025 &middot; 9 min</span><a href="#" class="blog-link">Read More &rarr;</a></div></div>
</div>
</div>
</section>

<section class="cta-section"><div class="cta-box reveal"><div class="cta-bg-light l1"></div><div class="cta-bg-light l2"></div><div class="cta-inner">
<div class="cta-title">Want to Learn More?</div>
<p class="cta-sub">Subscribe to our newsletter for weekly insights on technology, marketing, and business growth.</p>
<div class="cta-btns"><a href="/contact" class="btn-white">Subscribe</a><a href="/services" class="btn-outline-white">View Services</a></div>
</div></div></section>
`;

export default function BlogPage() {
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

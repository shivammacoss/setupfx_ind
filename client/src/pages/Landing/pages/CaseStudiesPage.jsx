import { useEffect, useRef } from 'react';
import SiteLayout from '../SiteLayout';

const htmlContent = `
<section class="hero-forcefield-wrap" style="position:relative;width:100%;height:100vh;overflow:visible;background:#000">
  <div id="hero-forcefield" style="position:absolute;inset:0;width:100%;height:100%;z-index:0"></div>
  <div class="hero-glitch-content">
    <div class="hero-glitch-lines">
      <h1 class="text-glitch" data-text="REAL RESULTS" data-hover="PROVEN ROI" data-delay="0">REAL RESULTS</h1>
      <h1 class="text-glitch" data-text="CASE" data-hover="SUCCESS" data-delay="0.15">CASE</h1>
      <h1 class="text-glitch" data-text="STUDIES" data-hover="STORIES" data-delay="0.3">STUDIES</h1>
    </div>
    <p style="font-family:'Inter',sans-serif;font-size:15px;color:rgba(255,255,255,0.5);margin-top:16px;position:relative;z-index:10;max-width:560px;line-height:1.8">Real results from real clients. See how we've helped businesses achieve their goals.</p>
    <div class="hero-glitch-cta" style="pointer-events:auto">
      <button class="btn-shimmer" onclick="location.href='contact.html'"><i class="fa-solid fa-rocket"></i>Start Your Project</button>
      <button class="btn-hero-ghost" onclick="location.href='services.html'">View Services<span class="btn-icon"><i class="fa-solid fa-arrow-right"></i></span></button>
    </div>
  </div>
</section>

<!-- CASE 1 -->
<section class="section">
<div class="container">
<div class="cs-grid reveal">
<div class="cs-left">
<div class="cs-tag">Web Application</div>
<div class="cs-title">E-Commerce Platform for Fashion Brand</div>
<p class="cs-text"><strong>Challenge:</strong> A growing fashion brand needed a custom e-commerce platform to replace their limited Shopify store. They required advanced inventory management, multi-currency support, and a custom loyalty program that their existing platform couldn't accommodate.</p>
<p class="cs-text"><strong>Solution:</strong> We built a fully custom e-commerce platform using React and Node.js with integrated inventory management, automated payment processing via Stripe, a personalized recommendation engine, and a real-time analytics dashboard for the operations team.</p>
<p class="cs-text"><strong>Result:</strong> Within 6 months of launch, the client saw a 240% increase in online revenue, page load times dropped to 0.8 seconds (from 3.2s), and conversion rates improved by 85% due to the optimized checkout flow and personalized shopping experience.</p>
</div>
<div class="cs-right">
<div class="cs-stat-row">
<div class="cs-stat"><div class="cs-stat-val">+240%</div><div class="cs-stat-label">Revenue Increase</div></div>
<div class="cs-stat"><div class="cs-stat-val">0.8s</div><div class="cs-stat-label">Page Load Time</div></div>
<div class="cs-stat"><div class="cs-stat-val">+85%</div><div class="cs-stat-label">Conversion Rate</div></div>
</div>
</div>
</div>
</div>
</section>

<!-- CASE 2 -->
<section class="section section-alt">
<div class="container">
<div class="cs-grid reveal">
<div class="cs-left">
<div class="cs-tag">Mobile App</div>
<div class="cs-title">Fitness Tracking App with Social Features</div>
<p class="cs-text"><strong>Challenge:</strong> A health and fitness startup wanted to build a cross-platform mobile app that combined workout tracking with social challenges and gamification. They needed to launch quickly to secure their next funding round.</p>
<p class="cs-text"><strong>Solution:</strong> We developed a Flutter-based iOS and Android app with real-time workout tracking, social challenges with leaderboards, push notification-driven engagement loops, and integration with Apple Health and Google Fit. The entire project was delivered in 12 weeks from concept to app store approval.</p>
<p class="cs-text"><strong>Result:</strong> The app achieved 50,000+ downloads in its first 3 months, maintained a 78% 30-day user retention rate (industry average is 25%), and earned a 4.8/5 star rating. The startup successfully closed their Series A funding round.</p>
</div>
<div class="cs-right">
<div class="cs-stat-row">
<div class="cs-stat"><div class="cs-stat-val">50K+</div><div class="cs-stat-label">Downloads</div></div>
<div class="cs-stat"><div class="cs-stat-val">78%</div><div class="cs-stat-label">User Retention</div></div>
<div class="cs-stat"><div class="cs-stat-val">4.8/5</div><div class="cs-stat-label">App Rating</div></div>
</div>
</div>
</div>
</div>
</section>

<!-- CASE 3 -->
<section class="section">
<div class="container">
<div class="cs-grid reveal">
<div class="cs-left">
<div class="cs-tag">Digital Marketing</div>
<div class="cs-title">SaaS Lead Generation Campaign</div>
<p class="cs-text"><strong>Challenge:</strong> A B2B SaaS company was struggling with high customer acquisition costs and low organic visibility. Their previous marketing agency had failed to deliver measurable results after 8 months of engagement.</p>
<p class="cs-text"><strong>Solution:</strong> We executed a full-funnel marketing strategy: comprehensive technical SEO audit and optimization, content marketing with 12 pillar articles targeting high-intent keywords, Google Ads campaigns with custom landing pages for each audience segment, and LinkedIn advertising for decision-maker targeting.</p>
<p class="cs-text"><strong>Result:</strong> Organic traffic increased by 320% within 6 months, qualified leads grew by 180%, and cost per lead dropped by 45%. The client's marketing ROI improved from 1.2x to 4.8x, making their marketing function profitable for the first time.</p>
</div>
<div class="cs-right">
<div class="cs-stat-row">
<div class="cs-stat"><div class="cs-stat-val">+320%</div><div class="cs-stat-label">Organic Traffic</div></div>
<div class="cs-stat"><div class="cs-stat-val">+180%</div><div class="cs-stat-label">Qualified Leads</div></div>
<div class="cs-stat"><div class="cs-stat-val">-45%</div><div class="cs-stat-label">Cost Per Lead</div></div>
</div>
</div>
</div>
</div>
</section>

<section class="cta-section"><div class="cta-box reveal"><div class="cta-bg-light l1"></div><div class="cta-bg-light l2"></div><div class="cta-inner">
<div class="cta-title">Want Results<br>Like These?</div>
<p class="cta-sub">Let's discuss how we can help your business achieve similar outcomes. Free consultation, no obligations.</p>
<div class="cta-btns"><a href="/contact" class="btn-white">Start Your Project</a><a href="/services" class="btn-outline-white">View Services</a></div>
</div></div></section>
`;

export default function CaseStudiesPage() {
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

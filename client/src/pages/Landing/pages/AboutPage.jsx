import { useEffect, useRef } from 'react';
import SiteLayout from '../SiteLayout';

const htmlContent = `
<section class="hero-forcefield-wrap" style="position:relative;width:100%;height:100vh;overflow:visible;background:#000">
  <div id="hero-forcefield" style="position:absolute;inset:0;width:100%;height:100%;z-index:0"></div>
  <div class="hero-glitch-content">
    <div class="hero-glitch-lines">
      <h1 class="text-glitch" data-text="GLOBAL SOFTWARE" data-hover="SETUPFX24" data-delay="0">GLOBAL SOFTWARE</h1>
      <h1 class="text-glitch" data-text="& DIGITAL" data-hover="WORLDWIDE" data-delay="0.15">& DIGITAL</h1>
      <h1 class="text-glitch" data-text="MARKETING" data-hover="SINCE 2023" data-delay="0.3">MARKETING</h1>
    </div>
    <p style="font-family:'Inter',sans-serif;font-size:15px;color:rgba(255,255,255,0.5);margin-top:16px;position:relative;z-index:10;max-width:560px;line-height:1.8">SetupFX Softtech (OPC) Private Limited — powering brokerages and businesses worldwide since 2023.</p>
    <div class="hero-glitch-cta" style="pointer-events:auto">
      <button class="btn-shimmer" onclick="location.href='contact.html'"><i class="fa-solid fa-rocket"></i>Get in Touch</button>
      <button class="btn-hero-ghost" onclick="location.href='services.html'">View Services<span class="btn-icon"><i class="fa-solid fa-arrow-right"></i></span></button>
    </div>
  </div>
</section>

<!-- WHO WE ARE -->
<section class="section">
<div class="container">
<div class="sec-label reveal">Who We Are</div>
<div class="sec-title reveal">Building the Future<br>of Digital Business</div>
<p class="sec-sub reveal" style="margin-bottom:24px">SetupFX24 is a global software development and digital marketing company headquartered in Glasgow, United Kingdom. We help businesses of all sizes — from early-stage startups to global enterprises — build, scale, and grow in the digital world.</p>
<p class="sec-sub reveal">We combine cutting-edge technology with data-driven marketing strategies to deliver measurable results. From custom web and mobile applications to CRM systems, white-label trading platforms, and full-funnel digital marketing — we provide end-to-end solutions that transform how businesses operate and connect with their customers.</p>
</div>
</section>

<!-- MISSION & VISION -->
<section class="section section-alt">
<div class="container">
<div class="sec-header-centered">
<div class="sec-label reveal">What Drives Us</div>
<div class="sec-title reveal">Mission &amp; Vision</div>
</div>
<div class="about-grid reveal">
<div class="about-col">
<div class="about-col-label">Our Mission</div>
<div class="about-col-title">Empower Businesses</div>
<p class="about-col-text">To empower businesses of all sizes with world-class software and marketing solutions that drive real growth. We believe every business deserves access to enterprise-grade technology, regardless of size or budget.</p>
</div>
<div class="about-col">
<div class="about-col-label">Our Vision</div>
<div class="about-col-title">Global Partner</div>
<p class="about-col-text">To become the go-to global partner for businesses seeking digital transformation and sustainable growth. We envision a world where technology removes barriers and creates opportunities for businesses everywhere.</p>
</div>
</div>
</div>
</section>

<!-- STATS -->
<section class="section">
<div class="container">
<div class="choose-grid reveal" style="margin-top:0">
<div class="choose-card" style="text-align:center"><div style="font-family:'Inter Tight',sans-serif;font-weight:900;font-size:40px;letter-spacing:-0.02em;color:#6366f1;margin-bottom:8px">250+</div><div class="choose-title">Projects Delivered</div><p class="choose-desc">Successfully completed across 15+ countries</p></div>
<div class="choose-card" style="text-align:center"><div style="font-family:'Inter Tight',sans-serif;font-weight:900;font-size:40px;letter-spacing:-0.02em;color:#6366f1;margin-bottom:8px">50+</div><div class="choose-title">Global Clients</div><p class="choose-desc">Startups, SMBs, and enterprises worldwide</p></div>
<div class="choose-card" style="text-align:center"><div style="font-family:'Inter Tight',sans-serif;font-weight:900;font-size:40px;letter-spacing:-0.02em;color:#6366f1;margin-bottom:8px">98%</div><div class="choose-title">Client Satisfaction</div><p class="choose-desc">Measured through post-project surveys</p></div>
</div>
</div>
</section>

<!-- VALUES -->
<section class="section section-alt">
<div class="container">
<div class="sec-header-centered">
<div class="sec-label reveal">Our Values</div>
<div class="sec-title reveal">What We Stand For</div>
</div>
<div class="values-grid reveal">
<div class="value-card"><div class="value-icon"><i class="fa-solid fa-lightbulb"></i></div><div class="value-title">Innovation</div><p class="value-desc">We stay ahead of technology trends to deliver cutting-edge solutions for our clients.</p></div>
<div class="value-card"><div class="value-icon"><i class="fa-solid fa-eye"></i></div><div class="value-title">Transparency</div><p class="value-desc">Open communication, clear pricing, and honest timelines — no surprises, ever.</p></div>
<div class="value-card"><div class="value-icon"><i class="fa-solid fa-medal"></i></div><div class="value-title">Quality</div><p class="value-desc">Every line of code is reviewed, tested, and optimized before it reaches production.</p></div>
<div class="value-card"><div class="value-icon"><i class="fa-solid fa-heart"></i></div><div class="value-title">Client-First</div><p class="value-desc">Your success is our success. We measure ourselves by the results we deliver for you.</p></div>
<div class="value-card"><div class="value-icon"><i class="fa-solid fa-globe"></i></div><div class="value-title">Global Mindset</div><p class="value-desc">We understand diverse markets, regulations, and cultures across 15+ countries.</p></div>
<div class="value-card"><div class="value-icon"><i class="fa-solid fa-arrows-rotate"></i></div><div class="value-title">Continuous Improvement</div><p class="value-desc">We never stop learning, iterating, and improving our processes and deliverables.</p></div>
</div>
</div>
</section>

<!-- TEAM -->
<section class="section">
<div class="container">
<div class="sec-header-centered">
<div class="sec-label reveal">Leadership</div>
<div class="sec-title reveal">Our Team</div>
</div>
<div class="team-grid reveal">
<div class="team-card"><div class="team-avatar"><i class="fa-solid fa-user"></i></div><div class="team-name">Shivam Singh</div><div class="team-role">Founder &amp; CEO</div><p class="team-bio">Visionary leader with deep expertise in fintech and digital transformation. Driving SetupFX24's global growth strategy.</p></div>
<div class="team-card"><div class="team-avatar"><i class="fa-solid fa-user"></i></div><div class="team-name">Technical Lead</div><div class="team-role">CTO</div><p class="team-bio">Senior architect with 10+ years in trading platform development, cloud infrastructure, and scalable systems.</p></div>
<div class="team-card"><div class="team-avatar"><i class="fa-solid fa-user"></i></div><div class="team-name">Marketing Head</div><div class="team-role">Head of Marketing</div><p class="team-bio">Data-driven marketer specializing in SEO, paid acquisition, and brand strategy for global brands.</p></div>
</div>
</div>
</section>

<!-- OFFICE -->
<section class="section section-alt">
<div class="container">
<div class="sec-label reveal">Our Office</div>
<div class="sec-title reveal">Get in Touch</div>
<div class="office-box reveal">
<div class="office-label">Headquarters</div>
<p class="office-address">Office 9364hn 3 Fitzroy Place, Area 1/1, Sauchiehall Street,<br>Glasgow City Centre, United Kingdom, G3 7RH</p>
<div class="office-contacts">
<div class="office-contact"><i class="fa-solid fa-envelope"></i> setupfx24@gmail.com</div>
<div class="office-contact"><i class="fa-brands fa-whatsapp"></i> +1 (908) 228-0305</div>
</div>
</div>
</div>
</section>

<!-- CTA -->
<section class="cta-section"><div class="cta-box reveal"><div class="cta-bg-light l1"></div><div class="cta-bg-light l2"></div><div class="cta-inner">
<div class="cta-title">Ready to Work<br>With Us?</div>
<p class="cta-sub">Let's discuss your project. Our team will respond within 24 hours.</p>
<div class="cta-btns"><a href="/contact" class="btn-white">Get in Touch</a><a href="/services" class="btn-outline-white">View Services</a></div>
</div></div></section>
`;

export default function AboutPage() {
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

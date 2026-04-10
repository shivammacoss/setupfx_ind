import { useEffect, useRef } from 'react';
import SiteLayout from '../SiteLayout';

const htmlContent = `
<section class="hero-forcefield-wrap" style="position:relative;width:100%;height:100vh;overflow:visible;background:#000">
  <div id="hero-forcefield" style="position:absolute;inset:0;width:100%;height:100%;z-index:0"></div>
  <div class="hero-glitch-content">
    <div class="hero-glitch-lines">
      <h1 class="text-glitch" data-text="FREQUENTLY" data-hover="GOT QUESTIONS?" data-delay="0">FREQUENTLY</h1>
      <h1 class="text-glitch" data-text="ASKED" data-hover="WE ANSWER" data-delay="0.15">ASKED</h1>
      <h1 class="text-glitch" data-text="QUESTIONS" data-hover="EVERYTHING" data-delay="0.3">QUESTIONS</h1>
    </div>
    <p style="font-family:'Inter',sans-serif;font-size:15px;color:rgba(255,255,255,0.5);margin-top:16px;position:relative;z-index:10;max-width:560px;line-height:1.8">Everything you need to know about our services, pricing, and process.</p>
  </div>
</section>

<section class="section">
<div class="container">
<div class="faq-wrap reveal">

<div class="faq-group-label">General</div>

<details>
<summary>What services does SetupFX24 offer?</summary>
<p>We provide custom software development, web and mobile app development, CRM systems, white-label trading platforms, digital marketing, SEO, paid advertising, social media management, and content marketing services. We serve businesses from startups to global enterprises across 15+ countries.</p>
</details>

<details>
<summary>Where is SetupFX24 based?</summary>
<p>Our headquarters is in Glasgow, United Kingdom (Office 9364hn 3 Fitzroy Place, Glasgow City Centre, G3 7RH). We serve clients globally across Europe, Asia, Middle East, North America, and Africa.</p>
</details>

<details>
<summary>How long has SetupFX24 been in business?</summary>
<p>We've been delivering software and marketing solutions since 2023, with over 250 projects completed for 50+ clients worldwide. Our team has deep expertise in fintech, e-commerce, SaaS, and professional services.</p>
</details>

<details>
<summary>Do you work with startups or only enterprises?</summary>
<p>We work with businesses of all sizes. From early-stage startups building their first MVP to global enterprises upgrading legacy systems. Our pricing and processes are flexible to accommodate different budgets and timelines.</p>
</details>

<details>
<summary>What industries do you specialize in?</summary>
<p>Our core specializations include fintech and trading platforms, e-commerce, SaaS products, health and fitness applications, and professional services. However, we've successfully delivered projects across many other industries.</p>
</details>

<div class="faq-group-label">Services &amp; Process</div>

<details>
<summary>How long does a typical project take?</summary>
<p>Timelines vary based on complexity: simple websites take 2-4 weeks, custom web applications 6-12 weeks, mobile apps 8-16 weeks, and trading platforms 12-24 weeks. We provide detailed timelines after the discovery phase and keep you updated with weekly progress reports.</p>
</details>

<details>
<summary>What technologies do you use?</summary>
<p>Our primary stack includes React, Next.js, TypeScript, Flutter, Node.js, Python (Django/FastAPI), Go, PostgreSQL, Redis, AWS, and Google Cloud. We choose the best technology for each specific project based on requirements, scalability needs, and long-term maintainability.</p>
</details>

<details>
<summary>Do you provide ongoing support after launch?</summary>
<p>Yes. All project packages include post-launch support (1-3 months depending on the plan). We also offer ongoing maintenance and feature development packages with SLA-backed response times, regular security updates, and performance monitoring.</p>
</details>

<details>
<summary>Can I see progress during development?</summary>
<p>Absolutely. We use agile sprints (typically 2-week cycles) with regular demos and progress updates. You have access to staging environments throughout development, and we use project management tools where you can track tasks, timelines, and deliverables in real-time.</p>
</details>

<details>
<summary>Do you offer white-label solutions?</summary>
<p>Yes. Our white-label trading platforms, CRM systems, and applications can be fully branded to your company — custom domain, logos, color schemes, onboarding flows, and email templates. Zero visible trace of our technology. Delivered turnkey in 2-4 weeks.</p>
</details>

<div class="faq-group-label">Pricing &amp; Billing</div>

<details>
<summary>How much do your services cost?</summary>
<p>Projects start at approximately &#x20B9;1,00,000 for websites. Custom applications, trading platforms, and marketing retainers are quoted based on specific requirements. We provide detailed proposals with transparent pricing after a free consultation call.</p>
</details>

<details>
<summary>Do you offer payment plans?</summary>
<p>Yes. We typically structure project payments as 40% upfront before work begins, 30% at the project midpoint milestone, and 30% upon final delivery and approval. For ongoing services, we offer monthly billing with flexible terms.</p>
</details>

<details>
<summary>Is there a free consultation?</summary>
<p>Yes. We offer a free 60-minute consultation to discuss your requirements, understand your business goals, and provide initial recommendations. After the call, we deliver a detailed project proposal with timeline and pricing within 48 hours.</p>
</details>

<details>
<summary>What's included in the monthly maintenance fee?</summary>
<p>Monthly maintenance includes 24/7 server monitoring, security updates and patches, bug fixes, minor feature updates (up to a set number of hours), performance optimization, database maintenance, SSL certificate management, and priority support access.</p>
</details>

<details>
<summary>Can I cancel or pause my project?</summary>
<p>We offer flexibility with milestone-based contracts. You can pause or cancel with 30 days written notice. In case of cancellation, you pay only for work completed to date, and we deliver all finished work product. Contact your project manager to discuss any changes to your engagement.</p>
</details>

</div>
</div>
</section>

<section class="cta-section"><div class="cta-box reveal"><div class="cta-bg-light l1"></div><div class="cta-bg-light l2"></div><div class="cta-inner">
<div class="cta-title">Still Have Questions?</div>
<p class="cta-sub">Get in touch with our team. We're happy to help with any questions about our services or process.</p>
<div class="cta-btns"><a href="/contact" class="btn-white">Contact Us</a><a href="/pricing" class="btn-outline-white">View Pricing</a></div>
</div></div></section>
`;

export default function FaqPage() {
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

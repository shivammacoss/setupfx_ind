import { useEffect, useRef } from 'react';
import SiteLayout from '../SiteLayout';
import { initForceField, initTextGlitch } from '../heroEffects';

const htmlContent = `
<!-- HERO — ForceField + Glitch Text -->
<section class="hero-forcefield-wrap" id="home" style="position:relative;width:100%;height:100vh;overflow:visible;background:#000">
  <!-- p5.js ForceField canvas -->
  <div id="hero-forcefield" style="position:absolute;inset:0;width:100%;height:100%;z-index:0"></div>

  <!-- Glitch text overlay -->
  <div class="hero-glitch-content">
    <div class="hero-glitch-lines">
      <h1 class="text-glitch" data-text="SETUPFX" data-hover="SETUPFX" data-delay="0">SETUPFX</h1>
      <h1 class="text-glitch" data-text="PROVIDES LEGAL &" data-hover="GLOBAL SUPPORT" data-delay="0.15">PROVIDES LEGAL &</h1>
      <h1 class="text-glitch" data-text="TECH SUPPORT IN" data-hover="INFRASTRUCTURE" data-delay="0.3">TECH SUPPORT IN</h1>
      <h1 class="text-glitch" data-text="GLOBAL MARKET" data-hover="WORLD CLASS" data-delay="0.45">GLOBAL MARKET</h1>
      <h1 class="text-glitch" data-text="TRADING PLATFORMS" data-hover="SINCE 2023" data-delay="0.6">TRADING PLATFORMS</h1>
    </div>
    <div class="hero-glitch-cta" style="pointer-events:auto">
      <button class="btn-shimmer" onclick="location.href='services.html'"><i class="fa-solid fa-rocket"></i>Explore Services</button>
      <button class="btn-hero-ghost" onclick="location.href='contact.html'">Contact Us<span class="btn-icon"><i class="fa-solid fa-arrow-right"></i></span></button>
    </div>
  </div>
</section>

<!-- TRUST BAR -->
<div class="trust-bar">
  <div class="trust-bar-inner">
    <span class="trust-title">From startups to global enterprises</span>
    <div class="trust-divider"></div>
    <div class="trust-items">
      <span class="trust-item">Custom Development</span>
      <span class="trust-item">Growth Marketing</span>
      <span class="trust-item">Secure &amp; Reliable</span>
      <span class="trust-item">Fast Delivery</span>
      <span class="trust-item">Global Reach</span>
      <span class="trust-item">24/7 Support</span>
    </div>
  </div>
</div>

<!-- SERVICES -->
<section class="section" id="services">
  <div class="container">
    <div class="sec-label reveal">Our Services</div>
    <div class="sec-title reveal">Software Development<br>Services</div>
    <p class="sec-sub reveal">From concept to deployment — we build custom applications that power your business forward.</p>
    <div class="services-grid" style="margin-top:48px">
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
      <!-- White Label — spans full row -->
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
            <img src="/landing/img/site/services.png" alt="White Label Platform" style="width:100%;display:block;opacity:0.85;transition:opacity 300ms,transform 300ms" onmouseover="this.style.opacity='1';this.style.transform='scale(1.02)'" onmouseout="this.style.opacity='0.85';this.style.transform='scale(1)'"/>
            <div style="position:absolute;top:12px;left:12px;padding:4px 10px;background:rgba(0,0,0,0.7);border:0.5px solid rgba(99,102,241,0.4);font-family:'JetBrains Mono',monospace;font-size:8px;letter-spacing:0.3em;text-transform:uppercase;color:#6366f1">Live_Preview</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- DIGITAL MARKETING -->
<section class="section section-alt dm-section" id="marketing">
  <div class="container">
    <div class="sec-label reveal">Digital Marketing</div>
    <div class="sec-title reveal">Grow Your Business Online</div>
    <p class="sec-sub reveal">Data-driven marketing strategies that attract, engage, and convert your ideal customers.</p>
    <div class="dm-grid reveal" style="margin-top:48px">
      <div class="dm-left">
        <div class="dm-tabs">
          <span class="dm-tab active">Strategy</span>
          <span class="dm-tab">SEO</span>
          <span class="dm-tab">Paid Ads</span>
          <span class="dm-tab">Social Media</span>
          <span class="dm-tab">Content</span>
        </div>
        <div class="dm-content">
          <h3>Data-Driven Marketing Strategy</h3>
          <p>We craft comprehensive marketing strategies backed by data and market research. From audience analysis to campaign planning, we build roadmaps that align with your business goals and deliver measurable ROI.</p>
          <ul class="dm-list">
            <li>Market research &amp; competitor analysis</li>
            <li>Target audience identification</li>
            <li>Multi-channel campaign planning</li>
            <li>KPI setting &amp; performance tracking</li>
            <li>Quarterly strategy reviews &amp; optimization</li>
          </ul>
          <a href="#" class="btn-white">Get Free Consultation</a>
        </div>
      </div>
      <div class="dm-right">
        <div class="dm-dashboard">
          <div class="dm-dash-header">
            <span class="dm-dash-title">Marketing_Analytics_Dashboard</span>
            <span class="dm-dash-badge">Trending_Up</span>
          </div>
          <div class="dm-roi">
            <div class="dm-roi-label">Avg. ROI Increase</div>
            <div class="dm-roi-num">+340%</div>
            <div class="dm-roi-sub">For our clients</div>
          </div>
          <div class="dm-metrics">
            <div class="dm-metric">
              <div class="dm-metric-label">Impressions</div>
              <div class="dm-metric-val">1.2M</div>
              <div class="dm-metric-chg">+20%</div>
            </div>
            <div class="dm-metric">
              <div class="dm-metric-label">Clicks</div>
              <div class="dm-metric-val">84K</div>
              <div class="dm-metric-chg">+35%</div>
            </div>
            <div class="dm-metric">
              <div class="dm-metric-label">Conversions</div>
              <div class="dm-metric-val">12.4K</div>
              <div class="dm-metric-chg">+50%</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- SOLUTIONS -->
<section class="section" id="solutions">
  <div class="container">
    <div class="sec-label reveal">Solutions</div>
    <div class="sec-title reveal">Tailored Solutions for<br>Every Business Need</div>
    <p class="sec-sub reveal">We don't believe in one-size-fits-all. Our solutions are custom-built to address your specific challenges.</p>
    <div class="solutions-grid reveal" style="margin-top:48px">
      <div class="solution-card">
        <div class="solution-num">SYSTEM_01</div>
        <div class="solution-title">Custom Software Solutions</div>
        <p class="solution-desc">Bespoke software designed to solve your unique business challenges with scalable, maintainable architecture.</p>
      </div>
      <div class="solution-card">
        <div class="solution-num">SYSTEM_02</div>
        <div class="solution-title">Business Automation</div>
        <p class="solution-desc">Automate repetitive workflows, reduce manual errors, and boost team productivity with smart automation.</p>
      </div>
      <div class="solution-card">
        <div class="solution-num">SYSTEM_03</div>
        <div class="solution-title">CRM &amp; Admin Panels</div>
        <p class="solution-desc">Centralized dashboards for managing clients, data, operations, and team collaboration in one place.</p>
      </div>
      <div class="solution-card">
        <div class="solution-num">SYSTEM_04</div>
        <div class="solution-title">Enterprise Applications</div>
        <p class="solution-desc">Large-scale, mission-critical systems built for performance, security, and enterprise-grade reliability.</p>
      </div>
    </div>
    <div class="sec-header-centered" style="margin-top:80px">
      <div class="sec-label">Industries</div>
      <div class="sec-title">Solutions for Every Stage of Growth</div>
    </div>
    <div class="industries-grid reveal">
      <div class="industry-card">
        <div class="industry-name">Startups</div>
        <p class="industry-desc">MVP development, rapid prototyping, and scalable architecture to help you validate ideas fast and grow.</p>
        <div class="industry-tags">
          <span class="industry-tag">MVP in 4–6 weeks</span>
          <span class="industry-tag">Scalable tech stack</span>
          <span class="industry-tag">Growth marketing</span>
        </div>
      </div>
      <div class="industry-card">
        <div class="industry-name">SMBs</div>
        <p class="industry-desc">Custom web apps, CRM systems, and digital marketing designed to streamline and accelerate growth.</p>
        <div class="industry-tags">
          <span class="industry-tag">Custom business apps</span>
          <span class="industry-tag">CRM &amp; automation</span>
          <span class="industry-tag">SEO &amp; paid ads</span>
        </div>
      </div>
      <div class="industry-card">
        <div class="industry-name">Enterprises</div>
        <p class="industry-desc">Complex systems, integrations, and large-scale applications built for performance and compliance.</p>
        <div class="industry-tags">
          <span class="industry-tag">Enterprise-grade systems</span>
          <span class="industry-tag">API integrations</span>
          <span class="industry-tag">24/7 support</span>
        </div>
      </div>
      <div class="industry-card">
        <div class="industry-name">Global Brands</div>
        <p class="industry-desc">World-class digital experiences, multi-market campaigns, and technology at scale.</p>
        <div class="industry-tags">
          <span class="industry-tag">Multi-market strategy</span>
          <span class="industry-tag">Brand-level UX</span>
          <span class="industry-tag">Global campaigns</span>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- WHY SETUPFX -->
<section class="section section-alt" id="about">
  <div class="container">
    <div class="why-grid reveal">
      <div class="why-left">
        <div class="sec-label">Why SetupFX24</div>
        <div class="sec-title">Your Partner for Software &amp; Digital Growth</div>
        <p class="sec-sub" style="margin-top:16px">SetupFX24 is a global software development and digital marketing company helping businesses build, scale, and grow in the digital world. We combine cutting-edge technology with data-driven marketing strategies to deliver measurable results.</p>
        <p class="sec-sub" style="margin-top:12px">From custom web and mobile applications to CRM systems and full-funnel digital marketing, we provide end-to-end solutions that transform how businesses operate and connect with their customers.</p>
        <div class="why-mission-vision">
          <div class="mv-card">
            <div class="mv-label">Our Mission</div>
            <p class="mv-text">To empower businesses of all sizes with world-class software and marketing solutions that drive real growth.</p>
          </div>
          <div class="mv-card">
            <div class="mv-label">Our Vision</div>
            <p class="mv-text">To become the go-to global partner for businesses seeking digital transformation and sustainable growth.</p>
          </div>
        </div>
      </div>
      <div class="why-right">
        <div class="why-stat">
          <div class="why-stat-num">250<span class="accent">+</span></div>
          <div class="why-stat-label">Projects Delivered</div>
        </div>
        <div class="why-stat">
          <div class="why-stat-num">50<span class="accent">+</span></div>
          <div class="why-stat-label">Global Clients</div>
        </div>
        <div class="why-stat">
          <div class="why-stat-num">98<span class="accent">%</span></div>
          <div class="why-stat-label">Client Satisfaction</div>
        </div>
        <div class="why-stat">
          <div class="why-stat-num">24<span class="accent">/7</span></div>
          <div class="why-stat-label">Dedicated Support</div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- WHY CHOOSE US -->
<section class="section">
  <div class="container">
    <div class="sec-header-centered">
      <div class="sec-label reveal">Why Choose Us</div>
      <div class="sec-title reveal">Why Businesses Trust SetupFX24</div>
      <p class="sec-sub reveal">We combine technical excellence with strategic thinking to deliver solutions that truly make a difference.</p>
    </div>
    <div class="choose-grid reveal">
      <div class="choose-card">
        <div class="choose-icon">👨‍💻</div>
        <div class="choose-title">Expert Development Team</div>
        <p class="choose-desc">Senior engineers with deep expertise in React, Next.js, Flutter, Node.js, and cloud infrastructure.</p>
      </div>
      <div class="choose-card">
        <div class="choose-icon">⚡</div>
        <div class="choose-title">Fast Delivery</div>
        <p class="choose-desc">Agile methodology and proven processes mean your project goes live in weeks, not months.</p>
      </div>
      <div class="choose-card">
        <div class="choose-icon">🎯</div>
        <div class="choose-title">Dedicated Team</div>
        <p class="choose-desc">A named project manager, designer, and development team assigned exclusively to your project.</p>
      </div>
      <div class="choose-card">
        <div class="choose-icon">🌍</div>
        <div class="choose-title">Global Experience</div>
        <p class="choose-desc">We've delivered projects across 15+ countries for startups, SMBs, and enterprise clients.</p>
      </div>
      <div class="choose-card">
        <div class="choose-icon">🔧</div>
        <div class="choose-title">Ongoing Support</div>
        <p class="choose-desc">Post-launch support, maintenance, and optimization to keep your product running at peak performance.</p>
      </div>
      <div class="choose-card">
        <div class="choose-icon">✅</div>
        <div class="choose-title">Quality Guaranteed</div>
        <p class="choose-desc">Rigorous QA testing, code reviews, and security audits ensure enterprise-grade quality on every project.</p>
      </div>
    </div>
  </div>
</section>

<!-- HOW IT WORKS -->
<section class="section section-alt" id="process">
  <div class="container">
    <div class="sec-header-centered">
      <div class="sec-label reveal">How It Works</div>
      <div class="sec-title reveal">From Idea to Launch in 5 Steps</div>
      <p class="sec-sub reveal">Our proven process ensures your project is delivered on time, on budget, and beyond expectations.</p>
    </div>
    <div class="steps-wrap reveal">
      <div class="steps-line"><div class="steps-line-fill"></div></div>
      <div class="steps-grid">
        <div class="step-card" style="position:relative">
          <div class="step-num">01</div>
          <div class="step-dot"></div>
          <div class="step-title">Discovery &amp; Strategy</div>
          <p class="step-desc">We dive deep into your business goals, audience, and requirements to craft the perfect plan.</p>
        </div>
        <div class="step-card" style="position:relative">
          <div class="step-num">02</div>
          <div class="step-dot"></div>
          <div class="step-title">Design &amp; Prototype</div>
          <p class="step-desc">Our designers create stunning UI/UX mockups and interactive prototypes for your approval.</p>
        </div>
        <div class="step-card" style="position:relative">
          <div class="step-num">03</div>
          <div class="step-dot"></div>
          <div class="step-title">Development</div>
          <p class="step-desc">Our engineers build your solution using modern tech stacks with agile sprints and regular updates.</p>
        </div>
        <div class="step-card" style="position:relative">
          <div class="step-num">04</div>
          <div class="step-dot"></div>
          <div class="step-title">Testing &amp; QA</div>
          <p class="step-desc">Rigorous testing across devices, browsers, and scenarios to ensure flawless performance.</p>
        </div>
        <div class="step-card" style="position:relative">
          <div class="step-num">05</div>
          <div class="step-dot"></div>
          <div class="step-title">Launch &amp; Growth</div>
          <p class="step-desc">We deploy your project and provide ongoing support, optimization, and marketing to drive growth.</p>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- CASE STUDIES -->
<section class="section" id="cases">
  <div class="container">
    <div class="sec-header-centered">
      <div class="sec-label reveal">Case Studies</div>
      <div class="sec-title reveal">Real Results, Real Impact</div>
      <p class="sec-sub reveal">See how we've helped businesses across industries achieve their digital goals.</p>
    </div>
    <div class="cases-grid reveal">
      <div class="case-card">
        <span class="case-tag">Web Application</span>
        <div class="case-title">E-Commerce Platform for Fashion Brand</div>
        <p class="case-desc">Built a custom e-commerce platform with inventory management, payment processing, and analytics dashboard.</p>
        <div class="case-stats">
          <div class="case-stat">
            <div class="case-stat-val">+240%</div>
            <div class="case-stat-label">Revenue Increase</div>
          </div>
          <div class="case-stat">
            <div class="case-stat-val">0.8s</div>
            <div class="case-stat-label">Page Load Time</div>
          </div>
          <div class="case-stat">
            <div class="case-stat-val">+85%</div>
            <div class="case-stat-label">Conversion Rate</div>
          </div>
        </div>
      </div>
      <div class="case-card">
        <span class="case-tag">Mobile App</span>
        <div class="case-title">Fitness Tracking App with Social Features</div>
        <p class="case-desc">Developed a cross-platform mobile app with workout tracking, social challenges, and real-time leaderboards.</p>
        <div class="case-stats">
          <div class="case-stat">
            <div class="case-stat-val">50K+</div>
            <div class="case-stat-label">Downloads</div>
          </div>
          <div class="case-stat">
            <div class="case-stat-val">78%</div>
            <div class="case-stat-label">User Retention</div>
          </div>
          <div class="case-stat">
            <div class="case-stat-val">4.8/5</div>
            <div class="case-stat-label">App Rating</div>
          </div>
        </div>
      </div>
      <div class="case-card">
        <span class="case-tag">Digital Marketing</span>
        <div class="case-title">SaaS Lead Generation Campaign</div>
        <p class="case-desc">Executed a full-funnel marketing strategy including SEO, paid ads, and content marketing for a B2B SaaS company.</p>
        <div class="case-stats">
          <div class="case-stat">
            <div class="case-stat-val">+320%</div>
            <div class="case-stat-label">Organic Traffic</div>
          </div>
          <div class="case-stat">
            <div class="case-stat-val">+180%</div>
            <div class="case-stat-label">Qualified Leads</div>
          </div>
          <div class="case-stat">
            <div class="case-stat-val">-45%</div>
            <div class="case-stat-label">Cost Per Lead</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- TESTIMONIALS -->
<section class="section" id="testimonials">
  <div class="container">
    <div class="sec-header-centered">
      <div class="sec-label reveal">Testimonials</div>
      <div class="sec-title reveal">What Our Clients Say</div>
      <p class="sec-sub reveal">Don't just take our word for it — hear from the businesses we've helped grow.</p>
    </div>
  </div>
  <div class="testimonials-track-wrap" style="margin-top:48px">
    <div class="testimonials-track">
      <div class="testimonial-card">
        <div class="testimonial-stars">
          <span class="testimonial-star lit">★</span>
          <span class="testimonial-star lit">★</span>
          <span class="testimonial-star lit">★</span>
          <span class="testimonial-star lit">★</span>
          <span class="testimonial-star lit">★</span>
        </div>
        <p class="testimonial-quote">"SetupFX24 built our entire e-commerce platform from scratch. The team delivered ahead of schedule, and our online revenue has grown 3x since launch. Their technical expertise and communication are outstanding."</p>
        <div class="testimonial-author">
          <div class="testimonial-name">Sarah Mitchell</div>
          <div class="testimonial-role">CEO — Fashion Forward · E-Commerce · United States</div>
        </div>
      </div>
      <div class="testimonial-card">
        <div class="testimonial-stars">
          <span class="testimonial-star lit">★</span>
          <span class="testimonial-star lit">★</span>
          <span class="testimonial-star lit">★</span>
          <span class="testimonial-star lit">★</span>
          <span class="testimonial-star lit">★</span>
        </div>
        <p class="testimonial-quote">"We hired SetupFX24 for SEO and paid advertising. Within 6 months, our organic traffic increased by 280% and our cost per acquisition dropped by 40%. They truly understand digital growth."</p>
        <div class="testimonial-author">
          <div class="testimonial-name">James Chen</div>
          <div class="testimonial-role">Marketing Director — SaaS Company · Singapore</div>
        </div>
      </div>
      <div class="testimonial-card">
        <div class="testimonial-stars">
          <span class="testimonial-star lit">★</span>
          <span class="testimonial-star lit">★</span>
          <span class="testimonial-star lit">★</span>
          <span class="testimonial-star lit">★</span>
          <span class="testimonial-star lit">★</span>
        </div>
        <p class="testimonial-quote">"The mobile app they developed for us has a 4.9-star rating with over 50K downloads. SetupFX24 didn't just build an app — they built a product that our users love. Highly recommended."</p>
        <div class="testimonial-author">
          <div class="testimonial-name">Priya Sharma</div>
          <div class="testimonial-role">Founder &amp; CTO — Health &amp; Fitness · India</div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- CTA -->
<section class="cta-section" id="contact">
  <div class="cta-box reveal">
    <div class="cta-bg-light l1"></div>
    <div class="cta-bg-light l2"></div>
    <div class="cta-inner">
      <div class="cta-title">Ready to Build, Scale &amp;<br>Grow Your Business?</div>
      <p class="cta-sub">Get a free consultation and custom proposal tailored to your business needs. Our team will walk you through every solution.</p>
      <div class="cta-btns">
        <a href="#" class="btn-white">Get Free Consultation</a>
        <a href="/pricing" class="btn-outline-white">View Pricing</a>
      </div>
    </div>
  </div>
</section>

<!-- FOOTER -->
`;

export default function HomePage() {
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
    const loadCDN = (src) => new Promise((resolve) => {
      if (document.querySelector('script[src="' + src + '"]')) { resolve(); return; }
      const s = document.createElement('script'); s.src = src; s.onload = resolve;
      s.onerror = resolve; // don't block if CDN fails
      document.body.appendChild(s); scripts.push(s);
    });
    // Load p5.js CDN then init forcefield from bundled code
    loadCDN('https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.9.4/p5.min.js')
      .then(() => { setTimeout(initForceField, 100); });
    // Load GSAP CDN then init text glitch from bundled code
    loadCDN('https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js')
      .then(() => { setTimeout(initTextGlitch, 100); });
    return () => scripts.forEach(s => { try { s.remove(); } catch(e){} });
  }, []);
  return (
    <SiteLayout>
      <div ref={contentRef} dangerouslySetInnerHTML={{ __html: htmlContent }} />
    </SiteLayout>
  );
}

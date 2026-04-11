import { useEffect, useRef } from 'react';
import SiteLayout from '../SiteLayout';
import { initForceField, initTextGlitch } from '../heroEffects';

const htmlContent = `
<!-- PAGE HERO -->
<section class="hero-forcefield-wrap" style="position:relative;width:100%;height:100vh;overflow:visible;background:#000">
  <div id="hero-forcefield" style="position:absolute;inset:0;width:100%;height:100%;z-index:0"></div>
  <div class="hero-glitch-content">
    <div class="hero-glitch-lines">
      <h1 class="text-glitch" data-text="DIGITAL MARKETING" data-hover="DATA DRIVEN" data-delay="0">DIGITAL MARKETING</h1>
      <h1 class="text-glitch" data-text="GROW YOUR" data-hover="SCALE YOUR" data-delay="0.15">GROW YOUR</h1>
      <h1 class="text-glitch" data-text="BUSINESS ONLINE" data-hover="BRAND ONLINE" data-delay="0.3">BUSINESS ONLINE</h1>
    </div>
    <p style="font-family:'Inter',sans-serif;font-size:15px;color:rgba(255,255,255,0.5);margin-top:16px;position:relative;z-index:10;max-width:560px;line-height:1.8">Data-driven marketing strategies that attract, engage, and convert your ideal customers.</p>
    <div class="hero-glitch-cta" style="pointer-events:auto">
      <button class="btn-shimmer" onclick="location.href='contact.html'"><i class="fa-solid fa-chart-line"></i>Get Free Consultation</button>
      <button class="btn-hero-ghost" onclick="location.href='services.html'">View Services<span class="btn-icon"><i class="fa-solid fa-arrow-right"></i></span></button>
    </div>
  </div>
</section>

<!-- SECTION 1 — MARKETING STRATEGY -->
<section class="dm-service-section dm-service-section--dark" id="strategy">
  <div class="container">
    <div class="dm-service-grid">
      <div class="dm-service-left reveal">
        <div class="sec-label">01 — Strategy</div>
        <h2>Data-Driven Marketing Strategy</h2>
        <p>Every successful marketing campaign starts with a solid strategy. We analyze your market, competitors, and audience to create data-driven plans that maximize your marketing ROI and drive sustainable growth.</p>
        <ul class="dm-list">
          <li>Market research &amp; competitor analysis</li>
          <li>Target audience identification</li>
          <li>Multi-channel marketing plans</li>
          <li>KPI setting &amp; performance tracking</li>
          <li>Budget optimization &amp; ROI analysis</li>
          <li>Quarterly strategy reviews &amp; adjustments</li>
        </ul>
        <div>
          <a href="/contact" class="btn-white">Get Free Consultation</a>
        </div>
      </div>
      <div class="dm-service-right reveal">
        <div class="dm-mini-cards">
          <div class="dm-mini-card">
            <div class="dm-mini-card-title">Market Analysis</div>
            <div class="dm-mini-card-desc">Deep dive into your industry and competition</div>
          </div>
          <div class="dm-mini-card">
            <div class="dm-mini-card-title">Audience Mapping</div>
            <div class="dm-mini-card-desc">Identify and segment your ideal customers</div>
          </div>
          <div class="dm-mini-card">
            <div class="dm-mini-card-title">Channel Strategy</div>
            <div class="dm-mini-card-desc">Select the right platforms for maximum impact</div>
          </div>
          <div class="dm-mini-card">
            <div class="dm-mini-card-title">Performance Framework</div>
            <div class="dm-mini-card-desc">Set measurable goals and tracking systems</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- SECTION 2 — SEO -->
<section class="dm-service-section dm-service-section--darker" id="seo">
  <div class="container">
    <div class="dm-service-grid">
      <div class="dm-service-left reveal">
        <div class="sec-label">02 — SEO</div>
        <h2>Dominate Search Results</h2>
        <p>Our SEO experts use white-hat techniques and data-driven approaches to improve your search engine rankings. We focus on sustainable, long-term results that drive consistent organic traffic.</p>
        <ul class="dm-list">
          <li>Technical SEO audits &amp; optimization</li>
          <li>Keyword research &amp; content strategy</li>
          <li>On-page &amp; off-page SEO</li>
          <li>Local SEO &amp; Google Business Profile</li>
          <li>Link building &amp; authority development</li>
          <li>Monthly reporting &amp; rank tracking</li>
        </ul>
        <div>
          <a href="/contact" class="btn-white">Get SEO Audit</a>
        </div>
      </div>
      <div class="dm-service-right reveal">
        <div class="dm-mini-cards">
          <div class="dm-mini-card">
            <div class="dm-mini-card-title">Technical SEO</div>
            <div class="dm-mini-card-desc">Site speed, crawlability, indexing</div>
          </div>
          <div class="dm-mini-card">
            <div class="dm-mini-card-title">Content SEO</div>
            <div class="dm-mini-card-desc">Keyword-optimized content that ranks</div>
          </div>
          <div class="dm-mini-card">
            <div class="dm-mini-card-title">Local SEO</div>
            <div class="dm-mini-card-desc">Dominate local search in your area</div>
          </div>
          <div class="dm-mini-card">
            <div class="dm-mini-card-title">Link Building</div>
            <div class="dm-mini-card-desc">High-quality backlinks from authoritative sources</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- SECTION 3 — PAID ADVERTISING -->
<section class="dm-service-section dm-service-section--dark" id="paid-ads">
  <div class="container">
    <div class="dm-service-grid">
      <div class="dm-service-left reveal">
        <div class="sec-label">03 — Paid Ads</div>
        <h2>Performance-Driven Advertising</h2>
        <p>We create targeted ad campaigns that reach the right audience at the right time. Our data-driven approach ensures every dollar of your ad spend works harder, delivering measurable results and maximum ROI.</p>
        <ul class="dm-list">
          <li>Google Ads (Search, Display, Shopping)</li>
          <li>Facebook &amp; Instagram Ads</li>
          <li>LinkedIn Ads for B2B</li>
          <li>Retargeting &amp; remarketing campaigns</li>
          <li>A/B testing &amp; conversion optimization</li>
          <li>Detailed ROI reporting &amp; analytics</li>
        </ul>
        <div>
          <a href="/contact" class="btn-white">Start Advertising</a>
        </div>
      </div>
      <div class="dm-service-right reveal">
        <div class="dm-mini-cards">
          <div class="dm-mini-card">
            <div class="dm-mini-card-title">Google Ads</div>
            <div class="dm-mini-card-desc">Search, display, shopping campaigns</div>
          </div>
          <div class="dm-mini-card">
            <div class="dm-mini-card-title">Meta Ads</div>
            <div class="dm-mini-card-desc">Facebook &amp; Instagram advertising</div>
          </div>
          <div class="dm-mini-card">
            <div class="dm-mini-card-title">LinkedIn Ads</div>
            <div class="dm-mini-card-desc">B2B lead generation campaigns</div>
          </div>
          <div class="dm-mini-card">
            <div class="dm-mini-card-title">YouTube Ads</div>
            <div class="dm-mini-card-desc">Video advertising for brand awareness</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- SECTION 4 — SOCIAL MEDIA -->
<section class="dm-service-section dm-service-section--darker" id="social-media">
  <div class="container">
    <div style="margin-bottom:40px;display:grid;grid-template-columns:repeat(3,1fr);gap:8px" class="reveal">
      <div style="border:0.5px solid rgba(255,255,255,0.1);overflow:hidden"><img src="/landing/img/site/t2.jpg" alt="Social Media" style="width:100%;display:block;opacity:0.85;aspect-ratio:16/9;object-fit:cover" /></div>
      <div style="border:0.5px solid rgba(255,255,255,0.1);overflow:hidden"><img src="/landing/img/site/t3.jpg" alt="Content Creation" style="width:100%;display:block;opacity:0.85;aspect-ratio:16/9;object-fit:cover" /></div>
      <div style="border:0.5px solid rgba(255,255,255,0.1);overflow:hidden"><img src="/landing/img/site/t4.jpg" alt="Brand Marketing" style="width:100%;display:block;opacity:0.85;aspect-ratio:16/9;object-fit:cover" /></div>
    </div>
    <div class="dm-service-grid">
      <div class="dm-service-left reveal">
        <div class="sec-label">04 — Social Media</div>
        <h2>Social Media Excellence</h2>
        <p>We help brands build authentic connections with their audience through strategic social media management. From content creation to community engagement, we handle every aspect of your social presence.</p>
        <ul class="dm-list">
          <li>Social media strategy &amp; planning</li>
          <li>Content creation &amp; scheduling</li>
          <li>Community management &amp; engagement</li>
          <li>Influencer marketing partnerships</li>
          <li>Social media analytics &amp; reporting</li>
          <li>Brand reputation management</li>
        </ul>
        <div>
          <a href="/contact" class="btn-white">Grow My Social</a>
        </div>
      </div>
      <div class="dm-service-right reveal">
        <div class="dm-mini-cards">
          <div class="dm-mini-card">
            <div class="dm-mini-card-title">Instagram</div>
            <div class="dm-mini-card-desc">Visual storytelling and brand building</div>
          </div>
          <div class="dm-mini-card">
            <div class="dm-mini-card-title">LinkedIn</div>
            <div class="dm-mini-card-desc">Professional networking and B2B</div>
          </div>
          <div class="dm-mini-card">
            <div class="dm-mini-card-title">Facebook</div>
            <div class="dm-mini-card-desc">Community building and audience growth</div>
          </div>
          <div class="dm-mini-card">
            <div class="dm-mini-card-title">Twitter / X</div>
            <div class="dm-mini-card-desc">Real-time engagement and thought leadership</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- SECTION 5 — CONTENT MARKETING -->
<section class="dm-service-section dm-service-section--dark" id="content">
  <div class="container">
    <div class="dm-service-grid">
      <div class="dm-service-left reveal">
        <div class="sec-label">05 — Content</div>
        <h2>Content That Converts</h2>
        <p>Great content is the foundation of digital marketing success. We create compelling, SEO-optimized content that positions your brand as an industry authority and drives organic traffic and conversions.</p>
        <ul class="dm-list">
          <li>Content strategy &amp; editorial planning</li>
          <li>Blog writing &amp; article creation</li>
          <li>Video content production</li>
          <li>Email marketing campaigns</li>
          <li>Infographics &amp; visual content</li>
          <li>Content performance analytics</li>
        </ul>
        <div>
          <a href="/contact" class="btn-white">Start Content Plan</a>
        </div>
      </div>
      <div class="dm-service-right reveal">
        <div class="dm-mini-cards">
          <div class="dm-mini-card">
            <div class="dm-mini-card-title">Blog Posts</div>
            <div class="dm-mini-card-desc">SEO-optimized articles that rank</div>
          </div>
          <div class="dm-mini-card">
            <div class="dm-mini-card-title">Case Studies</div>
            <div class="dm-mini-card-desc">Showcase success stories and results</div>
          </div>
          <div class="dm-mini-card">
            <div class="dm-mini-card-title">Email Campaigns</div>
            <div class="dm-mini-card-desc">Nurture leads with targeted sequences</div>
          </div>
          <div class="dm-mini-card">
            <div class="dm-mini-card-title">Video Content</div>
            <div class="dm-mini-card-desc">Engaging videos for social and web</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- PRICING -->
<section class="dm-pricing-section" id="packages">
  <div class="container">
    <div class="sec-header-centered">
      <div class="sec-label reveal">Marketing Packages</div>
      <div class="sec-title reveal">Simple, Transparent Pricing</div>
    </div>
    <div class="pricing-grid reveal" style="margin-top:48px">

      <!-- Starter -->
      <div class="price-card">
        <div class="price-tier">Starter</div>
        <div class="price-amount"><span class="price-currency">&#8377;</span>50,000</div>
        <div class="price-per">/ per month</div>
        <p class="price-desc">Perfect for businesses starting their digital marketing journey. Daily ad budget paid separately by client.</p>
        <ul class="price-features">
          <li>Custom graphics &amp; creatives</li>
          <li>Social media post design</li>
          <li>Monthly content calendar</li>
          <li>Basic campaign setup</li>
          <li>Performance report</li>
          <li>Daily ad budget paid by client</li>
        </ul>
        <a href="/contact" class="price-btn price-btn-outline">Get Started</a>
      </div>

      <!-- Growth (featured) -->
      <div class="price-card featured">
        <div class="price-tier">Growth <span class="popular-badge">Most_Popular</span></div>
        <div class="price-amount"><span class="price-currency">&#8377;</span>1,00,000</div>
        <div class="price-per">/ per month</div>
        <p class="price-desc">For brands ready to scale. Includes influencer collaborations, video production, and model shoots. Daily ad budget paid by client.</p>
        <ul class="price-features">
          <li>Everything in Starter</li>
          <li>Influencer marketing campaigns</li>
          <li>Model shoots &amp; brand videos</li>
          <li>Reels &amp; short-form video content</li>
          <li>Google Ads + Meta Ads management</li>
          <li>Multi-platform ad accounts</li>
          <li>Daily ad budget paid by client</li>
        </ul>
        <a href="/contact" class="price-btn price-btn-filled">Choose Growth</a>
      </div>

      <!-- Premium -->
      <div class="price-card">
        <div class="price-tier">Premium</div>
        <div class="price-amount"><span class="price-currency">&#8377;</span>1,30,000</div>
        <div class="price-per">/ per month</div>
        <p class="price-desc">Full-scale brand marketing with professional shoots, multiple ad accounts, and daily social media management.</p>
        <ul class="price-features">
          <li>Everything in Growth</li>
          <li>Professional ad shoot production</li>
          <li>Multiple ad accounts management</li>
          <li>Daily social media handling</li>
          <li>Brand graphics &amp; identity system</li>
          <li>Full account management</li>
          <li>Priority support &amp; strategy calls</li>
        </ul>
        <a href="/contact" class="price-btn price-btn-outline">Contact Us</a>
      </div>

    </div>
    <p class="dm-pricing-note">Daily advertising budget (Google, Meta, etc.) is paid directly by the client and not included in the above packages.</p>
  </div>
</section>

<!-- CTA -->
<section class="cta-section">
  <div class="cta-box reveal">
    <div class="cta-bg-light l1"></div>
    <div class="cta-bg-light l2"></div>
    <div class="cta-inner">
      <div class="cta-title">Ready to Grow<br>Your Business?</div>
      <p class="cta-sub">Let's build a data-driven marketing strategy that attracts customers and drives real growth. Book a free consultation today.</p>
      <div class="cta-btns">
        <a href="/contact" class="btn-white">Get Free Consultation</a>
        <a href="/pricing" class="btn-outline-white">View Pricing</a>
      </div>
    </div>
  </div>
</section>

<!-- FOOTER -->
`;

export default function DigitalMarketingPage() {
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

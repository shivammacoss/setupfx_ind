import { useEffect, useRef } from 'react';
import SiteLayout from '../SiteLayout';

const htmlContent = `
<!-- PAGE HERO -->
<section class="hero-forcefield-wrap" style="position:relative;width:100%;height:100vh;overflow:visible;background:#000">
  <div id="hero-forcefield" style="position:absolute;inset:0;width:100%;height:100%;z-index:0"></div>
  <div class="hero-glitch-content">
    <div class="hero-glitch-lines">
      <h1 class="text-glitch" data-text="BROKERAGE SOLUTIONS" data-hover="SETUPFX24" data-delay="0">BROKERAGE SOLUTIONS</h1>
      <h1 class="text-glitch" data-text="PLATFORM" data-hover="COMPLETE" data-delay="0.15">PLATFORM</h1>
      <h1 class="text-glitch" data-text="PRICING" data-hover="TRANSPARENT" data-delay="0.3">PRICING</h1>
    </div>
    <p style="font-family:'Inter',sans-serif;font-size:15px;color:rgba(255,255,255,0.5);margin-top:16px;position:relative;z-index:10;max-width:560px;line-height:1.8">Complete brokerage solutions with trading platforms, IB systems, and more.</p>
    <div class="hero-glitch-cta" style="pointer-events:auto">
      <button class="btn-shimmer" onclick="location.href='contact.html'"><i class="fa-solid fa-rocket"></i>Get Started</button>
      <button class="btn-hero-ghost" onclick="location.href='solutions.html'">View Solutions<span class="btn-icon"><i class="fa-solid fa-arrow-right"></i></span></button>
    </div>
  </div>
</section>

<!-- BROKERAGE PRICING -->
<section class="brokerage-pricing-section" id="plans">
  <div class="container">
    <div class="sec-header-centered">
      <div class="sec-label reveal">Brokerage Packages</div>
      <div class="sec-title reveal">Choose Your Plan</div>
      <p class="sec-sub reveal">Select the package that fits your brokerage model. All plans include company incorporation support.</p>
    </div>
    <div class="pricing-grid reveal" style="margin-top:48px">

      <!-- Managed System -->
      <div class="price-card">
        <div class="price-tier">
          <span style="font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:0.4em;text-transform:uppercase;color:rgba(255,255,255,0.5);font-weight:400">Managed_System</span>
        </div>
        <div class="price-amount"><span class="price-currency">&#8377;</span>7,00,000</div>
        <div class="price-onetime">ONE-TIME PAYMENT</div>
        <div class="price-monthly">+ &#8377;25,000 / Month Maintenance</div>
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
        <div class="price-onetime">ONE-TIME PAYMENT</div>
        <div class="price-monthly">Full Source Code Access</div>
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
        <div class="price-onetime">ONE-TIME SETUP</div>
        <div class="price-monthly">+ &#8377;50,000 / Month Rental</div>
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
    <p class="pricing-note">All packages include company incorporation support for UK, USA, and Canada.<br>Prices are exclusive of applicable taxes.</p>
  </div>
</section>

<!-- WHAT'S INCLUDED IN ALL PLANS -->
<section class="included-section" id="included">
  <div class="container">
    <div class="sec-header-centered">
      <div class="sec-label reveal">All Plans Include</div>
      <div class="sec-title reveal">What's Included in All Plans</div>
    </div>
    <div class="included-strip reveal">
      <div class="included-item">
        <div class="included-item-title">Trading Terminals</div>
        <div class="included-item-desc">Web + mobile trading platforms</div>
      </div>
      <div class="included-item">
        <div class="included-item-title">IB System</div>
        <div class="included-item-desc">Multi-level introducing broker management</div>
      </div>
      <div class="included-item">
        <div class="included-item-title">CRM &amp; Back Office</div>
        <div class="included-item-desc">Complete client &amp; operations management</div>
      </div>
      <div class="included-item">
        <div class="included-item-title">24/7 Support</div>
        <div class="included-item-desc">Dedicated team always available</div>
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
      <div class="cta-title">Ready to Launch<br>Your Brokerage?</div>
      <p class="cta-sub">Get in touch and we'll walk you through the best solution for your business model. Free consultation, no commitment.</p>
      <div class="cta-btns">
        <a href="/contact" class="btn-white">Get Free Consultation</a>
        <a href="/white-label" class="btn-outline-white">Explore White Label</a>
      </div>
    </div>
  </div>
</section>

<!-- FOOTER -->
`;

export default function PricingPage() {
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

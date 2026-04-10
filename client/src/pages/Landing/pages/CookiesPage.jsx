import { useEffect, useRef } from 'react';
import SiteLayout from '../SiteLayout';
import { initForceField, initTextGlitch } from '../heroEffects';

const htmlContent = `
<section class="hero-forcefield-wrap" style="position:relative;width:100%;height:60vh;min-height:400px;overflow:hidden;background:#000">
  <div id="hero-forcefield" style="position:absolute;inset:0;width:100%;height:100%;z-index:0"></div>
  <div class="hero-glitch-content">
    <div class="hero-glitch-lines">
      <h1 class="text-glitch" data-text="COOKIE" data-hover="TRACKING" data-delay="0">COOKIE</h1>
      <h1 class="text-glitch" data-text="POLICY" data-hover="SETTINGS" data-delay="0.15">POLICY</h1>
    </div>
  </div>
</section>

<section class="section">
<div class="container">
<div class="legal-content reveal">
<div class="legal-date">Last Updated: January 1, 2026</div>

<p>This Cookie Policy explains how SetupFX Softtech (OPC) Private Limited ("SetupFX24") uses cookies and similar tracking technologies when you visit our website. By continuing to use our website, you consent to the use of cookies as described in this policy.</p>

<h3>What Are Cookies</h3>
<p>Cookies are small text files that are placed on your device (computer, smartphone, or tablet) when you visit a website. They are widely used to make websites work more efficiently, provide a better user experience, and give website owners useful information about how their site is being used.</p>

<h3>Types of Cookies We Use</h3>

<p><strong>Essential Cookies</strong></p>
<p>These cookies are necessary for the website to function properly. They enable basic features like page navigation, access to secure areas, and form submissions. The website cannot function properly without these cookies. They do not collect personal information and cannot be disabled.</p>

<p><strong>Analytics Cookies</strong></p>
<p>We use analytics cookies (including Google Analytics) to understand how visitors interact with our website. These cookies collect information about pages visited, time spent on the site, bounce rates, and traffic sources. This data helps us improve our website's performance and content. All data is collected anonymously and aggregated.</p>

<p><strong>Functional Cookies</strong></p>
<p>Functional cookies allow the website to remember choices you make (such as your preferred language or region) and provide enhanced, personalized features. They may also be used to remember changes you have made to text size, fonts, and other customizable elements.</p>

<p><strong>Marketing Cookies</strong></p>
<p>These cookies track your browsing activity across websites to deliver targeted advertisements relevant to your interests. They are set by third-party advertising platforms (such as Google Ads and Meta Pixel) and help us measure the effectiveness of our marketing campaigns.</p>

<h3>Third-Party Cookies</h3>
<p>Some cookies on our website are set by third-party services, including:</p>
<ul>
<li>Google Analytics — Website traffic analysis and visitor behavior</li>
<li>Google Ads — Conversion tracking and remarketing</li>
<li>Meta Pixel — Facebook and Instagram ad campaign tracking</li>
<li>LinkedIn Insight Tag — Professional audience analytics</li>
<li>Hotjar — Heatmap and user session recording (anonymized)</li>
</ul>

<h3>Managing Cookies</h3>
<p>You can control and manage cookies in several ways:</p>
<ul>
<li><strong>Browser settings</strong> — Most browsers allow you to refuse or delete cookies through settings. Note that disabling essential cookies may affect website functionality.</li>
<li><strong>Opt-out links</strong> — Google Analytics opt-out: tools.google.com/dlpage/gaoptout. Facebook ad preferences: facebook.com/ads/preferences.</li>
<li><strong>Do Not Track</strong> — We respect browser Do Not Track (DNT) signals where technically feasible.</li>
</ul>

<h3>Cookie Retention</h3>
<p>Session cookies are deleted when you close your browser. Persistent cookies remain on your device for a set period (typically 30 days to 2 years) or until you delete them manually. Analytics cookies are retained for 26 months by default.</p>

<h3>Updates to This Policy</h3>
<p>We may update this Cookie Policy periodically to reflect changes in technology, legislation, or our business practices. Changes will be posted on this page with an updated date.</p>

<h3>Contact</h3>
<p>For questions about our use of cookies:</p>
<ul>
<li>Email: setupfx24@gmail.com</li>
<li>WhatsApp: +1 (908) 228-0305</li>
<li>Address: Office 9364hn 3 Fitzroy Place, Glasgow, G3 7RH, United Kingdom</li>
</ul>
</div>
</div>
</section>
`;

export default function CookiesPage() {
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

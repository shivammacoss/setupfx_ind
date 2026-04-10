import { useEffect, useRef } from 'react';
import SiteLayout from '../SiteLayout';
import { initForceField, initTextGlitch } from '../heroEffects';

const htmlContent = `
<section class="hero-forcefield-wrap" style="position:relative;width:100%;height:60vh;min-height:400px;overflow:hidden;background:#000">
  <div id="hero-forcefield" style="position:absolute;inset:0;width:100%;height:100%;z-index:0"></div>
  <div class="hero-glitch-content">
    <div class="hero-glitch-lines">
      <h1 class="text-glitch" data-text="PRIVACY" data-hover="YOUR DATA" data-delay="0">PRIVACY</h1>
      <h1 class="text-glitch" data-text="POLICY" data-hover="PROTECTED" data-delay="0.15">POLICY</h1>
    </div>
  </div>
</section>

<section class="section">
<div class="container">
<div class="legal-content reveal">
<div class="legal-date">Last Updated: January 1, 2026</div>

<p>SetupFX Softtech (OPC) Private Limited ("SetupFX24", "we", "us", or "our") is committed to protecting the privacy and security of your personal information. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our website or use our services.</p>

<h3>Information We Collect</h3>
<p>We collect information that you provide directly to us, including:</p>
<ul>
<li>Name, email address, phone number, and company information when you contact us or fill out forms</li>
<li>Billing and payment information when you purchase our services</li>
<li>Communications and correspondence you send to us</li>
<li>Information you provide when participating in surveys or promotions</li>
</ul>

<p>We also automatically collect certain information when you visit our website:</p>
<ul>
<li>IP address, browser type, operating system, and device information</li>
<li>Pages visited, time spent on pages, and navigation patterns</li>
<li>Referring website addresses and search terms used to find our site</li>
<li>Cookies and similar tracking technologies (see our Cookie Policy)</li>
</ul>

<h3>How We Use Your Information</h3>
<p>We use the information we collect to:</p>
<ul>
<li>Provide, maintain, and improve our services</li>
<li>Process transactions and send related information</li>
<li>Send you technical notices, updates, and support messages</li>
<li>Respond to your comments, questions, and customer service requests</li>
<li>Communicate about products, services, offers, and events</li>
<li>Monitor and analyze trends, usage, and activities</li>
<li>Detect, investigate, and prevent fraudulent transactions and abuse</li>
<li>Comply with legal obligations and enforce our agreements</li>
</ul>

<h3>Information Sharing</h3>
<p>We do not sell, trade, or rent your personal information to third parties. We may share your information with:</p>
<ul>
<li>Service providers who assist in operating our website and delivering services</li>
<li>Professional advisors including lawyers, auditors, and insurers</li>
<li>Law enforcement or government authorities when required by law</li>
<li>Business partners with your explicit consent</li>
</ul>

<h3>Data Security</h3>
<p>We implement appropriate technical and organizational security measures to protect your personal information, including encryption in transit (TLS/SSL) and at rest, access controls, regular security assessments, and employee training. However, no method of transmission over the internet is 100% secure, and we cannot guarantee absolute security.</p>

<h3>Data Retention</h3>
<p>We retain your personal information for as long as necessary to fulfill the purposes outlined in this policy, unless a longer retention period is required by law. When we no longer need your information, we securely delete or anonymize it.</p>

<h3>Your Rights</h3>
<p>Depending on your jurisdiction, you may have the right to:</p>
<ul>
<li>Access the personal information we hold about you</li>
<li>Request correction of inaccurate information</li>
<li>Request deletion of your personal information</li>
<li>Object to or restrict processing of your information</li>
<li>Request data portability</li>
<li>Withdraw consent at any time</li>
</ul>

<h3>International Data Transfers</h3>
<p>Your information may be transferred to and processed in countries other than your country of residence. We ensure appropriate safeguards are in place for international transfers in compliance with applicable data protection laws including GDPR.</p>

<h3>Children's Privacy</h3>
<p>Our services are not directed to individuals under the age of 18. We do not knowingly collect personal information from children. If we become aware that we have collected information from a child, we will take steps to delete it.</p>

<h3>Changes to This Policy</h3>
<p>We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new policy on this page and updating the "Last Updated" date. We encourage you to review this policy periodically.</p>

<h3>Contact Us</h3>
<p>If you have questions about this Privacy Policy, please contact us at:</p>
<ul>
<li>Email: setupfx24@gmail.com</li>
<li>WhatsApp: +1 (908) 228-0305</li>
<li>Address: Office 9364hn 3 Fitzroy Place, Glasgow, G3 7RH, United Kingdom</li>
</ul>
</div>
</div>
</section>
`;

export default function PrivacyPage() {
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

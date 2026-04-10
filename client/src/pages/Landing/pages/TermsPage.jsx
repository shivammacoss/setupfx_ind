import { useEffect, useRef } from 'react';
import SiteLayout from '../SiteLayout';
import { initForceField, initTextGlitch } from '../heroEffects';

const htmlContent = `
<section class="hero-forcefield-wrap" style="position:relative;width:100%;height:60vh;min-height:400px;overflow:hidden;background:#000">
  <div id="hero-forcefield" style="position:absolute;inset:0;width:100%;height:100%;z-index:0"></div>
  <div class="hero-glitch-content">
    <div class="hero-glitch-lines">
      <h1 class="text-glitch" data-text="TERMS OF" data-hover="LEGAL" data-delay="0">TERMS OF</h1>
      <h1 class="text-glitch" data-text="SERVICE" data-hover="AGREEMENT" data-delay="0.15">SERVICE</h1>
    </div>
  </div>
</section>

<section class="section">
<div class="container">
<div class="legal-content reveal">
<div class="legal-date">Last Updated: January 1, 2026</div>

<p>These Terms of Service ("Terms") govern your access to and use of the services, software, and products provided by SetupFX Softtech (OPC) Private Limited ("SetupFX24", "we", "us"). By accessing or using our services, you agree to be bound by these Terms.</p>

<h3>Services</h3>
<p>SetupFX24 provides custom software development, web and mobile application development, digital marketing services, trading platform solutions, and related consulting services. The specific scope of services will be defined in individual project agreements, statements of work, or service contracts between you and SetupFX24.</p>

<h3>Client Obligations</h3>
<ul>
<li>Provide accurate and complete information required for project execution</li>
<li>Respond to communications and approval requests within agreed timeframes</li>
<li>Provide necessary access to systems, accounts, and resources as needed</li>
<li>Ensure all content and materials provided do not infringe third-party rights</li>
<li>Pay all fees according to the agreed payment schedule</li>
</ul>

<h3>Payment Terms</h3>
<p>Payment terms are specified in individual project proposals and contracts. Standard terms require 40% upfront payment before work begins, 30% upon reaching the project midpoint milestone, and 30% upon final delivery and approval. Late payments may incur a charge of 1.5% per month. All prices are exclusive of applicable taxes.</p>

<h3>Intellectual Property</h3>
<p>Upon full payment, clients receive ownership of all custom-developed code, designs, and deliverables as specified in the project agreement. SetupFX24 retains the right to use general knowledge, techniques, and tools developed during the project. We may include your company in our portfolio unless otherwise agreed in writing.</p>

<h3>Confidentiality</h3>
<p>Both parties agree to maintain the confidentiality of proprietary information shared during the engagement. This includes business strategies, technical specifications, customer data, pricing information, and any materials marked as confidential. This obligation survives termination of services for a period of 2 years.</p>

<h3>Warranties &amp; Liability</h3>
<p>We warrant that our services will be performed in a professional and workmanlike manner. All deliverables include a defect warranty period as specified in the project agreement (typically 30-90 days). Our total liability for any claim arising from our services shall not exceed the total fees paid for the specific project in question. We are not liable for indirect, incidental, or consequential damages.</p>

<h3>Service Level Agreements</h3>
<p>For ongoing support and maintenance contracts, service levels are defined in the specific SLA document. Standard response times: P1 Critical — 1 hour, P2 High — 4 hours, P3 Medium — 24 hours, P4 Low — 48 hours. Uptime guarantees of 99.9% apply to hosted services where specified.</p>

<h3>Termination</h3>
<p>Either party may terminate the engagement with 30 days written notice. In case of termination, the client is responsible for payment of all work completed to date. SetupFX24 will deliver all work product completed at the point of termination. Refunds for prepaid services will be calculated on a pro-rata basis.</p>

<h3>Governing Law</h3>
<p>These Terms are governed by and construed in accordance with the laws of the United Kingdom. Any disputes arising under these Terms shall be subject to the exclusive jurisdiction of the courts of Glasgow, Scotland.</p>

<h3>Modifications</h3>
<p>We reserve the right to modify these Terms at any time. Changes will be posted on this page with an updated date. Continued use of our services after changes constitutes acceptance of the modified Terms.</p>

<h3>Contact</h3>
<p>For questions about these Terms:</p>
<ul>
<li>Email: setupfx24@gmail.com</li>
<li>WhatsApp: +1 (908) 228-0305</li>
<li>Address: Office 9364hn 3 Fitzroy Place, Glasgow, G3 7RH, United Kingdom</li>
</ul>
</div>
</div>
</section>
`;

export default function TermsPage() {
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

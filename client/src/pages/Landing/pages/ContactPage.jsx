import { useEffect, useRef } from 'react';
import SiteLayout from '../SiteLayout';
import { initForceField, initTextGlitch } from '../heroEffects';

const htmlContent = `
<section class="hero-forcefield-wrap" style="position:relative;width:100%;height:100vh;overflow:visible;background:#000">
  <div id="hero-forcefield" style="position:absolute;inset:0;width:100%;height:100%;z-index:0"></div>
  <div class="hero-glitch-content">
    <div class="hero-glitch-lines">
      <h1 class="text-glitch" data-text="GET IN TOUCH" data-hover="LET'S TALK" data-delay="0">GET IN TOUCH</h1>
      <h1 class="text-glitch" data-text="CONTACT" data-hover="REACH OUT" data-delay="0.15">CONTACT</h1>
      <h1 class="text-glitch" data-text="US" data-hover="NOW" data-delay="0.3">US</h1>
    </div>
    <p style="font-family:'Inter',sans-serif;font-size:15px;color:rgba(255,255,255,0.5);margin-top:16px;position:relative;z-index:10;max-width:560px;line-height:1.8">Have a project in mind? Let's talk. Our team will respond within 24 hours.</p>
    <div class="hero-glitch-cta" style="pointer-events:auto">
      <button class="btn-shimmer" onclick="document.getElementById('contact-form').scrollIntoView({behavior:'smooth'})"><i class="fa-solid fa-envelope"></i>Send Message</button>
      <button class="btn-hero-ghost" onclick="location.href='services.html'">View Services<span class="btn-icon"><i class="fa-solid fa-arrow-right"></i></span></button>
    </div>
  </div>
</section>

<section class="section" id="contact-form">
<div class="container">
<div class="contact-grid reveal">
  <div class="contact-form-wrap">
    <div class="sec-label" style="margin-bottom:24px">Send a Message</div>
    <form action="#" method="POST">
      <div class="form-group"><label class="form-label">Full Name</label><input type="text" class="form-input" placeholder="Your full name" required /></div>
      <div class="form-group"><label class="form-label">Email Address</label><input type="email" class="form-input" placeholder="your@email.com" required /></div>
      <div class="form-group"><label class="form-label">Subject</label><select class="form-select"><option>General Inquiry</option><option>Project Discussion</option><option>Support Request</option><option>Partnership Opportunity</option></select></div>
      <div class="form-group"><label class="form-label">Message</label><textarea class="form-textarea" placeholder="Tell us about your project..." required></textarea></div>
      <button type="submit" class="btn-white" style="width:100%;justify-content:center">Send Message</button>
    </form>
  </div>
  <div class="contact-info-wrap">
    <div class="sec-label" style="margin-bottom:24px">Contact Information</div>
    <div class="info-card"><div class="info-icon"><i class="fa-solid fa-envelope"></i></div><div class="info-label">Email</div><div class="info-value">setupfx24@gmail.com</div></div>
    <div class="info-card"><div class="info-icon"><i class="fa-brands fa-whatsapp"></i></div><div class="info-label">WhatsApp</div><div class="info-value">+1 (908) 228-0305</div></div>
    <div class="info-card"><div class="info-icon"><i class="fa-solid fa-location-dot"></i></div><div class="info-label">Office Address</div><div class="info-value">Office 9364hn 3 Fitzroy Place,<br>Area 1/1, Sauchiehall Street,<br>Glasgow City Centre, G3 7RH, UK</div></div>
    <div class="info-card"><div class="info-icon"><i class="fa-solid fa-clock"></i></div><div class="info-label">Business Hours</div><div class="info-value">Monday – Friday<br>9:00 AM – 6:00 PM GMT</div></div>
  </div>
</div>
</div>
</section>
`;

export default function ContactPage() {
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

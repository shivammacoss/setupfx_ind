import { useEffect, useRef, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './SiteLanding.css';

export default function SiteLanding() {
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [navScrolled, setNavScrolled] = useState(false);
  const forcefieldRef = useRef(null);
  const p5InstanceRef = useRef(null);
  const wrapperRef = useRef(null);

  // --------------------------------------------------
  // Navbar: scroll-based background
  // --------------------------------------------------
  useEffect(() => {
    const handleScroll = () => {
      setNavScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // --------------------------------------------------
  // Mobile menu toggle
  // --------------------------------------------------
  const toggleMobile = useCallback(() => {
    setMobileOpen((prev) => !prev);
  }, []);

  // Close mobile menu when navigating to a section
  const scrollToSection = useCallback((e, id) => {
    e.preventDefault();
    setMobileOpen(false);
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // --------------------------------------------------
  // Scroll reveal (IntersectionObserver)
  // --------------------------------------------------
  useEffect(() => {
    const reveals = wrapperRef.current?.querySelectorAll('.reveal');
    if (!reveals) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('visible');
            observer.unobserve(e.target);
          }
        });
      },
      { threshold: 0.1 }
    );
    reveals.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  // --------------------------------------------------
  // Steps line animation
  // --------------------------------------------------
  useEffect(() => {
    const stepsLine = wrapperRef.current?.querySelector('.steps-line-fill');
    if (!stepsLine) return;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            stepsLine.classList.add('animated');
            obs.unobserve(e.target);
          }
        });
      },
      { threshold: 0.3 }
    );
    obs.observe(stepsLine);
    return () => obs.disconnect();
  }, []);

  // --------------------------------------------------
  // DM Tabs
  // --------------------------------------------------
  const handleDmTabClick = useCallback((e) => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    wrapper.querySelectorAll('.dm-tab').forEach((t) => t.classList.remove('active'));
    e.currentTarget.classList.add('active');
  }, []);

  // --------------------------------------------------
  // Testimonial marquee clone
  // --------------------------------------------------
  useEffect(() => {
    const track = wrapperRef.current?.querySelector('.testimonials-track');
    if (track && !track.dataset.cloned) {
      track.innerHTML += track.innerHTML;
      track.dataset.cloned = 'true';
    }
  }, []);

  // --------------------------------------------------
  // Load external scripts: p5.js + GSAP, then init forcefield + text-glitch
  // --------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    const loadScript = (src) =>
      new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) {
          resolve();
          return;
        }
        const s = document.createElement('script');
        s.src = src;
        s.async = true;
        s.onload = resolve;
        s.onerror = reject;
        document.body.appendChild(s);
      });

    // Load Font Awesome CSS if not present
    if (!document.querySelector('link[href*="font-awesome"]')) {
      const fa = document.createElement('link');
      fa.rel = 'stylesheet';
      fa.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css';
      document.head.appendChild(fa);
    }

    // Load Google Fonts if not present
    if (!document.querySelector('link[href*="Inter+Tight"]')) {
      const gf = document.createElement('link');
      gf.rel = 'stylesheet';
      gf.href = 'https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;700;900&family=JetBrains+Mono:wght@400;500;700&family=Inter:wght@300;400;500;600&family=Outfit:wght@400;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap';
      document.head.appendChild(gf);
    }

    Promise.all([
      loadScript('https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.9.4/p5.min.js'),
      loadScript('https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js'),
    ]).then(() => {
      if (cancelled) return;
      initForceField();
      initTextGlitch();
    });

    return () => {
      cancelled = true;
      // Clean up p5 instance
      if (p5InstanceRef.current) {
        p5InstanceRef.current.remove();
        p5InstanceRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --------------------------------------------------
  // ForceField init (p5 instance mode)
  // --------------------------------------------------
  const initForceField = useCallback(() => {
    const container = forcefieldRef.current;
    if (!container || !window.p5) return;

    const CONFIG = {
      imageUrl: 'https://cdn.pixabay.com/photo/2024/12/13/20/29/alps-9266131_1280.jpg',
      hue: 250,
      saturation: 80,
      threshold: 255,
      minStroke: 2,
      maxStroke: 6,
      spacing: 10,
      noiseScale: 0,
      density: 2.0,
      invertImage: true,
      invertWireframe: true,
      magnifierEnabled: true,
      magnifierRadius: 150,
      forceStrength: 10,
      friction: 0.9,
      restoreSpeed: 0.05,
    };

    const sketch = function (p) {
      let originalImg;
      let img;
      let palette = [];
      let points = [];
      let magnifierX = 0;
      let magnifierY = 0;
      const magnifierInertia = 0.1;

      p.preload = function () {
        originalImg = p.loadImage(CONFIG.imageUrl);
      };

      p.setup = function () {
        const w = container.clientWidth;
        const h = container.clientHeight;
        const canvas = p.createCanvas(w, h);
        canvas.style('display', 'block');
        magnifierX = w / 2;
        magnifierY = h / 2;
        processImage();
        generatePalette();
        generatePoints();
      };

      p.windowResized = function () {
        const w = container.clientWidth;
        const h = container.clientHeight;
        if (w > 0 && h > 0) {
          p.resizeCanvas(w, h);
          processImage();
          generatePoints();
        }
      };

      function processImage() {
        if (!originalImg) return;
        img = originalImg.get();
        if (p.width > 0 && p.height > 0) {
          img.resize(p.width, p.height);
        }
        img.filter(p.GRAY);
        if (CONFIG.invertImage) {
          img.loadPixels();
          for (let i = 0; i < img.pixels.length; i += 4) {
            img.pixels[i] = 255 - img.pixels[i];
            img.pixels[i + 1] = 255 - img.pixels[i + 1];
            img.pixels[i + 2] = 255 - img.pixels[i + 2];
          }
          img.updatePixels();
        }
      }

      function generatePalette() {
        palette = [];
        p.push();
        p.colorMode(p.HSL);
        for (let i = 0; i < 12; i++) {
          let lightness = p.map(i, 0, 11, 95, 5);
          palette.push(p.color(CONFIG.hue, CONFIG.saturation, lightness));
        }
        p.pop();
      }

      function generatePoints() {
        if (!img) return;
        points = [];
        const sp = Math.max(2, CONFIG.spacing);
        for (let y = 0; y < img.height; y += sp) {
          for (let x = 0; x < img.width; x += sp) {
            if (p.random() > CONFIG.density) continue;
            let nx = p.noise(x * CONFIG.noiseScale, y * CONFIG.noiseScale) - 0.5;
            let ny = p.noise((x + 500) * CONFIG.noiseScale, (y + 500) * CONFIG.noiseScale) - 0.5;
            let px = x + nx * sp;
            let py = y + ny * sp;
            points.push({
              pos: p.createVector(px, py),
              originalPos: p.createVector(px, py),
              vel: p.createVector(0, 0),
            });
          }
        }
      }

      function applyForceField(mx, my) {
        if (!CONFIG.magnifierEnabled) return;
        for (let pt of points) {
          let dir = window.p5.Vector.sub(pt.pos, p.createVector(mx, my));
          let d = dir.mag();
          if (d < CONFIG.magnifierRadius) {
            dir.normalize();
            let force = dir.mult(CONFIG.forceStrength / Math.max(1, d));
            pt.vel.add(force);
          }
          pt.vel.mult(CONFIG.friction);
          let restore = window.p5.Vector.sub(pt.pos, pt.originalPos).mult(-CONFIG.restoreSpeed);
          pt.vel.add(restore);
          pt.pos.add(pt.vel);
        }
      }

      p.draw = function () {
        if (!img) return;
        p.background(0);

        magnifierX = p.lerp(magnifierX, p.mouseX, magnifierInertia);
        magnifierY = p.lerp(magnifierY, p.mouseY, magnifierInertia);

        applyForceField(magnifierX, magnifierY);

        img.loadPixels();
        p.noFill();

        for (let pt of points) {
          let x = pt.pos.x;
          let y = pt.pos.y;
          let d = p.dist(x, y, magnifierX, magnifierY);

          let ppx = p.constrain(p.floor(x), 0, img.width - 1);
          let ppy = p.constrain(p.floor(y), 0, img.height - 1);
          let index = (ppx + ppy * img.width) * 4;
          let brightness = img.pixels[index];
          if (brightness === undefined) continue;

          let condition = CONFIG.invertWireframe
            ? brightness < CONFIG.threshold
            : brightness > CONFIG.threshold;

          if (condition) {
            let shadeIndex = Math.floor(p.map(brightness, 0, 255, 0, palette.length - 1));
            shadeIndex = p.constrain(shadeIndex, 0, palette.length - 1);
            let strokeSize = p.map(brightness, 0, 255, CONFIG.minStroke, CONFIG.maxStroke);

            if (CONFIG.magnifierEnabled && d < CONFIG.magnifierRadius) {
              let factor = p.map(d, 0, CONFIG.magnifierRadius, 2, 1);
              strokeSize *= factor;
            }

            if (palette[shadeIndex]) {
              p.stroke(palette[shadeIndex]);
              p.strokeWeight(strokeSize);
              p.point(x, y);
            }
          }
        }
      };
    };

    p5InstanceRef.current = new window.p5(sketch, container);
  }, []);

  // --------------------------------------------------
  // Text glitch init
  // --------------------------------------------------
  const initTextGlitch = useCallback(() => {
    const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    wrapper.querySelectorAll('.text-glitch').forEach((el) => {
      // Prevent double-init
      if (el.dataset.initialized) return;
      el.dataset.initialized = 'true';

      const text = el.dataset.text || el.textContent.trim();
      const hoverText = el.dataset.hover || text;
      const delay = parseFloat(el.dataset.delay || 0);

      el.textContent = text;

      const overlay = document.createElement('span');
      overlay.className = 'text-glitch-overlay';
      overlay.textContent = hoverText;
      el.appendChild(overlay);

      // GSAP entrance
      if (typeof window.gsap !== 'undefined') {
        window.gsap.set(el, { backgroundSize: '0%', scale: 0.95, opacity: 0 });
        const tl = window.gsap.timeline({ delay });
        tl.to(el, { opacity: 1, scale: 1, duration: 0.6, ease: 'back.out(1.7)' }).to(
          el,
          { backgroundSize: '100%', duration: 2, ease: 'elastic.out(1, 0.5)' },
          '-=0.3'
        );
      } else {
        el.style.backgroundSize = '100%';
        el.style.opacity = '1';
      }

      let hoverInterval = null;

      el.addEventListener('mouseenter', function () {
        let iteration = 0;
        if (hoverInterval) clearInterval(hoverInterval);

        hoverInterval = setInterval(function () {
          const scrambled = hoverText
            .split('')
            .map(function (letter, i) {
              if (i < iteration) return hoverText[i];
              if (letter === ' ') return ' ';
              return LETTERS[Math.floor(Math.random() * 26)];
            })
            .join('');

          overlay.textContent = scrambled;

          if (iteration >= hoverText.length) {
            clearInterval(hoverInterval);
          }
          iteration += 1 / 3;
        }, 30);

        overlay.style.clipPath = 'polygon(0 0, 100% 0, 100% 100%, 0 100%)';
      });

      el.addEventListener('mouseleave', function () {
        if (hoverInterval) clearInterval(hoverInterval);
        overlay.textContent = hoverText;
        overlay.style.clipPath = 'polygon(0 50%, 100% 50%, 100% 50%, 0 50%)';
      });
    });
  }, []);

  // --------------------------------------------------
  // White-label image hover handlers
  // --------------------------------------------------
  const handleWlImgOver = useCallback((e) => {
    e.currentTarget.style.opacity = '1';
    e.currentTarget.style.transform = 'scale(1.02)';
  }, []);
  const handleWlImgOut = useCallback((e) => {
    e.currentTarget.style.opacity = '0.85';
    e.currentTarget.style.transform = 'scale(1)';
  }, []);

  // =================================================================
  // RENDER
  // =================================================================
  return (
    <div className="site-landing" ref={wrapperRef}>
      {/* ---- NAVBAR ---- */}
      <header id="navbar" className={navScrolled ? 'scrolled' : ''}>
        <div className="nav-inner">
          <a href="#home" className="nav-brand" onClick={(e) => scrollToSection(e, 'home')}>
            <img src="/landing/img/logo1.png" alt="SetupFX" style={{ height: '30px', width: 'auto' }} />
          </a>
          <ul className="nav-links">
            <li><a href="#home" className="active" onClick={(e) => scrollToSection(e, 'home')}>Home</a></li>
            <li><a href="#services" onClick={(e) => scrollToSection(e, 'services')}>Services</a></li>
            <li><a href="#marketing" onClick={(e) => scrollToSection(e, 'marketing')}>Digital Marketing</a></li>
            <li><a href="#solutions" onClick={(e) => scrollToSection(e, 'solutions')}>Solutions</a></li>
            <li><a href="#contact" onClick={(e) => scrollToSection(e, 'contact')}>Pricing</a></li>
            <li><a href="#contact" onClick={(e) => scrollToSection(e, 'contact')}>Contact</a></li>
          </ul>
          <div className="nav-right">
            <span className="nav-cta-ghost" style={{ cursor: 'pointer' }} onClick={() => navigate('/login')}>Login</span>
            <span className="nav-cta" style={{ cursor: 'pointer' }} onClick={() => navigate('/register')}>Sign_Up</span>
          </div>
          <button
            className="nav-hamburger"
            id="nav-toggle"
            aria-expanded={mobileOpen}
            onClick={toggleMobile}
          >
            <span></span><span></span><span></span>
          </button>
        </div>
      </header>

      {/* ---- MOBILE NAV ---- */}
      <nav id="nav-mobile" className={mobileOpen ? 'open' : ''}>
        <ul>
          <li><a href="#home" onClick={(e) => scrollToSection(e, 'home')}>Home</a></li>
          <li><a href="#services" onClick={(e) => scrollToSection(e, 'services')}>Services</a></li>
          <li><a href="#marketing" onClick={(e) => scrollToSection(e, 'marketing')}>Digital Marketing</a></li>
          <li><a href="#solutions" onClick={(e) => scrollToSection(e, 'solutions')}>Solutions</a></li>
          <li><a href="#contact" onClick={(e) => scrollToSection(e, 'contact')}>Pricing</a></li>
          <li><a href="#contact" onClick={(e) => scrollToSection(e, 'contact')}>Contact</a></li>
        </ul>
        <div className="mobile-cta-wrap">
          <span className="nav-cta" style={{ cursor: 'pointer' }} onClick={() => { setMobileOpen(false); navigate('/register'); }}>Sign_Up</span>
        </div>
      </nav>

      {/* ---- HERO ---- */}
      <section
        className="hero-forcefield-wrap"
        id="home"
        style={{ position: 'relative', width: '100%', height: '100vh', overflow: 'hidden', background: '#000' }}
      >
        <div
          id="hero-forcefield"
          ref={forcefieldRef}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 0 }}
        />
        <div className="hero-glitch-content">
          <div className="hero-glitch-lines">
            <h1 className="text-glitch" data-text="SETUPFX" data-hover="SETUPFX" data-delay="0">SETUPFX</h1>
            <h1 className="text-glitch" data-text="PROVIDES LEGAL &" data-hover="GLOBAL SUPPORT" data-delay="0.15">PROVIDES LEGAL &amp;</h1>
            <h1 className="text-glitch" data-text="TECH SUPPORT IN" data-hover="INFRASTRUCTURE" data-delay="0.3">TECH SUPPORT IN</h1>
            <h1 className="text-glitch" data-text="GLOBAL MARKET" data-hover="WORLD CLASS" data-delay="0.45">GLOBAL MARKET</h1>
            <h1 className="text-glitch" data-text="TRADING PLATFORMS" data-hover="SINCE 2023" data-delay="0.6">TRADING PLATFORMS</h1>
          </div>
          <div className="hero-glitch-cta" style={{ pointerEvents: 'auto' }}>
            <button className="btn-shimmer" onClick={() => { const el = document.getElementById('services'); if (el) el.scrollIntoView({ behavior: 'smooth' }); }}>
              <i className="fa-solid fa-rocket"></i>Explore Services
            </button>
            <button className="btn-hero-ghost" onClick={() => { const el = document.getElementById('contact'); if (el) el.scrollIntoView({ behavior: 'smooth' }); }}>
              Contact Us<span className="btn-icon"><i className="fa-solid fa-arrow-right"></i></span>
            </button>
          </div>
        </div>
      </section>

      {/* ---- TRUST BAR ---- */}
      <div className="trust-bar">
        <div className="trust-bar-inner">
          <span className="trust-title">From startups to global enterprises</span>
          <div className="trust-divider"></div>
          <div className="trust-items">
            <span className="trust-item">Custom Development</span>
            <span className="trust-item">Growth Marketing</span>
            <span className="trust-item">Secure &amp; Reliable</span>
            <span className="trust-item">Fast Delivery</span>
            <span className="trust-item">Global Reach</span>
            <span className="trust-item">24/7 Support</span>
          </div>
        </div>
      </div>

      {/* ---- SERVICES ---- */}
      <section className="section" id="services">
        <div className="container">
          <div className="sec-label reveal">Our Services</div>
          <div className="sec-title reveal">Software Development<br />Services</div>
          <p className="sec-sub reveal">From concept to deployment — we build custom applications that power your business forward.</p>
          <div className="services-grid" style={{ marginTop: '48px' }}>
            <div className="service-card reveal">
              <div className="service-num">01</div>
              <div className="service-icon">&#9881;&#65039;</div>
              <div className="service-title">Software Development</div>
              <p className="service-desc">Custom software solutions built with modern technologies, tailored to solve your unique business challenges.</p>
              <a href="#services" className="service-link">Learn more <span className="service-arrow">&rarr;</span></a>
            </div>
            <div className="service-card reveal">
              <div className="service-num">02</div>
              <div className="service-icon">&#127760;</div>
              <div className="service-title">Web Application Development</div>
              <p className="service-desc">Scalable, responsive web applications using React, Next.js, and modern frameworks for optimal performance.</p>
              <a href="#services" className="service-link">Learn more <span className="service-arrow">&rarr;</span></a>
            </div>
            <div className="service-card reveal">
              <div className="service-num">03</div>
              <div className="service-icon">&#128241;</div>
              <div className="service-title">Mobile App Development</div>
              <p className="service-desc">Native and cross-platform mobile apps for iOS and Android that deliver seamless user experiences.</p>
              <a href="#services" className="service-link">Learn more <span className="service-arrow">&rarr;</span></a>
            </div>
            <div className="service-card reveal">
              <div className="service-num">04</div>
              <div className="service-icon">&#128450;&#65039;</div>
              <div className="service-title">CRM &amp; Business Systems</div>
              <p className="service-desc">Custom CRM, ERP, and admin panel development to streamline your operations and boost productivity.</p>
              <a href="#services" className="service-link">Learn more <span className="service-arrow">&rarr;</span></a>
            </div>
            <div className="service-card reveal">
              <div className="service-num">05</div>
              <div className="service-icon">&#127912;</div>
              <div className="service-title">UI / UX Design</div>
              <p className="service-desc">User-centered design that converts visitors into customers with intuitive interfaces and beautiful aesthetics.</p>
              <a href="#services" className="service-link">Learn more <span className="service-arrow">&rarr;</span></a>
            </div>
            {/* White Label — spans full row */}
            <div className="service-card service-card-wl reveal" style={{ gridColumn: '1 / -1' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '48px', alignItems: 'center' }}>
                <div>
                  <div className="service-num">06</div>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 12px', border: '0.5px solid rgba(99,102,241,0.4)', fontFamily: "'JetBrains Mono', monospace", fontSize: '8px', letterSpacing: '0.35em', textTransform: 'uppercase', color: '#6366f1', marginBottom: '16px' }}>WHITE_LABEL</div>
                  <div className="service-title" style={{ fontSize: 'clamp(1.4rem, 3vw, 2rem)' }}>White Label Solution</div>
                  <p className="service-desc" style={{ marginTop: '12px', maxWidth: '480px' }}>Launch your own fully branded trading platform. Your brand, your clients, your business — powered by our technology.</p>
                  <a href="#services" className="service-link" style={{ marginTop: '20px', color: '#6366f1', fontSize: '10px' }}>
                    Explore White Label <span className="service-arrow">&rarr;</span>
                  </a>
                </div>
                <div style={{ border: '0.5px solid rgba(255,255,255,0.1)', overflow: 'hidden', position: 'relative' }}>
                  <img
                    src="/site/assets/images/services.png"
                    alt="White Label Platform"
                    style={{ width: '100%', display: 'block', opacity: 0.85, transition: 'opacity 300ms, transform 300ms' }}
                    onMouseOver={handleWlImgOver}
                    onMouseOut={handleWlImgOut}
                  />
                  <div style={{ position: 'absolute', top: '12px', left: '12px', padding: '4px 10px', background: 'rgba(0,0,0,0.7)', border: '0.5px solid rgba(99,102,241,0.4)', fontFamily: "'JetBrains Mono', monospace", fontSize: '8px', letterSpacing: '0.3em', textTransform: 'uppercase', color: '#6366f1' }}>Live_Preview</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---- DIGITAL MARKETING ---- */}
      <section className="section section-alt dm-section" id="marketing">
        <div className="container">
          <div className="sec-label reveal">Digital Marketing</div>
          <div className="sec-title reveal">Grow Your Business Online</div>
          <p className="sec-sub reveal">Data-driven marketing strategies that attract, engage, and convert your ideal customers.</p>
          <div className="dm-grid reveal" style={{ marginTop: '48px' }}>
            <div className="dm-left">
              <div className="dm-tabs">
                <span className="dm-tab active" onClick={handleDmTabClick}>Strategy</span>
                <span className="dm-tab" onClick={handleDmTabClick}>SEO</span>
                <span className="dm-tab" onClick={handleDmTabClick}>Paid Ads</span>
                <span className="dm-tab" onClick={handleDmTabClick}>Social Media</span>
                <span className="dm-tab" onClick={handleDmTabClick}>Content</span>
              </div>
              <div className="dm-content">
                <h3>Data-Driven Marketing Strategy</h3>
                <p>We craft comprehensive marketing strategies backed by data and market research. From audience analysis to campaign planning, we build roadmaps that align with your business goals and deliver measurable ROI.</p>
                <ul className="dm-list">
                  <li>Market research &amp; competitor analysis</li>
                  <li>Target audience identification</li>
                  <li>Multi-channel campaign planning</li>
                  <li>KPI setting &amp; performance tracking</li>
                  <li>Quarterly strategy reviews &amp; optimization</li>
                </ul>
                <a href="#contact" className="btn-white" onClick={(e) => scrollToSection(e, 'contact')}>Get Free Consultation</a>
              </div>
            </div>
            <div className="dm-right">
              <div className="dm-dashboard">
                <div className="dm-dash-header">
                  <span className="dm-dash-title">Marketing_Analytics_Dashboard</span>
                  <span className="dm-dash-badge">Trending_Up</span>
                </div>
                <div className="dm-roi">
                  <div className="dm-roi-label">Avg. ROI Increase</div>
                  <div className="dm-roi-num">+340%</div>
                  <div className="dm-roi-sub">For our clients</div>
                </div>
                <div className="dm-metrics">
                  <div className="dm-metric">
                    <div className="dm-metric-label">Impressions</div>
                    <div className="dm-metric-val">1.2M</div>
                    <div className="dm-metric-chg">+20%</div>
                  </div>
                  <div className="dm-metric">
                    <div className="dm-metric-label">Clicks</div>
                    <div className="dm-metric-val">84K</div>
                    <div className="dm-metric-chg">+35%</div>
                  </div>
                  <div className="dm-metric">
                    <div className="dm-metric-label">Conversions</div>
                    <div className="dm-metric-val">12.4K</div>
                    <div className="dm-metric-chg">+50%</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---- SOLUTIONS ---- */}
      <section className="section" id="solutions">
        <div className="container">
          <div className="sec-label reveal">Solutions</div>
          <div className="sec-title reveal">Tailored Solutions for<br />Every Business Need</div>
          <p className="sec-sub reveal">We don&apos;t believe in one-size-fits-all. Our solutions are custom-built to address your specific challenges.</p>
          <div className="solutions-grid reveal" style={{ marginTop: '48px' }}>
            <div className="solution-card">
              <div className="solution-num">SYSTEM_01</div>
              <div className="solution-title">Custom Software Solutions</div>
              <p className="solution-desc">Bespoke software designed to solve your unique business challenges with scalable, maintainable architecture.</p>
            </div>
            <div className="solution-card">
              <div className="solution-num">SYSTEM_02</div>
              <div className="solution-title">Business Automation</div>
              <p className="solution-desc">Automate repetitive workflows, reduce manual errors, and boost team productivity with smart automation.</p>
            </div>
            <div className="solution-card">
              <div className="solution-num">SYSTEM_03</div>
              <div className="solution-title">CRM &amp; Admin Panels</div>
              <p className="solution-desc">Centralized dashboards for managing clients, data, operations, and team collaboration in one place.</p>
            </div>
            <div className="solution-card">
              <div className="solution-num">SYSTEM_04</div>
              <div className="solution-title">Enterprise Applications</div>
              <p className="solution-desc">Large-scale, mission-critical systems built for performance, security, and enterprise-grade reliability.</p>
            </div>
          </div>
          <div className="sec-header-centered" style={{ marginTop: '80px' }}>
            <div className="sec-label">Industries</div>
            <div className="sec-title">Solutions for Every Stage of Growth</div>
          </div>
          <div className="industries-grid reveal">
            <div className="industry-card">
              <div className="industry-name">Startups</div>
              <p className="industry-desc">MVP development, rapid prototyping, and scalable architecture to help you validate ideas fast and grow.</p>
              <div className="industry-tags">
                <span className="industry-tag">MVP in 4-6 weeks</span>
                <span className="industry-tag">Scalable tech stack</span>
                <span className="industry-tag">Growth marketing</span>
              </div>
            </div>
            <div className="industry-card">
              <div className="industry-name">SMBs</div>
              <p className="industry-desc">Custom web apps, CRM systems, and digital marketing designed to streamline and accelerate growth.</p>
              <div className="industry-tags">
                <span className="industry-tag">Custom business apps</span>
                <span className="industry-tag">CRM &amp; automation</span>
                <span className="industry-tag">SEO &amp; paid ads</span>
              </div>
            </div>
            <div className="industry-card">
              <div className="industry-name">Enterprises</div>
              <p className="industry-desc">Complex systems, integrations, and large-scale applications built for performance and compliance.</p>
              <div className="industry-tags">
                <span className="industry-tag">Enterprise-grade systems</span>
                <span className="industry-tag">API integrations</span>
                <span className="industry-tag">24/7 support</span>
              </div>
            </div>
            <div className="industry-card">
              <div className="industry-name">Global Brands</div>
              <p className="industry-desc">World-class digital experiences, multi-market campaigns, and technology at scale.</p>
              <div className="industry-tags">
                <span className="industry-tag">Multi-market strategy</span>
                <span className="industry-tag">Brand-level UX</span>
                <span className="industry-tag">Global campaigns</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---- WHY SETUPFX ---- */}
      <section className="section section-alt" id="about">
        <div className="container">
          <div className="why-grid reveal">
            <div className="why-left">
              <div className="sec-label">Why SetupFX24</div>
              <div className="sec-title">Your Partner for Software &amp; Digital Growth</div>
              <p className="sec-sub" style={{ marginTop: '16px' }}>SetupFX24 is a global software development and digital marketing company helping businesses build, scale, and grow in the digital world. We combine cutting-edge technology with data-driven marketing strategies to deliver measurable results.</p>
              <p className="sec-sub" style={{ marginTop: '12px' }}>From custom web and mobile applications to CRM systems and full-funnel digital marketing, we provide end-to-end solutions that transform how businesses operate and connect with their customers.</p>
              <div className="why-mission-vision">
                <div className="mv-card">
                  <div className="mv-label">Our Mission</div>
                  <p className="mv-text">To empower businesses of all sizes with world-class software and marketing solutions that drive real growth.</p>
                </div>
                <div className="mv-card">
                  <div className="mv-label">Our Vision</div>
                  <p className="mv-text">To become the go-to global partner for businesses seeking digital transformation and sustainable growth.</p>
                </div>
              </div>
            </div>
            <div className="why-right">
              <div className="why-stat">
                <div className="why-stat-num">250<span className="accent">+</span></div>
                <div className="why-stat-label">Projects Delivered</div>
              </div>
              <div className="why-stat">
                <div className="why-stat-num">50<span className="accent">+</span></div>
                <div className="why-stat-label">Global Clients</div>
              </div>
              <div className="why-stat">
                <div className="why-stat-num">98<span className="accent">%</span></div>
                <div className="why-stat-label">Client Satisfaction</div>
              </div>
              <div className="why-stat">
                <div className="why-stat-num">24<span className="accent">/7</span></div>
                <div className="why-stat-label">Dedicated Support</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---- WHY CHOOSE US ---- */}
      <section className="section">
        <div className="container">
          <div className="sec-header-centered">
            <div className="sec-label reveal">Why Choose Us</div>
            <div className="sec-title reveal">Why Businesses Trust SetupFX24</div>
            <p className="sec-sub reveal">We combine technical excellence with strategic thinking to deliver solutions that truly make a difference.</p>
          </div>
          <div className="choose-grid reveal">
            {[
              { icon: '\uD83D\uDC68\u200D\uD83D\uDCBB', title: 'Expert Development Team', desc: 'Senior engineers with deep expertise in React, Next.js, Flutter, Node.js, and cloud infrastructure.' },
              { icon: '\u26A1', title: 'Fast Delivery', desc: 'Agile methodology and proven processes mean your project goes live in weeks, not months.' },
              { icon: '\uD83C\uDFAF', title: 'Dedicated Team', desc: 'A named project manager, designer, and development team assigned exclusively to your project.' },
              { icon: '\uD83C\uDF0D', title: 'Global Experience', desc: "We've delivered projects across 15+ countries for startups, SMBs, and enterprise clients." },
              { icon: '\uD83D\uDD27', title: 'Ongoing Support', desc: 'Post-launch support, maintenance, and optimization to keep your product running at peak performance.' },
              { icon: '\u2705', title: 'Quality Guaranteed', desc: 'Rigorous QA testing, code reviews, and security audits ensure enterprise-grade quality on every project.' },
            ].map((c, i) => (
              <div className="choose-card" key={i}>
                <div className="choose-icon">{c.icon}</div>
                <div className="choose-title">{c.title}</div>
                <p className="choose-desc">{c.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---- HOW IT WORKS ---- */}
      <section className="section section-alt" id="process">
        <div className="container">
          <div className="sec-header-centered">
            <div className="sec-label reveal">How It Works</div>
            <div className="sec-title reveal">From Idea to Launch in 5 Steps</div>
            <p className="sec-sub reveal">Our proven process ensures your project is delivered on time, on budget, and beyond expectations.</p>
          </div>
          <div className="steps-wrap reveal">
            <div className="steps-line"><div className="steps-line-fill"></div></div>
            <div className="steps-grid">
              {[
                { num: '01', title: 'Discovery & Strategy', desc: 'We dive deep into your business goals, audience, and requirements to craft the perfect plan.' },
                { num: '02', title: 'Design & Prototype', desc: 'Our designers create stunning UI/UX mockups and interactive prototypes for your approval.' },
                { num: '03', title: 'Development', desc: 'Our engineers build your solution using modern tech stacks with agile sprints and regular updates.' },
                { num: '04', title: 'Testing & QA', desc: 'Rigorous testing across devices, browsers, and scenarios to ensure flawless performance.' },
                { num: '05', title: 'Launch & Growth', desc: 'We deploy your project and provide ongoing support, optimization, and marketing to drive growth.' },
              ].map((s, i) => (
                <div className="step-card" style={{ position: 'relative' }} key={i}>
                  <div className="step-num">{s.num}</div>
                  <div className="step-dot"></div>
                  <div className="step-title">{s.title}</div>
                  <p className="step-desc">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ---- CASE STUDIES ---- */}
      <section className="section" id="cases">
        <div className="container">
          <div className="sec-header-centered">
            <div className="sec-label reveal">Case Studies</div>
            <div className="sec-title reveal">Real Results, Real Impact</div>
            <p className="sec-sub reveal">See how we&apos;ve helped businesses across industries achieve their digital goals.</p>
          </div>
          <div className="cases-grid reveal">
            <div className="case-card">
              <span className="case-tag">Web Application</span>
              <div className="case-title">E-Commerce Platform for Fashion Brand</div>
              <p className="case-desc">Built a custom e-commerce platform with inventory management, payment processing, and analytics dashboard.</p>
              <div className="case-stats">
                <div className="case-stat"><div className="case-stat-val">+240%</div><div className="case-stat-label">Revenue Increase</div></div>
                <div className="case-stat"><div className="case-stat-val">0.8s</div><div className="case-stat-label">Page Load Time</div></div>
                <div className="case-stat"><div className="case-stat-val">+85%</div><div className="case-stat-label">Conversion Rate</div></div>
              </div>
            </div>
            <div className="case-card">
              <span className="case-tag">Mobile App</span>
              <div className="case-title">Fitness Tracking App with Social Features</div>
              <p className="case-desc">Developed a cross-platform mobile app with workout tracking, social challenges, and real-time leaderboards.</p>
              <div className="case-stats">
                <div className="case-stat"><div className="case-stat-val">50K+</div><div className="case-stat-label">Downloads</div></div>
                <div className="case-stat"><div className="case-stat-val">78%</div><div className="case-stat-label">User Retention</div></div>
                <div className="case-stat"><div className="case-stat-val">4.8/5</div><div className="case-stat-label">App Rating</div></div>
              </div>
            </div>
            <div className="case-card">
              <span className="case-tag">Digital Marketing</span>
              <div className="case-title">SaaS Lead Generation Campaign</div>
              <p className="case-desc">Executed a full-funnel marketing strategy including SEO, paid ads, and content marketing for a B2B SaaS company.</p>
              <div className="case-stats">
                <div className="case-stat"><div className="case-stat-val">+320%</div><div className="case-stat-label">Organic Traffic</div></div>
                <div className="case-stat"><div className="case-stat-val">+180%</div><div className="case-stat-label">Qualified Leads</div></div>
                <div className="case-stat"><div className="case-stat-val">-45%</div><div className="case-stat-label">Cost Per Lead</div></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---- TESTIMONIALS ---- */}
      <section className="section" id="testimonials">
        <div className="container">
          <div className="sec-header-centered">
            <div className="sec-label reveal">Testimonials</div>
            <div className="sec-title reveal">What Our Clients Say</div>
            <p className="sec-sub reveal">Don&apos;t just take our word for it — hear from the businesses we&apos;ve helped grow.</p>
          </div>
        </div>
        <div className="testimonials-track-wrap" style={{ marginTop: '48px' }}>
          <div className="testimonials-track">
            {[
              {
                quote: '"SetupFX24 built our entire e-commerce platform from scratch. The team delivered ahead of schedule, and our online revenue has grown 3x since launch. Their technical expertise and communication are outstanding."',
                name: 'Sarah Mitchell',
                role: 'CEO \u2014 Fashion Forward \u00B7 E-Commerce \u00B7 United States',
              },
              {
                quote: '"We hired SetupFX24 for SEO and paid advertising. Within 6 months, our organic traffic increased by 280% and our cost per acquisition dropped by 40%. They truly understand digital growth."',
                name: 'James Chen',
                role: 'Marketing Director \u2014 SaaS Company \u00B7 Singapore',
              },
              {
                quote: '"The mobile app they developed for us has a 4.9-star rating with over 50K downloads. SetupFX24 didn\'t just build an app \u2014 they built a product that our users love. Highly recommended."',
                name: 'Priya Sharma',
                role: 'Founder & CTO \u2014 Health & Fitness \u00B7 India',
              },
            ].map((t, i) => (
              <div className="testimonial-card" key={i}>
                <div className="testimonial-stars">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <span className="testimonial-star lit" key={s}>{'\u2605'}</span>
                  ))}
                </div>
                <p className="testimonial-quote">{t.quote}</p>
                <div className="testimonial-author">
                  <div className="testimonial-name">{t.name}</div>
                  <div className="testimonial-role">{t.role}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---- CTA ---- */}
      <section className="cta-section" id="contact">
        <div className="cta-box reveal">
          <div className="cta-bg-light l1"></div>
          <div className="cta-bg-light l2"></div>
          <div className="cta-inner">
            <div className="cta-title">Ready to Build, Scale &amp;<br />Grow Your Business?</div>
            <p className="cta-sub">Get a free consultation and custom proposal tailored to your business needs. Our team will walk you through every solution.</p>
            <div className="cta-btns">
              <a href="#contact" className="btn-white">Get Free Consultation</a>
              <a href="#contact" className="btn-outline-white">View Pricing</a>
            </div>
          </div>
        </div>
      </section>

      {/* ---- FOOTER ---- */}
      <footer className="site-footer" id="footer">
        <div className="container">
          <div className="footer-grid">
            <div className="footer-col">
              <div className="footer-brand-name">SetupFX24</div>
              <div className="footer-brand-sub">SetupFX Softtech (OPC) Private Limited</div>
              <p className="footer-desc">Global software development and digital marketing company powering brokerages and businesses worldwide.</p>
              <div className="footer-contact-item">
                <i className="fa-solid fa-envelope" style={{ marginTop: '2px', color: 'rgba(255,255,255,0.2)' }}></i>
                setupfx24@gmail.com
              </div>
              <div className="footer-contact-item">
                <i className="fa-brands fa-whatsapp" style={{ marginTop: '2px', color: 'rgba(255,255,255,0.2)' }}></i>
                +1 (908) 228-0305
              </div>
              <div className="footer-contact-item" style={{ fontSize: '10px', color: 'rgba(255,255,255,0.2)' }}>
                <i className="fa-solid fa-location-dot" style={{ marginTop: '2px' }}></i>
                Office 9364hn 3 Fitzroy Place, Glasgow, G3 7RH, UK
              </div>
            </div>
            <div className="footer-col">
              <div className="footer-col-title">Solutions</div>
              <ul className="footer-links">
                <li><a href="#solutions" onClick={(e) => scrollToSection(e, 'solutions')}>Solutions</a></li>
                <li><a href="#services" onClick={(e) => scrollToSection(e, 'services')}>Liquidity</a></li>
                <li><a href="#contact" onClick={(e) => scrollToSection(e, 'contact')}>Pricing</a></li>
                <li><a href="#cases" onClick={(e) => scrollToSection(e, 'cases')}>Case Studies</a></li>
              </ul>
            </div>
            <div className="footer-col">
              <div className="footer-col-title">Company</div>
              <ul className="footer-links">
                <li><a href="#about" onClick={(e) => scrollToSection(e, 'about')}>Blog</a></li>
                <li><a href="#about" onClick={(e) => scrollToSection(e, 'about')}>FAQs</a></li>
                <li><a href="#contact" onClick={(e) => scrollToSection(e, 'contact')}>Contact</a></li>
                <li><a href="#about" onClick={(e) => scrollToSection(e, 'about')}>About Us</a></li>
              </ul>
            </div>
            <div className="footer-col">
              <div className="footer-col-title">Legal</div>
              <ul className="footer-links">
                <li><a href="/privacy-policy">Privacy Policy</a></li>
                <li><a href="/terms">Terms of Service</a></li>
                <li><a href="/privacy-policy">Cookie Policy</a></li>
              </ul>
            </div>
          </div>
          <div className="footer-bottom">
            <div className="footer-copy">&copy; 2026 SetupFX24. All rights reserved.</div>
            <div className="footer-legal">
              <a href="/privacy-policy">Privacy</a>
              <a href="/terms">Terms</a>
              <a href="/privacy-policy">Cookies</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

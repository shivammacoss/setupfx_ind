/**
 * Hero effects — inlined to avoid external script loading issues in production.
 * Contains: ForceField (p5.js) + TextGlitch (GSAP)
 */

export function initTextGlitch() {
  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  document.querySelectorAll('.text-glitch').forEach((el, index) => {
    if (el.dataset.glitchInit) return; // prevent double-init
    el.dataset.glitchInit = 'true';

    const text = el.dataset.text || el.textContent.trim();
    const hoverText = el.dataset.hover || text;
    const delay = parseFloat(el.dataset.delay || 0);

    el.textContent = text;

    const overlay = document.createElement('span');
    overlay.className = 'text-glitch-overlay';
    overlay.textContent = hoverText;
    el.appendChild(overlay);

    if (typeof window.gsap !== 'undefined') {
      window.gsap.set(el, { backgroundSize: '0%', scale: 0.95, opacity: 0 });
      const tl = window.gsap.timeline({ delay });
      tl.to(el, { opacity: 1, scale: 1, duration: 0.6, ease: 'back.out(1.7)' })
        .to(el, { backgroundSize: '100%', duration: 2, ease: 'elastic.out(1, 0.5)' }, '-=0.3');
    } else {
      el.style.backgroundSize = '100%';
      el.style.opacity = '1';
    }

    let hoverInterval = null;
    el.addEventListener('mouseenter', function () {
      let iteration = 0;
      if (hoverInterval) clearInterval(hoverInterval);
      hoverInterval = setInterval(function () {
        const scrambled = hoverText.split('').map(function (letter, i) {
          if (i < iteration) return hoverText[i];
          if (letter === ' ') return ' ';
          return LETTERS[Math.floor(Math.random() * 26)];
        }).join('');
        overlay.textContent = scrambled;
        if (iteration >= hoverText.length) clearInterval(hoverInterval);
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
}

export function initForceField() {
  const container = document.getElementById('hero-forcefield');
  if (!container || container.dataset.p5init || typeof window.p5 === 'undefined') return;
  container.dataset.p5init = 'true';

  const CONFIG = {
    imageUrl: 'https://cdn.pixabay.com/photo/2024/12/13/20/29/alps-9266131_1280.jpg',
    hue: 250, saturation: 80, threshold: 255,
    minStroke: 2, maxStroke: 6, spacing: 14, noiseScale: 0, density: 1.5,
    invertImage: true, invertWireframe: true,
    magnifierEnabled: true, magnifierRadius: 150,
    forceStrength: 10, friction: 0.9, restoreSpeed: 0.05
  };

  const sketch = function (p) {
    let originalImg, img, palette = [], points = [];
    let magnifierX = 0, magnifierY = 0;
    let cachedPixels = null, imgW = 0, imgH = 0;

    p.preload = function () { originalImg = p.loadImage(CONFIG.imageUrl); };

    p.setup = function () {
      const w = container.clientWidth, h = container.clientHeight;
      const canvas = p.createCanvas(w, h);
      canvas.style('display', 'block');
      magnifierX = w / 2; magnifierY = h / 2;
      p.frameRate(30);
      processImage(); generatePalette(); generatePoints();
    };

    p.windowResized = function () {
      const w = container.clientWidth, h = container.clientHeight;
      if (w > 0 && h > 0) { p.resizeCanvas(w, h); processImage(); generatePoints(); }
    };

    function processImage() {
      if (!originalImg) return;
      img = originalImg.get();
      if (p.width > 0 && p.height > 0) img.resize(p.width, p.height);
      img.filter(p.GRAY);
      if (CONFIG.invertImage) {
        img.loadPixels();
        for (let i = 0; i < img.pixels.length; i += 4) {
          img.pixels[i] = 255 - img.pixels[i];
          img.pixels[i+1] = 255 - img.pixels[i+1];
          img.pixels[i+2] = 255 - img.pixels[i+2];
        }
        img.updatePixels();
      }
      img.loadPixels();
      cachedPixels = img.pixels.slice();
      imgW = img.width; imgH = img.height;
    }

    function generatePalette() {
      palette = []; p.push(); p.colorMode(p.HSL);
      for (let i = 0; i < 12; i++) palette.push(p.color(CONFIG.hue, CONFIG.saturation, p.map(i, 0, 11, 95, 5)));
      p.pop();
    }

    function generatePoints() {
      if (!img) return; points = [];
      const sp = Math.max(2, CONFIG.spacing);
      for (let y = 0; y < img.height; y += sp) {
        for (let x = 0; x < img.width; x += sp) {
          if (p.random() > CONFIG.density) continue;
          const px = x + (p.noise(x * CONFIG.noiseScale, y * CONFIG.noiseScale) - 0.5) * sp;
          const py = y + (p.noise((x+500) * CONFIG.noiseScale, (y+500) * CONFIG.noiseScale) - 0.5) * sp;
          points.push({ px, py, ox: px, oy: py, vx: 0, vy: 0 });
        }
      }
    }

    p.draw = function () {
      if (!cachedPixels) return;
      p.background(0);
      magnifierX = p.lerp(magnifierX, p.mouseX, 0.1);
      magnifierY = p.lerp(magnifierY, p.mouseY, 0.1);
      const r = CONFIG.magnifierRadius, fs = CONFIG.forceStrength;
      const fric = CONFIG.friction, rest = CONFIG.restoreSpeed;
      const pLen = palette.length - 1;
      p.noFill();
      for (let i = 0; i < points.length; i++) {
        const pt = points[i];
        const dx = pt.px - magnifierX, dy = pt.py - magnifierY;
        const d = Math.sqrt(dx*dx + dy*dy);
        if (d < r && d > 0) { const f = fs/d; pt.vx += (dx/d)*f; pt.vy += (dy/d)*f; }
        pt.vx = pt.vx * fric + (pt.ox - pt.px) * rest;
        pt.vy = pt.vy * fric + (pt.oy - pt.py) * rest;
        pt.px += pt.vx; pt.py += pt.vy;
        const ix = Math.max(0, Math.min(Math.floor(pt.px), imgW-1));
        const iy = Math.max(0, Math.min(Math.floor(pt.py), imgH-1));
        const brightness = cachedPixels[(ix + iy * imgW) * 4];
        if (brightness === undefined) continue;
        const cond = CONFIG.invertWireframe ? brightness < CONFIG.threshold : brightness > CONFIG.threshold;
        if (cond) {
          const si = Math.max(0, Math.min(Math.floor(brightness/255*pLen), pLen));
          let sw = CONFIG.minStroke + (brightness/255) * (CONFIG.maxStroke - CONFIG.minStroke);
          if (d < r) sw *= 1 + (1 - d/r);
          if (palette[si]) { p.stroke(palette[si]); p.strokeWeight(sw); p.point(pt.px, pt.py); }
        }
      }
    };
  };

  new window.p5(sketch, container);
}
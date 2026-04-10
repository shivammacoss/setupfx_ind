import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import SiteLayout from '../SiteLayout';

/**
 * Generic site page component that loads HTML content from the static site files.
 * Extracts content between </nav> and <footer>, fixes links, and renders it.
 */

const linkReplacements = [
  ['index.html', '/'],
  ['services.html', '/services'],
  ['about.html', '/about'],
  ['contact.html', '/contact'],
  ['pricing.html', '/pricing'],
  ['solutions.html', '/solutions'],
  ['digital-marketing.html', '/digital-marketing'],
  ['blog.html', '/blog'],
  ['faq.html', '/faq'],
  ['case-studies.html', '/case-studies'],
  ['liquidity.html', '/liquidity'],
  ['white-label.html', '/white-label'],
  ['terms.html', '/terms'],
  ['privacy.html', '/privacy'],
  ['cookies.html', '/cookies'],
];

function fixLinks(html) {
  let out = html;
  for (const [from, to] of linkReplacements) {
    out = out.split('href="' + from + '"').join('href="' + to + '"');
    out = out.split("href='" + from + "'").join("href='" + to + "'");
    out = out.split("location.href='" + from + "'").join("location.href='" + to + "'");
  }
  // Fix image paths
  out = out.replace(/src="assets\//g, 'src="/site/assets/');
  out = out.replace(/src='assets\//g, "src='/site/assets/");
  return out;
}

function extractContent(html) {
  // Find end of last </nav>
  let navEnd = html.lastIndexOf('</nav>');
  if (navEnd === -1) navEnd = 0;
  else navEnd = html.indexOf('>', navEnd) + 1;
  // Find start of <footer
  let footerStart = html.indexOf('<footer');
  if (footerStart === -1) footerStart = html.length;
  return fixLinks(html.substring(navEnd, footerStart).trim());
}

// Internal routes that should use React Router navigation
const internalRoutes = new Set([
  '/', '/services', '/about', '/contact', '/pricing', '/solutions',
  '/digital-marketing', '/blog', '/faq', '/case-studies', '/liquidity',
  '/white-label', '/terms', '/privacy', '/cookies', '/login', '/register',
]);

export default function SitePage({ htmlFile }) {
  const [content, setContent] = useState('');
  const [loaded, setLoaded] = useState(false);
  const contentRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    setContent('');
    setLoaded(false);
    fetch('/site/' + htmlFile)
      .then(r => r.text())
      .then(html => {
        setContent(extractContent(html));
        setLoaded(true);
      })
      .catch(() => {
        setContent('<div class="container section"><p>Failed to load page content.</p></div>');
        setLoaded(true);
      });
  }, [htmlFile]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [htmlFile]);

  // After content loads, initialize reveals and scripts
  useEffect(() => {
    if (!loaded) return;

    // Scroll reveals
    const reveals = document.querySelectorAll('.reveal');
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
    }, { threshold: 0.1 });
    reveals.forEach(el => observer.observe(el));

    const scripts = [];

    // Check if page needs forcefield/glitch
    const hasFF = content.includes('hero-forcefield');
    const hasTG = content.includes('text-glitch');
    const hasSections = content.includes('dm-tab') || content.includes('steps-line');

    if (hasFF || hasTG) {
      // Load p5.js + forcefield
      const p5Script = document.createElement("script");
      p5Script.src = "https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.9.4/p5.min.js";
      p5Script.onload = () => {
        const ffScript = document.createElement("script");
        ffScript.src = "/site/js/forcefield.js";
        document.body.appendChild(ffScript);
        scripts.push(ffScript);
      };
      document.body.appendChild(p5Script);
      scripts.push(p5Script);

      // Load GSAP + text-glitch
      const gsapScript = document.createElement("script");
      gsapScript.src = "https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js";
      gsapScript.onload = () => {
        const tgScript = document.createElement("script");
        tgScript.src = "/site/js/text-glitch.js";
        document.body.appendChild(tgScript);
        scripts.push(tgScript);
      };
      document.body.appendChild(gsapScript);
      scripts.push(gsapScript);
    }

    if (hasSections) {
      const sectionsScript = document.createElement("script");
      sectionsScript.src = "/site/js/sections.js";
      document.body.appendChild(sectionsScript);
      scripts.push(sectionsScript);
    }

    return () => {
      observer.disconnect();
      scripts.forEach(s => { try { s.remove(); } catch(e) {} });
      // Clean up p5 canvas
      const canvas = document.querySelector("#hero-forcefield canvas");
      if (canvas) canvas.remove();
      if (window._forcefieldP5) {
        window._forcefieldP5.remove();
        window._forcefieldP5 = null;
      }
      // Clean up any remaining dynamically loaded scripts
      document.querySelectorAll('script[src*="forcefield.js"], script[src*="text-glitch.js"], script[src*="sections.js"]').forEach(s => s.remove());
    };
  }, [loaded, content]);

  // Intercept clicks on internal links to use React Router
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const handleClick = (e) => {
      const anchor = e.target.closest('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (href && internalRoutes.has(href)) {
        e.preventDefault();
        navigate(href);
      }
    };
    el.addEventListener('click', handleClick);
    return () => el.removeEventListener('click', handleClick);
  }, [loaded, navigate]);

  return (
    <SiteLayout>
      <div ref={contentRef} dangerouslySetInnerHTML={{ __html: content }} />
    </SiteLayout>
  );
}

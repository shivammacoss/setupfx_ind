import { motion } from "framer-motion";
import { Github, Twitter, Linkedin, Mail, ArrowUpRight } from "lucide-react";

const socialLinks = [
  { icon: Github, href: "#", label: "GitHub" },
  { icon: Twitter, href: "#", label: "Twitter" },
  { icon: Linkedin, href: "#", label: "LinkedIn" },
  { icon: Mail, href: "mailto:support@setupfx.com", label: "Email" },
];

const navLinks = [
  { label: "Home", href: "/" },
  { label: "Login", href: "/login" },
  { label: "Register", href: "/register" },
  { label: "Markets", href: "/app/market" },
];

export default function LandingFooter() {
  return (
    <footer style={{ position: "relative", background: "#0a0a0f", padding: "64px 24px", overflow: "hidden" }}>
      {/* Top border gradient */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: "linear-gradient(to right, transparent, rgba(168,85,247,0.5), transparent)" }} />

      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 48 }}>
          {/* Brand */}
          <motion.div
            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }} transition={{ duration: 0.6 }}
            style={{ gridColumn: "span 2" }}
          >
            <img src="/landing/img/logo1.png" alt="SetupFX" style={{ height: 40, width: "auto", marginBottom: 16, objectFit: "contain" }} />
            <p style={{ color: "rgba(255,255,255,0.5)", maxWidth: 360, lineHeight: 1.7, marginBottom: 24, fontSize: 14 }}>
              SetupFX is a next-generation trading platform built for speed, security, and simplicity. Trade Forex, Crypto, Indices and more.
            </p>
            <div style={{ display: "flex", gap: 12 }}>
              {socialLinks.map((social) => (
                <a key={social.label} href={social.href} aria-label={social.label}
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 40, height: 40, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)", textDecoration: "none", transition: "all 0.3s" }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(168,85,247,0.5)"; e.currentTarget.style.color = "#c084fc"; e.currentTarget.style.background = "rgba(168,85,247,0.1)"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; e.currentTarget.style.color = "rgba(255,255,255,0.6)"; e.currentTarget.style.background = "transparent"; }}
                >
                  <social.icon size={18} />
                </a>
              ))}
            </div>
          </motion.div>

          {/* Navigation */}
          <motion.div
            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.1 }}
          >
            <h4 style={{ marginBottom: 16, fontFamily: "monospace", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.2em", color: "rgba(255,255,255,0.4)" }}>
              Navigation
            </h4>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 12 }}>
              {navLinks.map((link) => (
                <li key={link.label}>
                  <a href={link.href} style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "rgba(255,255,255,0.6)", textDecoration: "none", fontSize: 14, transition: "color 0.2s" }}
                    onMouseEnter={e => e.currentTarget.style.color = "white"}
                    onMouseLeave={e => e.currentTarget.style.color = "rgba(255,255,255,0.6)"}
                  >
                    {link.label}
                    <ArrowUpRight size={14} />
                  </a>
                </li>
              ))}
            </ul>
          </motion.div>

          {/* Get Started */}
          <motion.div
            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.2 }}
          >
            <h4 style={{ marginBottom: 16, fontFamily: "monospace", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.2em", color: "rgba(255,255,255,0.4)" }}>
              Get Started
            </h4>
            <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 14, marginBottom: 16, lineHeight: 1.6 }}>
              Join SetupFX and start trading global markets today.
            </p>
            <a href="mailto:support@setupfx.com"
              style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "#c084fc", textDecoration: "none", fontSize: 14, transition: "color 0.2s" }}
              onMouseEnter={e => e.currentTarget.style.color = "#a855f7"}
              onMouseLeave={e => e.currentTarget.style.color = "#c084fc"}
            >
              support@setupfx.com <ArrowUpRight size={16} />
            </a>
          </motion.div>
        </div>

        {/* Bottom bar */}
        <motion.div
          initial={{ opacity: 0 }} whileInView={{ opacity: 1 }}
          viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.3 }}
          style={{ marginTop: 64, display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 16, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 32 }}
        >
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.4)" }}>
            © {new Date().getFullYear()} SetupFX. All rights reserved.
          </p>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.4)" }}>
            Built for the{" "}
            <span style={{ background: "linear-gradient(to right, #c084fc, #ec4899)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              future
            </span>{" "}
            of trading.
          </p>
        </motion.div>
      </div>
    </footer>
  );
}

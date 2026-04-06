import { useState } from "react";
import { motion, useTransform, AnimatePresence } from "framer-motion";
import { X, TrendingUp, BarChart3, Zap, Trophy, Mail, Lock, User, Eye, EyeOff } from "lucide-react";
import { useNavigate } from "react-router-dom";

function TextSection({ children, align = "center", scrollStart, scrollEnd, scrollYProgress, style = {} }) {
  const fadeInStart = scrollStart;
  const fadeInEnd = scrollStart + 0.08;
  const fadeOutStart = scrollEnd - 0.08;
  const fadeOutEnd = scrollEnd;

  const opacity = useTransform(scrollYProgress, [fadeInStart, fadeInEnd, fadeOutStart, fadeOutEnd], [0, 1, 1, 0]);
  const y = useTransform(scrollYProgress, [fadeInStart, fadeInEnd, fadeOutStart, fadeOutEnd], [80, 0, 0, -80]);
  const scale = useTransform(scrollYProgress, [fadeInStart, fadeInEnd, fadeOutStart, fadeOutEnd], [0.9, 1, 1, 0.9]);

  const alignStyle = {
    left: { alignItems: "flex-start", textAlign: "left", paddingLeft: "clamp(24px, 6vw, 96px)" },
    center: { alignItems: "center", textAlign: "center" },
    right: { alignItems: "flex-end", textAlign: "right", paddingRight: "clamp(24px, 6vw, 96px)" },
  }[align];

  return (
    <motion.div
      style={{ opacity, y, scale, pointerEvents: "none", position: "absolute", inset: 0, zIndex: 10, display: "flex", flexDirection: "column", justifyContent: "center", ...alignStyle, ...style }}
    >
      {children}
    </motion.div>
  );
}

function SignUpModal({ isOpen, onClose }) {
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({ name: "", email: "", password: "" });
  const navigate = useNavigate();

  const handleSubmit = (e) => {
    e.preventDefault();
    onClose();
    navigate("/register");
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
            style={{ pointerEvents: "auto", position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }} />
          <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            style={{ pointerEvents: "auto", position: "fixed", left: "50%", top: "50%", zIndex: 50, width: "90%", maxWidth: 448, transform: "translate(-50%, -50%)" }}>
            <div style={{ position: "relative", overflow: "hidden", borderRadius: 16, border: "1px solid rgba(255,255,255,0.1)", background: "linear-gradient(135deg, rgba(37,37,50,0.95), rgba(26,26,36,0.95), rgba(13,13,18,0.95))", padding: 24, boxShadow: "0 25px 50px rgba(0,0,0,0.5)", backdropFilter: "blur(24px)" }}>
              <button onClick={onClose} style={{ position: "absolute", right: 16, top: 16, zIndex: 10, display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: 8, background: "none", border: "none", color: "rgba(255,255,255,0.6)", cursor: "pointer" }}>
                <X size={18} />
              </button>
              <div style={{ textAlign: "center", marginBottom: 24 }}>
                <div style={{ margin: "0 auto 16px", width: 56, height: 56, borderRadius: 12, background: "linear-gradient(135deg, #a855f7, #ec4899)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Zap size={28} color="white" />
                </div>
                <h3 style={{ color: "white", fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Create Account</h3>
                <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 14 }}>Join SetupFX and start trading today</p>
              </div>
              <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {[{ icon: <User size={18} />, placeholder: "Full Name", type: "text", key: "name" },
                  { icon: <Mail size={18} />, placeholder: "Email Address", type: "email", key: "email" }].map((field) => (
                  <div key={field.key} style={{ position: "relative" }}>
                    <div style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.4)", pointerEvents: "none" }}>{field.icon}</div>
                    <input type={field.type} placeholder={field.placeholder} value={formData[field.key]}
                      onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })}
                      style={{ width: "100%", borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", padding: "16px 16px 16px 48px", color: "white", outline: "none", fontSize: 14, boxSizing: "border-box" }} required />
                  </div>
                ))}
                <div style={{ position: "relative" }}>
                  <div style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.4)", pointerEvents: "none" }}><Lock size={18} /></div>
                  <input type={showPassword ? "text" : "password"} placeholder="Password" value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    style={{ width: "100%", borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", padding: "16px 48px 16px 48px", color: "white", outline: "none", fontSize: 14, boxSizing: "border-box" }} required />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer" }}>
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                <button type="submit" style={{ width: "100%", borderRadius: 12, background: "linear-gradient(to right, #a855f7, #ec4899)", padding: "16px", fontWeight: 500, color: "white", border: "none", cursor: "pointer", fontSize: 15 }}>
                  Sign Up
                </button>
              </form>
              <p style={{ marginTop: 24, textAlign: "center", fontSize: 14, color: "rgba(255,255,255,0.5)" }}>
                Already have an account?{" "}
                <button onClick={() => { onClose(); }} style={{ background: "none", border: "none", color: "#c084fc", cursor: "pointer", fontSize: 14 }}
                  onClickCapture={() => { window.location.href = "/login"; }}>Log in</button>
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default function Overlay({ scrollYProgress }) {
  const overlayOpacity = useTransform(scrollYProgress, [0.92, 1], [1, 0]);
  const [showSignUp, setShowSignUp] = useState(false);

  return (
    <>
      <SignUpModal isOpen={showSignUp} onClose={() => setShowSignUp(false)} />
      <motion.div style={{ opacity: overlayOpacity, pointerEvents: "none", position: "absolute", inset: 0, zIndex: 10 }}>

        {/* Section 1: Hero */}
        <TextSection scrollStart={0} scrollEnd={0.20} align="center" scrollYProgress={scrollYProgress}>
          <div style={{ padding: "0 16px" }}>
            <p style={{ marginBottom: 16, fontFamily: "monospace", fontSize: 13, textTransform: "uppercase", letterSpacing: "0.3em", color: "#c084fc" }}>
              Welcome to SetupFX
            </p>
            <h1 style={{ marginBottom: 24, fontSize: "clamp(48px, 8vw, 96px)", fontWeight: 700, letterSpacing: "-1px", color: "white", lineHeight: 1.1 }}>
              <span style={{ display: "block" }}>Build, Scale & Grow</span>
              <span style={{ display: "block", marginTop: 8, background: "linear-gradient(to right, #c084fc, #ec4899, #fb923c)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                Digitally
              </span>
            </h1>
            <p style={{ fontSize: 18, color: "rgba(255,255,255,0.5)" }}>Scroll to explore ↓</p>
          </div>
        </TextSection>

        {/* Section 2: What We Do */}
        <TextSection scrollStart={0.22} scrollEnd={0.45} align="left" scrollYProgress={scrollYProgress}>
          <div style={{ maxWidth: 560 }}>
            <p style={{ marginBottom: 16, fontFamily: "monospace", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.2em", color: "#f472b6" }}>Software Development Services</p>
            <h2 style={{ marginBottom: 24, fontSize: "clamp(32px, 5vw, 60px)", fontWeight: 700, lineHeight: 1.2, color: "white" }}>
              Build{" "}
              <span style={{ background: "linear-gradient(to right, #ec4899, #a855f7)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                Custom Solutions
              </span>{" "}
              for your business
            </h2>
            <p style={{ fontSize: 18, lineHeight: 1.7, color: "rgba(255,255,255,0.6)", maxWidth: 420 }}>
              SetupFX provides comprehensive software development services including web apps, mobile apps, APIs and enterprise solutions tailored to your needs.
            </p>
          </div>
        </TextSection>

        {/* Section 3: Philosophy */}
        <TextSection scrollStart={0.47} scrollEnd={0.70} align="right" scrollYProgress={scrollYProgress}>
          <div style={{ maxWidth: 560 }}>
            <p style={{ marginBottom: 16, fontFamily: "monospace", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.2em", color: "#fb923c" }}>SetupFX Philosophy</p>
            <h2 style={{ marginBottom: 24, fontSize: "clamp(32px, 5vw, 60px)", fontWeight: 700, lineHeight: 1.2, color: "white" }}>
              Where{" "}
              <span style={{ background: "linear-gradient(to right, #fb923c, #ec4899)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>speed</span>
              {" "}meets{" "}
              <span style={{ background: "linear-gradient(to right, #ec4899, #a855f7)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>precision</span>
            </h2>
            <p style={{ fontSize: 18, lineHeight: 1.7, color: "rgba(255,255,255,0.6)", maxWidth: 420, marginLeft: "auto" }}>
              SetupFX transforms global markets into seamless trading experiences. Analyze instruments, execute trades, and grow your portfolio with precision.
            </p>
          </div>
        </TextSection>

        {/* Section 4: CTA */}
        <TextSection scrollStart={0.72} scrollEnd={0.95} align="center" scrollYProgress={scrollYProgress}>
          <div style={{ padding: "0 16px" }}>
            <p style={{ marginBottom: 16, fontFamily: "monospace", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.2em", color: "#c084fc" }}>Get Started</p>
            <h2 style={{ marginBottom: 32, fontSize: "clamp(32px, 5vw, 64px)", fontWeight: 700, color: "white" }}>
              Ready to{" "}
              <span style={{ background: "linear-gradient(to right, #c084fc, #ec4899, #fb923c)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                grow
              </span>
              ?
            </h2>
            <div style={{ pointerEvents: "auto", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 16 }}>
              <button onClick={() => setShowSignUp(true)}
                style={{ position: "relative", overflow: "hidden", borderRadius: 999, background: "linear-gradient(to right, #a855f7, #ec4899)", padding: "16px 32px", fontWeight: 500, color: "white", border: "none", cursor: "pointer", fontSize: 15 }}>
                Start Trading
              </button>
              <a href="/login" style={{ borderRadius: 999, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.05)", padding: "16px 32px", fontWeight: 500, color: "white", textDecoration: "none", fontSize: 15, backdropFilter: "blur(8px)" }}>
                Sign In
              </a>
            </div>
          </div>
        </TextSection>
      </motion.div>
    </>
  );
}

import { motion } from "framer-motion";

export default function WhatIsSetupFX() {
  return (
    <section style={{ position: "relative", display: "flex", minHeight: "100vh", width: "100%", alignItems: "flex-start", justifyContent: "center", background: "#121212", paddingTop: 128, overflow: "hidden" }}>
      {/* Background gradient */}
      <div style={{ pointerEvents: "none", position: "absolute", inset: 0, background: "linear-gradient(to bottom, transparent, rgba(168,85,247,0.05), transparent)" }} />

      {/* Content */}
      <div style={{ position: "relative", zIndex: 10, width: "100%", maxWidth: 1152, padding: "0 24px", textAlign: "center" }}>
        <motion.p
          initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }} transition={{ duration: 0.6 }}
          style={{ marginBottom: 24, fontFamily: "monospace", fontSize: 13, textTransform: "uppercase", letterSpacing: "0.3em", color: "#c084fc" }}
        >
          About Us
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }} transition={{ duration: 0.6, delay: 0.1 }}
          style={{ marginBottom: 32 }}
        >
          <h2 style={{ fontSize: "clamp(40px, 7vw, 80px)", fontWeight: 700, lineHeight: 1.1, color: "white" }}>
            What is{" "}
            <span style={{ background: "linear-gradient(to right, #c084fc, #ec4899)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              SetupFX
            </span>
            ?
          </h2>
        </motion.div>

        <motion.p
          initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }} transition={{ duration: 0.8, delay: 0.3 }}
          style={{ fontSize: "clamp(16px, 2vw, 20px)", lineHeight: 1.8, color: "rgba(255,255,255,0.6)", maxWidth: 800, margin: "0 auto" }}
        >
          SetupFX is a professional trading platform where users can trade Forex, Crypto, Indices, and Commodities using real-time market data and advanced trading tools. It allows traders to analyze markets and turn their insights into real trading opportunities.
        </motion.p>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.5 }}
          style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 48, marginTop: 64 }}
        >
          {[
            { value: "1000+", label: "Active Traders" },
            { value: "50+", label: "Instruments" },
            { value: "24/7", label: "Market Access" },
            { value: "99.9%", label: "Uptime" },
          ].map((stat) => (
            <div key={stat.label} style={{ textAlign: "center" }}>
              <p style={{ fontSize: "clamp(28px, 4vw, 40px)", fontWeight: 700, background: "linear-gradient(to right, #c084fc, #ec4899)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                {stat.value}
              </p>
              <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 14, marginTop: 4 }}>{stat.label}</p>
            </div>
          ))}
        </motion.div>
      </div>

      {/* Decorative blurs */}
      <div style={{ pointerEvents: "none", position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)", width: 256, height: 256, borderRadius: "50%", background: "rgba(168,85,247,0.1)", filter: "blur(100px)" }} />
      <div style={{ pointerEvents: "none", position: "absolute", right: 0, top: "50%", transform: "translateY(-50%)", width: 256, height: 256, borderRadius: "50%", background: "rgba(236,72,153,0.1)", filter: "blur(100px)" }} />
    </section>
  );
}

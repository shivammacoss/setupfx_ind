import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus } from "lucide-react";

const features = [
  { id: 1, title: "Real-Time Market Data", description: "Trade with live price feeds across Forex, Crypto, Indices and Commodities with millisecond precision." },
  { id: 2, title: "Advanced Trading Tools", description: "Analyze charts with professional indicators, drawing tools and multi-timeframe analysis." },
  { id: 3, title: "Secure & Reliable Platform", description: "Your funds and data are protected with bank-grade encryption and 99.9% uptime guarantee." },
  { id: 4, title: "Copy Trading", description: "Follow successful traders and automatically copy their strategies to grow your portfolio." },
  { id: 5, title: "Demo Account", description: "Practice trading with virtual funds before risking real money — no deposit required." },
];

function FeatureItem({ feature, isOpen, onToggle }) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      style={{ position: "relative" }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Gradient border on hover */}
      <div style={{
        position: "absolute", inset: -1, borderRadius: 8,
        background: "linear-gradient(to right, #a855f7, #ec4899, #a855f7)",
        opacity: isHovered ? 1 : 0, transition: "opacity 0.3s",
      }} />
      <div
        style={{ position: "relative", background: "#1a1a1f", borderRadius: 8, cursor: "pointer" }}
        onClick={onToggle}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px" }}>
          <h3 style={{ color: "white", fontSize: 17, fontWeight: 500 }}>{feature.title}</h3>
          <motion.div animate={{ rotate: isOpen ? 45 : 0 }} transition={{ duration: 0.2 }} style={{ color: "#22d3ee", flexShrink: 0, marginLeft: 16 }}>
            <Plus size={24} />
          </motion.div>
        </div>
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: "easeInOut" }}
              style={{ overflow: "hidden" }}
            >
              <p style={{ padding: "0 24px 20px", color: "rgba(255,255,255,0.6)", lineHeight: 1.7 }}>
                {feature.description}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default function FeaturesSection() {
  const [openId, setOpenId] = useState(null);

  return (
    <section style={{ position: "relative", width: "100%", background: "#0a0a0f", padding: "96px 24px" }}>
      <div style={{ maxWidth: 896, margin: "0 auto" }}>
        <motion.div
          initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }} transition={{ duration: 0.6 }}
          style={{ textAlign: "center", marginBottom: 64 }}
        >
          <p style={{ color: "#c084fc", fontFamily: "monospace", fontSize: 13, textTransform: "uppercase", letterSpacing: "0.3em", marginBottom: 16 }}>Features</p>
          <h2 style={{ fontSize: "clamp(32px, 5vw, 52px)", fontWeight: 700, color: "white" }}>
            Why Choose SetupFX
          </h2>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }} transition={{ duration: 0.6, delay: 0.2 }}
          style={{ display: "flex", flexDirection: "column", gap: 16 }}
        >
          {features.map((feature) => (
            <FeatureItem
              key={feature.id} feature={feature}
              isOpen={openId === feature.id}
              onToggle={() => setOpenId(openId === feature.id ? null : feature.id)}
            />
          ))}
        </motion.div>
      </div>
    </section>
  );
}

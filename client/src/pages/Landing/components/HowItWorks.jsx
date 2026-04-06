import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";

const steps = [
  { step: "Step 1", title: "Choose a Market", description: "Browse live Forex, Crypto, and Indices markets and select the instrument you want to trade." },
  { step: "Step 2", title: "Analyze the Chart", description: "Use real-time data and advanced charts to understand price movements and trends." },
  { step: "Step 3", title: "Place Your Trade", description: "Enter the market with a buy or sell position using precise order management tools." },
  { step: "Step 4", title: "Manage & Profit", description: "Monitor your positions, set stop-loss and take-profit levels, and secure your earnings." },
];

const cardColors = ["#7c3aed", "#6366f1", "#ec4899", "#f43f5e"];

function StackedCard({ item, index }) {
  const cardRef = useRef(null);
  const { scrollYProgress } = useScroll({ target: cardRef, offset: ["start end", "start 20%"] });
  const scale = useTransform(scrollYProgress, [0, 1], [1, 0.85 + index * 0.03]);

  return (
    <motion.div
      ref={cardRef}
      style={{
        scale,
        top: `${100 + index * 25}px`,
        zIndex: index + 1,
        transformOrigin: "top center",
        position: "sticky",
        width: "100%",
        minHeight: 280,
        borderRadius: 40,
        background: cardColors[index],
        overflow: "hidden",
        boxShadow: "0 25px 50px rgba(0,0,0,0.4)",
      }}
    >
      <div style={{ display: "flex", flexDirection: "row", height: "100%", padding: "48px" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 14, fontWeight: 700, fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 12 }}>
            {item.step}
          </span>
          <h3 style={{ fontSize: "clamp(28px, 4vw, 48px)", fontWeight: 700, color: "white", marginBottom: 16 }}>
            {item.title}
          </h3>
          <p style={{ fontSize: "clamp(15px, 1.5vw, 18px)", color: "rgba(255,255,255,0.8)", maxWidth: 480 }}>
            {item.description}
          </p>
        </div>
        <div style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", marginLeft: 32 }}>
          <div style={{ width: 160, height: 160, borderRadius: 24, border: "4px solid rgba(255,255,255,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 80, fontWeight: 700, color: "rgba(255,255,255,0.3)" }}>{index + 1}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default function HowItWorks() {
  return (
    <section style={{ position: "relative", width: "100%", background: "#0a0a0f", padding: "80px 24px" }}>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <motion.div
          initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }} transition={{ duration: 0.6 }}
          style={{ textAlign: "center", marginBottom: 64 }}
        >
          <p style={{ color: "#c084fc", fontFamily: "monospace", fontSize: 13, textTransform: "uppercase", letterSpacing: "0.3em", marginBottom: 16 }}>
            How It Works
          </p>
          <h2 style={{ fontSize: "clamp(32px, 5vw, 52px)", fontWeight: 700, color: "white" }}>
            Start Trading in 4 Simple Steps
          </h2>
        </motion.div>

        <div style={{ position: "relative", height: "200vh" }}>
          {steps.map((item, index) => (
            <StackedCard key={index} item={item} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}

import { motion } from "framer-motion";
import { TrendingUp, BarChart2, DollarSign, Activity, Zap } from "lucide-react";

const markets = [
  { title: "Forex", description: "Trade major, minor and exotic currency pairs with tight spreads.", icon: <DollarSign size={16} color="white" /> },
  { title: "Crypto", description: "Bitcoin, Ethereum and top 100 crypto assets available 24/7.", icon: <Zap size={16} color="white" /> },
  { title: "Indices", description: "NIFTY, SENSEX, Dow Jones, NASDAQ and global indices.", icon: <BarChart2 size={16} color="white" /> },
  { title: "Commodities", description: "Gold, Silver, Oil and agricultural commodities.", icon: <Activity size={16} color="white" /> },
  { title: "More Markets", description: "Options, Futures and more instruments coming soon.", icon: <TrendingUp size={16} color="white" /> },
];

export default function TradingMarkets() {
  return (
    <section style={{ position: "relative", width: "100%", background: "#0a0a0f", padding: "96px 24px" }}>
      <div style={{ maxWidth: 1152, margin: "0 auto" }}>
        <motion.div
          initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }} transition={{ duration: 0.6 }}
          style={{ textAlign: "center", marginBottom: 64 }}
        >
          <p style={{ color: "#c084fc", fontFamily: "monospace", fontSize: 13, textTransform: "uppercase", letterSpacing: "0.3em", marginBottom: 16 }}>Markets</p>
          <h2 style={{ fontSize: "clamp(32px, 5vw, 52px)", fontWeight: 700, color: "white", marginBottom: 24 }}>
            Trade Across All Major Markets
          </h2>
          <p style={{ fontSize: "clamp(15px, 1.5vw, 18px)", color: "rgba(255,255,255,0.6)", maxWidth: 720, margin: "0 auto" }}>
            SetupFX offers trading opportunities across Forex, Crypto, Indices and Commodities. Every instrument is a market where traders can profit from real-time price movements.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }} transition={{ duration: 0.6, delay: 0.2 }}
          style={{ display: "flex", flexWrap: "wrap", gap: 16, justifyContent: "center" }}
        >
          {markets.map((market, i) => (
            <motion.div
              key={market.title}
              initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }} transition={{ duration: 0.4, delay: i * 0.1 }}
              style={{
                position: "relative",
                background: "#1a1a1f",
                borderRadius: 16,
                padding: "24px",
                width: "calc(50% - 8px)",
                minWidth: 240,
                maxWidth: 360,
                flex: "1 1 240px",
                border: "1px solid rgba(255,255,255,0.06)",
                cursor: "default",
                transition: "border-color 0.3s",
              }}
              whileHover={{ borderColor: "rgba(168,85,247,0.4)", y: -4 }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: "linear-gradient(135deg, #a855f7, #ec4899)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {market.icon}
                </div>
                <h3 style={{ color: "white", fontSize: 16, fontWeight: 600 }}>{market.title}</h3>
              </div>
              <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 14, lineHeight: 1.6 }}>{market.description}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  Bell,
  CandlestickChart,
  ChartNoAxesCombined,
  ClipboardList,
  Clock,
  ClockAlert,
  FileText,
  Gauge,
  KeyRound,
  LayoutDashboard,
  LineChart,
  Receipt,
  ShieldCheck,
  Smartphone,
  TerminalSquare,
  Wallet,
  Zap,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Features",
  description:
    "Every feature SetupFX Broker ships — live ticks, multi-segment trading, risk management, mobile-first UI, transparent fees.",
};

const SECTIONS: {
  title: string;
  intro: string;
  items: { icon: any; title: string; body: string }[];
}[] = [
  {
    title: "Trading terminal",
    intro: "A modern Charting-Library-powered terminal that doesn't fight you.",
    items: [
      { icon: CandlestickChart, title: "TradingView charts", body: "Full lightweight + advanced charting library, multiple resolutions, indicators, drawing tools." },
      { icon: TerminalSquare, title: "Pro order panel", body: "Market / Limit / SL-M orders. Bracket SL/TP attached to every entry. One-click trading mode." },
      { icon: Zap, title: "Optimistic fills", body: "Trades appear in your positions strip the moment you commit — server confirms in parallel." },
      { icon: LineChart, title: "Live option chain", body: "Strikes around ATM, parity-derived spot, ±15 levels around the money — refreshes every 2 s." },
      { icon: LayoutDashboard, title: "Multi-tab workspace", body: "Stack BTCUSD, NIFTY options, currency pairs side-by-side — switch contexts without re-loading." },
      { icon: ChartNoAxesCombined, title: "Live PnL cards", body: "Today's PnL, weekly, last week's — auto-refreshed on every tab navigation." },
    ],
  },
  {
    title: "Risk management",
    intro: "Built-in protection so a single bad print doesn't take you out.",
    items: [
      { icon: Gauge, title: "Margin call", body: "Equity ÷ used margin × 100 < your threshold → user pinged via real-time WebSocket banner." },
      { icon: ShieldCheck, title: "Auto stop-out", body: "Background enforcer auto-squares the worst losing position when stop-out level is breached." },
      { icon: ClockAlert, title: "Hold-time guards", body: "Profit / loss trade minimum hold seconds — stops latency-arbitrage scalping." },
      { icon: KeyRound, title: "Exit-only mode", body: "Admin can freeze entries during volatility. Existing positions can still be closed normally." },
      { icon: Clock, title: "Expiry auto-cleanup", body: "Day after expiry: contract drops from every watchlist + unsubscribes from the ticker." },
      { icon: Bell, title: "Price alerts", body: "Set a target / SL alert on any instrument — fires via web push the moment LTP crosses." },
    ],
  },
  {
    title: "Wallet & fees",
    intro: "Transparent down to the rupee. No surprises on settlement.",
    items: [
      { icon: Wallet, title: "Multi-channel deposits", body: "UPI auto-QR, bank transfer, ledger top-up. Same-day reconciliation." },
      { icon: Receipt, title: "Per-trade charge breakdown", body: "Brokerage + STT + GST + exchange + SEBI + stamp duty — itemised on every execution." },
      { icon: FileText, title: "Daily ledger", body: "Statement-grade ledger with running balance — exportable as PDF or CSV." },
      { icon: ClipboardList, title: "Capital gains report", body: "Quarterly + annual P&L statement formatted for ITR-2 / ITR-3 filing." },
    ],
  },
  {
    title: "Devices",
    intro: "Same account, same speed, every device.",
    items: [
      { icon: Smartphone, title: "Mobile-first UX", body: "Bottom-nav app feel on phones (Trade in the centre). Optimised for thumb reach." },
      { icon: TerminalSquare, title: "Desktop terminal", body: "Multi-monitor friendly. Chart + order panel + positions strip on a single screen." },
    ],
  },
];

export default function FeaturesPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-primary/5 to-background" />
        <div className="mx-auto max-w-7xl px-4 py-16 text-center sm:px-6 sm:py-20 lg:px-8">
          <span className="text-xs font-semibold uppercase tracking-wider text-primary">
            What's inside
          </span>
          <h1 className="mt-2 text-4xl font-bold tracking-tight sm:text-5xl">
            Every feature, on every account.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base text-muted-foreground sm:text-lg">
            No premium plan. No locked features. Open an account → unlock the
            whole product on day one.
          </p>
        </div>
      </section>

      {/* Sections */}
      {SECTIONS.map((sec) => (
        <section key={sec.title} className="border-b border-border last:border-b-0">
          <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
            <div className="max-w-2xl">
              <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                {sec.title}
              </span>
              <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
                {sec.intro}
              </h2>
            </div>

            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {sec.items.map((f) => {
                const Icon = f.icon;
                return (
                  <div
                    key={f.title}
                    className="rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40"
                  >
                    <div className="grid size-9 place-items-center rounded-md bg-primary/10 text-primary">
                      <Icon className="size-4" />
                    </div>
                    <h3 className="mt-3 text-sm font-semibold">{f.title}</h3>
                    <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                      {f.body}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      ))}

      {/* CTA */}
      <section className="bg-muted/20 py-14">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 text-center sm:flex-row sm:px-6 sm:text-left lg:px-8">
          <div>
            <h2 className="text-2xl font-bold">Ready to try?</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Open your account in under 5 minutes.
            </p>
          </div>
          <div className="flex gap-3">
            <Link
              href="/signup"
              className="inline-flex h-11 items-center gap-2 rounded-md bg-primary px-6 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Open account <ArrowRight className="size-4" />
            </Link>
            <Link
              href="/pricing"
              className="inline-flex h-11 items-center rounded-md border border-border px-6 text-sm font-semibold text-foreground hover:bg-background"
            >
              See pricing
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  CandlestickChart,
  Globe,
  ShieldCheck,
  Smartphone,
  Sparkles,
  TrendingUp,
  Wallet,
  Zap,
} from "lucide-react";

const FEATURES = [
  {
    icon: CandlestickChart,
    title: "All-in-one terminal",
    body: "Equities, F&O, currencies, commodities and crypto on a single fast chart with one-click trading.",
  },
  {
    icon: Zap,
    title: "Live Zerodha feed",
    body: "Real exchange ticks via Kite Connect for Indian markets; AllTick for crypto + forex — milliseconds, not seconds.",
  },
  {
    icon: ShieldCheck,
    title: "Risk controls",
    body: "Margin-call & stop-out auto-enforcement, exit-only mode, hold-time guards, daily expiry cleanup — built in.",
  },
  {
    icon: Wallet,
    title: "Transparent fees",
    body: "Flat segment-wise brokerage. No hidden charges. Full statutory breakdown on every trade — STT, GST, exchange, SEBI, stamp.",
  },
  {
    icon: Smartphone,
    title: "Mobile-first",
    body: "Bottom-nav app feel on your phone, full pro terminal on desktop. Same account, same speed everywhere.",
  },
  {
    icon: Globe,
    title: "24×7 segments",
    body: "Indian markets follow NSE / BSE / MCX hours. Crypto and forex trade round-the-clock — never miss a move.",
  },
];

const STATS = [
  { value: "10ms", label: "Order placement" },
  { value: "₹0", label: "Account opening" },
  { value: "14+", label: "Segments" },
  { value: "24×7", label: "Crypto & forex" },
];

export default function HomePage() {
  return (
    <>
      {/* ── Hero ──────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        {/* Background flourishes */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-primary/10 via-background to-background"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 left-1/2 -z-10 size-[600px] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl"
        />

        <div className="mx-auto max-w-7xl px-4 pb-16 pt-16 sm:px-6 sm:pt-20 lg:px-8 lg:pt-28">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <Sparkles className="size-3" />
              Built for serious Indian traders
            </span>
            <h1 className="mt-6 text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
              Trade the <span className="text-primary">whole market</span>
              <br className="hidden sm:block" /> on one fast terminal.
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              Equities, F&O, currencies, commodities and crypto — one account,
              one chart, one click to fire. SetupFX is the modern broker built
              for traders who need speed, transparent fees, and serious risk
              controls.
            </p>

            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/register"
                className="inline-flex h-11 items-center gap-2 rounded-md bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-colors hover:bg-primary/90"
              >
                Open free account <ArrowRight className="size-4" />
              </Link>
              <Link
                href="/login"
                className="inline-flex h-11 items-center gap-2 rounded-md border border-border bg-background px-6 text-sm font-semibold text-foreground hover:bg-muted/50"
              >
                Login to your account
              </Link>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              ₹0 account opening · No annual maintenance for the first year
            </p>
          </div>

          {/* Stats strip */}
          <div className="mx-auto mt-14 grid max-w-4xl grid-cols-2 gap-4 rounded-xl border border-border bg-card/60 p-4 backdrop-blur sm:grid-cols-4">
            {STATS.map((s) => (
              <div key={s.label} className="text-center">
                <div className="font-tabular text-2xl font-bold text-primary sm:text-3xl">
                  {s.value}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features grid ─────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <div className="max-w-2xl">
          <span className="text-xs font-semibold uppercase tracking-wider text-primary">
            Why SetupFX
          </span>
          <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            Everything you need to trade seriously.
          </h2>
          <p className="mt-3 text-muted-foreground">
            A modern broker built ground-up for Indian regulations + global
            asset classes. No legacy desktop clients, no hidden surcharges.
          </p>
        </div>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => {
            const Icon = f.icon;
            return (
              <div
                key={f.title}
                className="group relative overflow-hidden rounded-xl border border-border bg-card p-6 transition-all hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5"
              >
                <div className="grid size-10 place-items-center rounded-md bg-primary/10 text-primary">
                  <Icon className="size-5" />
                </div>
                <h3 className="mt-4 text-base font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {f.body}
                </p>
              </div>
            );
          })}
        </div>

        <div className="mt-10 text-center">
          <Link
            href="/features"
            className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
          >
            See all features <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </section>

      {/* ── Segments band ─────────────────────────────────────────── */}
      <section className="border-y border-border bg-muted/20 py-14">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                14+ segments
              </span>
              <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
                One account.
                <br />
                Every market that matters.
              </h2>
              <p className="mt-4 text-muted-foreground">
                NSE, BSE & MCX for Indian equities and derivatives. AllTick for
                global forex, crypto, metals and energy. No re-logging in to a
                separate platform when you want to switch.
              </p>
              <Link
                href="/features"
                className="mt-6 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
              >
                Browse segments <ArrowRight className="size-3.5" />
              </Link>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[
                "NSE Equity", "BSE Equity", "NSE F&O", "BSE F&O",
                "Currency", "Commodity", "Forex 24×5", "Crypto 24×7", "Gold/Silver",
              ].map((s) => (
                <div
                  key={s}
                  className="rounded-md border border-border bg-card px-3 py-3 text-center text-sm font-medium"
                >
                  {s}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-primary/10 px-6 py-12 text-center sm:px-12 sm:py-16">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-20 -top-20 size-72 rounded-full bg-primary/30 blur-3xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-24 -left-16 size-72 rounded-full bg-primary/20 blur-3xl"
          />
          <BarChart3 className="mx-auto size-10 text-primary" />
          <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
            Open your account in 5 minutes.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Aadhaar + PAN. Fully digital KYC. Funded the same day. Start trading
            with as little as ₹100.
          </p>
          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/register"
              className="inline-flex h-11 items-center gap-2 rounded-md bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90"
            >
              Open account <ArrowRight className="size-4" />
            </Link>
            <Link
              href="/pricing"
              className="inline-flex h-11 items-center gap-2 rounded-md border border-border bg-background px-6 text-sm font-semibold text-foreground hover:bg-muted/50"
            >
              See pricing
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

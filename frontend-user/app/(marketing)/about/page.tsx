import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Compass, Goal, Heart, Users } from "lucide-react";

export const metadata: Metadata = {
  title: "About",
  description:
    "Why we built SetupFX Broker — and where we're headed. The story behind India's modern multi-segment trading platform.",
};

const VALUES = [
  {
    icon: Compass,
    title: "Transparent",
    body:
      "We show every paisa of brokerage and statutory tax on every trade. No surcharge buried in a footnote.",
  },
  {
    icon: Goal,
    title: "Fast",
    body:
      "Sub-10 ms order placement. Live ticks from real exchange feeds. Charts that don't lag during a breakout.",
  },
  {
    icon: Heart,
    title: "Trader-first",
    body:
      "Built by traders. Every feature is something we wanted on the desk and the existing brokers wouldn't ship.",
  },
];

export default function AboutPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-primary/10 to-background" />
        <div className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6 sm:py-24 lg:px-8">
          <span className="text-xs font-semibold uppercase tracking-wider text-primary">
            About SetupFX
          </span>
          <h1 className="mt-2 text-4xl font-bold tracking-tight sm:text-5xl">
            A modern broker, built for the next decade of Indian traders.
          </h1>
          <p className="mt-5 text-base leading-relaxed text-muted-foreground sm:text-lg">
            We grew up trading on platforms that felt like they hadn't been
            updated since 2010. Slow charts, mystery charges, locked premium
            features, separate apps for every asset class. SetupFX is the
            broker we wished existed — one fast terminal, transparent fees, and
            every segment that matters on the same account.
          </p>
        </div>
      </section>

      {/* Mission */}
      <section className="mx-auto max-w-5xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-primary">
              Our mission
            </span>
            <h2 className="mt-2 text-3xl font-bold tracking-tight">
              Bring institutional-grade trading to every Indian.
            </h2>
            <p className="mt-4 text-muted-foreground">
              For too long the gap between retail and institutional trading
              tooling has been the moat that lets professionals win. We're
              closing that gap — same speed, same data, same risk controls,
              available to every account holder on day one.
            </p>
          </div>
          <div className="space-y-3">
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                What we believe
              </div>
              <ul className="mt-3 space-y-2 text-sm">
                <li>• Speed is a feature. Latency is a tax.</li>
                <li>• Hidden charges aren't pricing, they're misdirection.</li>
                <li>• Risk controls shouldn't be opt-in.</li>
                <li>• Mobile-first is non-negotiable in 2026.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Values */}
      <section id="values" className="border-y border-border bg-muted/20 py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <span className="text-xs font-semibold uppercase tracking-wider text-primary">
              What we stand for
            </span>
            <h2 className="mt-2 text-3xl font-bold tracking-tight">
              Three values that guide every release.
            </h2>
          </div>

          <div className="mt-10 grid gap-5 sm:grid-cols-3">
            {VALUES.map((v) => {
              const Icon = v.icon;
              return (
                <div
                  key={v.title}
                  className="rounded-xl border border-border bg-card p-6"
                >
                  <div className="grid size-10 place-items-center rounded-md bg-primary/10 text-primary">
                    <Icon className="size-5" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold">{v.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {v.body}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Team / Careers anchor */}
      <section id="team" className="mx-auto max-w-5xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <Users className="size-8 text-primary" />
            <h2 className="mt-4 text-3xl font-bold tracking-tight">
              A small team. Big ambition.
            </h2>
            <p className="mt-3 text-muted-foreground">
              We're builders who happen to trade. The team behind SetupFX has
              shipped at HFT firms, neobanks, and consumer fintechs across
              India and South-east Asia. We sit in Bengaluru and we ship every
              week.
            </p>
          </div>

          <div id="careers" className="rounded-xl border border-border bg-card p-6">
            <h3 className="text-base font-semibold">Careers</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              We're hiring senior engineers (Python / TypeScript), market-data
              specialists, and a brokerage-ops lead. If building serious trader
              tooling sounds like your thing —
            </p>
            <Link
              href="/contact?subject=careers"
              className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
            >
              Get in touch <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-primary/5 py-14">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 text-center sm:flex-row sm:px-6 sm:text-left lg:px-8">
          <div>
            <h2 className="text-2xl font-bold">Join us on the journey.</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Open an account or chat to us — we love hearing from traders.
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
              href="/contact"
              className="inline-flex h-11 items-center rounded-md border border-border px-6 text-sm font-semibold text-foreground hover:bg-background"
            >
              Contact us
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

import { useEffect, useRef } from 'react';
import SiteLayout from '../SiteLayout';
import { initForceField, initTextGlitch } from '../heroEffects';

const htmlContent = `
<!-- PAGE HERO -->
<section class="hero-forcefield-wrap" style="position:relative;width:100%;height:100vh;overflow:visible;background:#000">
  <div id="hero-forcefield" style="position:absolute;inset:0;width:100%;height:100%;z-index:0"></div>
  <div class="hero-glitch-content">
    <div class="hero-glitch-lines">
      <h1 class="text-glitch" data-text="ENTERPRISE TRADING" data-hover="SETUPFX24" data-delay="0">ENTERPRISE TRADING</h1>
      <h1 class="text-glitch" data-text="GLOBAL TRADING" data-hover="WORLD CLASS" data-delay="0.15">GLOBAL TRADING</h1>
      <h1 class="text-glitch" data-text="PLATFORM" data-hover="TECHNOLOGY" data-delay="0.3">PLATFORM</h1>
      <h1 class="text-glitch" data-text="SOLUTIONS" data-hover="SINCE 2023" data-delay="0.45">SOLUTIONS</h1>
    </div>
    <div style="display:flex;gap:0;border-top:0.5px solid rgba(255,255,255,0.1);border-bottom:0.5px solid rgba(255,255,255,0.1);margin-top:24px;max-width:600px;position:relative;z-index:10">
      <div style="flex:1;padding:16px 24px;border-right:0.5px solid rgba(255,255,255,0.1)"><div style="font-family:'Inter Tight',sans-serif;font-weight:900;font-size:28px;color:#6366f1">200+</div><div style="font-family:'JetBrains Mono',monospace;font-size:8px;letter-spacing:.3em;text-transform:uppercase;color:rgba(255,255,255,0.3);margin-top:4px">Platforms Deployed</div></div>
      <div style="flex:1;padding:16px 24px;border-right:0.5px solid rgba(255,255,255,0.1)"><div style="font-family:'Inter Tight',sans-serif;font-weight:900;font-size:28px;color:#6366f1">50+</div><div style="font-family:'JetBrains Mono',monospace;font-size:8px;letter-spacing:.3em;text-transform:uppercase;color:rgba(255,255,255,0.3);margin-top:4px">LP Integrations</div></div>
      <div style="flex:1;padding:16px 24px"><div style="font-family:'Inter Tight',sans-serif;font-weight:900;font-size:28px;color:#6366f1">99.98%</div><div style="font-family:'JetBrains Mono',monospace;font-size:8px;letter-spacing:.3em;text-transform:uppercase;color:rgba(255,255,255,0.3);margin-top:4px">Uptime SLA</div></div>
    </div>
    <div class="hero-glitch-cta" style="pointer-events:auto">
      <button class="btn-shimmer" onclick="location.href='contact.html'"><i class="fa-solid fa-rocket"></i>Book Consultation</button>
      <button class="btn-hero-ghost" onclick="location.href='pricing.html'">View Pricing<span class="btn-icon"><i class="fa-solid fa-arrow-right"></i></span></button>
    </div>
  </div>
</section>

<!-- ========================================
     SECTION 1 — CUSTOM TRADING PLATFORM
======================================== -->
<section class="sol-section" id="custom-dev">
  <div class="container">
    <div class="sec-label reveal">01 — Custom Development</div>
    <div class="sec-title reveal">Custom Trading Platform<br>&amp; App Development</div>
    <p class="sec-sub reveal">From web terminals to native mobile apps — we build production-grade trading software for live financial markets.</p>
    <div class="sol-content reveal">

      <p>We design and build end-to-end custom trading platforms tailored to the exact requirements of brokerages, hedge funds, prop firms, and retail trading operators. Whether you need a fully branded web-based terminal, native mobile apps, or a multi-device PWA solution — our engineering team delivers production-grade software built for the demands of live financial markets. Every component is architected for high availability, low latency, and regulatory compliance from day one.</p>

      <h3>What We Build</h3>
      <ul>
        <li><strong>Web-Based Trading Terminals</strong> — Full-featured browser platforms built with React and Next.js, featuring real-time charting, order management, portfolio analytics, and multi-asset support.</li>
        <li><strong>Native iOS &amp; Android Apps</strong> — High-performance mobile apps built with Swift, Kotlin, and Flutter. Includes biometric authentication, push alerts, and seamless portfolio management.</li>
        <li><strong>Desktop Trading Clients</strong> — Professional-grade desktop apps for Windows and Mac via Electron, offering multi-monitor support and advanced charting layouts.</li>
        <li><strong>PWA Trading Apps</strong> — Lightweight progressive web apps installable without app store approval, perfect for emerging markets.</li>
        <li><strong>Hybrid Multi-Device Platforms</strong> — Unified experience across web, mobile, and desktop with synchronized watchlists, orders, and preferences.</li>
      </ul>

      <h3>Technology Stack</h3>
      <p><strong>Frontend:</strong> React 18, Next.js 14, TypeScript, WebSocket, TradingView Lightweight Charts, custom D3.js visualizations. <strong>Backend:</strong> Node.js, Python (FastAPI), Go microservices. <strong>Database:</strong> PostgreSQL + TimescaleDB for tick data, Redis for caching. <strong>Infrastructure:</strong> Kubernetes, Docker, AWS/GCP multi-region. <strong>Protocols:</strong> FIX 4.4/5.0, REST, GraphQL, gRPC, WebSocket.</p>

      <h3>Trading UI/UX Design</h3>
      <p>Our UI/UX team specializes exclusively in financial technology. Charting engines powered by TradingView Lightweight Charts and custom D3.js visualizations, depth-of-market panels showing real-time Level 2 data, one-click trading, and advanced order types including market, limit, stop, trailing stop, OCO, and iceberg orders. Mobile-first design that adapts from a 6-inch phone to a 6-monitor desktop setup.</p>

      <h3>Multi-Asset &amp; White-Label</h3>
      <p>Support for Forex (600+ pairs), CFDs, equities, ETFs, futures, options, and cryptocurrency spot and derivatives. Every platform is white-label ready — custom domain, color schemes, logos, onboarding flows, email templates. Zero visible trace of our company. Delivered turnkey in 2-4 weeks.</p>

      <h3>Security &amp; Performance</h3>
      <p>KYC/AML SDK integration (Jumio, Onfido, Sum&amp;Substance), 2FA, biometric login, RBAC, audit logs, GDPR-ready. Sub-5ms order execution latency, 100,000+ concurrent users, 99.99% uptime SLA. 24/7 monitoring with SLA guarantees and dedicated account manager.</p>
    </div>

    <div class="sol-feat-grid reveal">
      <div class="sol-feat-card"><div class="sol-feat-icon"><i class="fa-solid fa-chart-line"></i></div><div class="sol-feat-title">Multi-Asset Trading</div><div class="sol-feat-desc">Forex, Stocks, Crypto, Commodities &amp; more</div></div>
      <div class="sol-feat-card"><div class="sol-feat-icon"><i class="fa-solid fa-chart-area"></i></div><div class="sol-feat-title">Real-Time Charts</div><div class="sol-feat-desc">TradingView integration with 100+ indicators</div></div>
      <div class="sol-feat-card"><div class="sol-feat-icon"><i class="fa-solid fa-bolt"></i></div><div class="sol-feat-title">One-Click Execution</div><div class="sol-feat-desc">Sub-5ms order routing architecture</div></div>
      <div class="sol-feat-card"><div class="sol-feat-icon"><i class="fa-solid fa-mobile-screen"></i></div><div class="sol-feat-title">Mobile Native Apps</div><div class="sol-feat-desc">iOS &amp; Android built with Flutter</div></div>
      <div class="sol-feat-card"><div class="sol-feat-icon"><i class="fa-solid fa-tag"></i></div><div class="sol-feat-title">White-Label Ready</div><div class="sol-feat-desc">Full rebrand in 2-4 weeks</div></div>
      <div class="sol-feat-card"><div class="sol-feat-icon"><i class="fa-solid fa-link"></i></div><div class="sol-feat-title">FIX Protocol</div><div class="sol-feat-desc">Industry-standard FIX 4.4/5.0 connectivity</div></div>
      <div class="sol-feat-card"><div class="sol-feat-icon"><i class="fa-solid fa-language"></i></div><div class="sol-feat-title">Multi-Language</div><div class="sol-feat-desc">30+ languages with RTL support</div></div>
      <div class="sol-feat-card"><div class="sol-feat-icon"><i class="fa-solid fa-circle-half-stroke"></i></div><div class="sol-feat-title">Dark/Light Themes</div><div class="sol-feat-desc">Customizable UI theming system</div></div>
    </div>
  </div>
</section>

<!-- ========================================
     SECTION 2 — LIQUIDITY
======================================== -->
<section class="sol-section sol-section-alt" id="liquidity">
  <div class="container">
    <div class="sec-label reveal">02 — Liquidity</div>
    <div class="sec-title reveal">Liquidity Provider Integration<br>&amp; Aggregation</div>
    <p class="sec-sub reveal">We connect your platform to the world's leading LPs, build custom aggregation engines, and configure bridge technology for best execution.</p>
    <div class="sol-content reveal">

      <h3>Why Liquidity Integration Matters</h3>
      <p>Poor liquidity results in wide spreads, requotes, slippage, and partial fills — eroding client confidence. Regulators scrutinize best execution obligations. Our framework ensures competitive pricing, transparent execution, and regulatory compliance. Proper liquidity architecture is critical for chart rendering, risk management, and margin engine precision.</p>

      <h3>Prime-of-Prime vs Tier-1</h3>
      <p>Tier-1 means direct connections to Citi, Deutsche Bank, UBS — tightest raw spreads but requires $5M+ capital. Prime-of-Prime providers (IS Prime, B2Prime, CFH) aggregate Tier-1 liquidity for mid-size brokers with lower requirements. We recommend hybrid approaches, combining PoP for standard flow with direct bank connections for large institutional orders.</p>

      <h3>Providers We Integrate</h3>
      <div class="sol-badges">
        <span class="sol-badge">Integral OCX</span><span class="sol-badge">IS Prime</span><span class="sol-badge">B2Prime</span><span class="sol-badge">Finalto</span><span class="sol-badge">CFH Clearing</span><span class="sol-badge">LMAX Exchange</span><span class="sol-badge">Leverate</span><span class="sol-badge">OneZero</span><span class="sol-badge">PrimeXM</span><span class="sol-badge">Advanced Markets</span><span class="sol-badge">Sucden Financial</span><span class="sol-badge">Saxo Bank Prime</span><span class="sol-badge">Marex Prime</span><span class="sol-badge">X Open Hub</span><span class="sol-badge">Binance</span><span class="sol-badge">Coinbase Prime</span><span class="sol-badge">B2C2</span><span class="sol-badge">Cumberland</span>
      </div>

      <h3>Aggregation Engine &amp; Bridge Technology</h3>
      <p>Our proprietary aggregation layer pulls prices from multiple LPs simultaneously with Smart Order Routing — evaluating spread, depth, fill rates, and latency to route each order optimally. Configurable markup, slippage tolerance, partial fill handling, and automatic retry to secondary LP. We deploy OneZero Hub, PrimeXM XCore, and custom bridge solutions with failover in under 50ms.</p>

      <h3>Execution Models</h3>
      <ul>
        <li><strong>A-Book (STP/ECN)</strong> — Every order passed to LP. Broker earns from spread markup or commission. Zero market risk.</li>
        <li><strong>B-Book (Market Making)</strong> — Broker internalizes trades. Higher revenue but requires risk management dashboards and hedging triggers.</li>
        <li><strong>Hybrid</strong> — Small retail flow internalized, large/profitable flow routed to LPs. Automatic classification rules per account profitability and trade size.</li>
      </ul>

      <h3>Spread Management &amp; Colocation</h3>
      <p>Configurable markup per instrument and account group. Dynamic spread widening during news events. Equinix NY4/LD4/TY3 colocation with sub-1ms LP connectivity. Crypto liquidity via Binance, Coinbase Prime, Kraken, B2C2, and Cumberland for 24/7 digital asset markets.</p>
    </div>
  </div>
</section>

<!-- ========================================
     SECTION 3 — MARKET DATA FEEDS
======================================== -->
<section class="sol-section" id="data-feeds">
  <div class="container">
    <div class="sec-label reveal">03 — Market Data</div>
    <div class="sec-title reveal">Real-Time Market Data<br>Feed Infrastructure</div>
    <p class="sec-sub reveal">Enterprise-grade data infrastructure delivering tick-accurate pricing, Level 2 data, economic calendars, and corporate actions in real time.</p>
    <div class="sol-content reveal">

      <h3>Data Vendors We Integrate</h3>
      <div class="sol-badges">
        <span class="sol-badge">Refinitiv Elektron</span><span class="sol-badge">Bloomberg B-PIPE</span><span class="sol-badge">ICE Data Services</span><span class="sol-badge">SIX Financial</span><span class="sol-badge">FactSet</span><span class="sol-badge">Morningstar</span><span class="sol-badge">Nasdaq Data Link</span><span class="sol-badge">CryptoCompare</span><span class="sol-badge">CoinGecko Pro</span><span class="sol-badge">Kaiko</span>
      </div>

      <h3>Feed Types &amp; Protocols</h3>
      <p>Level 2 full order book, Level 1 top-of-book, trade prints, historical OHLCV, corporate actions, economic calendar events, and news sentiment feeds. Implemented via FIX/FAST, ITCH/OUCH, WebSocket, HTTP/2 SSE, Apache Kafka (1M+ events/sec), and AMQP/RabbitMQ.</p>

      <h3>Normalization &amp; Distribution</h3>
      <p>Unified normalization layer standardizing symbols, timestamps, and decimal precision across all vendors into one canonical format. Publish-subscribe architecture fans out simultaneously to trading terminals (WebSocket), risk engine (Kafka), charting service, and historical storage (TimescaleDB).</p>

      <div class="sol-flow reveal">
        <div class="sol-flow-box">Data Sources</div>
        <div class="sol-flow-arrow">→</div>
        <div class="sol-flow-box accent">Normalization Engine</div>
        <div class="sol-flow-arrow">→</div>
        <div class="sol-flow-box">Distribution Layer</div>
        <div class="sol-flow-arrow">→</div>
        <div class="sol-flow-outputs">
          <div class="sol-flow-box">Trading Terminal</div>
          <div class="sol-flow-box">Risk Engine</div>
          <div class="sol-flow-box">Charts &amp; Storage</div>
        </div>
      </div>

      <h3>Latency &amp; Storage</h3>
      <p>Kernel bypass networking (DPDK), FPGA-based feed handlers, Equinix co-location, multicast UDP broadcast — reducing feed-to-screen latency to under 5ms. Tick-by-tick storage in TimescaleDB with automatic partitioning. Fast OHLCV aggregation and data replay API for backtesting. S3 archival for regulatory retention.</p>

      <h3>Economic Calendar &amp; Regulatory</h3>
      <p>Real-time calendar feeds with impact scoring. Pre-news spread automation triggers. Best execution reporting data, MiFID II transaction reporting, NFA/CFTC trade reporting infrastructure.</p>
    </div>
  </div>
</section>

<!-- ========================================
     SECTION 4 — EXCHANGE SOFTWARE
======================================== -->
<section class="sol-section sol-section-alt" id="exchange">
  <div class="container">
    <div class="sec-label reveal">04 — Exchange</div>
    <div class="sec-title reveal">Custom Exchange &amp; Matching<br>Engine Development</div>
    <p class="sec-sub reveal">Proprietary exchange infrastructure — CEX, DEX, hybrid models, ECNs, and dark pools with microsecond-level matching.</p>
    <div style="margin:40px 0;border:0.5px solid rgba(255,255,255,0.1);overflow:hidden" class="reveal"><img src="/landing/img/site/solutions.jpg" alt="Exchange Development Team" style="width:100%;display:block;opacity:0.85;max-height:360px;object-fit:cover" /></div>
    <div class="sol-content reveal">

      <h3>Exchange Types</h3>
      <ul>
        <li><strong>CEX</strong> — Centralized, custodial, regulated. Traditional model for most financial markets.</li>
        <li><strong>DEX</strong> — Non-custodial, smart contract-based. Users retain asset custody. AMM or on-chain order book.</li>
        <li><strong>Hybrid</strong> — CEX performance with DEX settlement. Off-chain matching, on-chain transparency.</li>
        <li><strong>Dark Pool</strong> — Institutional block trading with hidden orders to prevent market impact.</li>
        <li><strong>ECN / MTF</strong> — Direct market access with transparent order book and anonymous execution.</li>
      </ul>

      <h3>Matching Engine</h3>
      <p>Built in C++/Rust. FIFO, Pro-Rata, and Price-Time Priority algorithms. 1M+ orders/second throughput, sub-microsecond matching latency. In-memory order book with lock-free data structures and persistent journaling. Supports market, limit, stop, trailing stop, OCO, FOK, IOC, GTC, GTD, hidden, and iceberg orders.</p>

      <h3>Settlement, Risk &amp; Smart Contracts</h3>
      <p>T+0, T+1, T+2 settlement with multi-currency support. Crypto atomic swap settlement. Pre-trade risk checks (margin, position limits, credit limits), real-time P&amp;L, VaR, margin call automation, liquidation engine. For DEX: Solidity/Rust smart contracts, Uniswap V3 AMM model, liquidity pool management.</p>

      <h3>Technology &amp; Availability</h3>
      <p>Go/Rust core, Kafka streaming, Redis cache, PostgreSQL + ClickHouse analytics, React admin, gRPC + REST + WebSocket APIs. Active-active across 3 AZs, geo-redundant (NY + London + Singapore), DR RTO &lt; 30 seconds, 99.999% uptime target.</p>

      <table class="sol-table reveal">
        <thead><tr><th>Feature</th><th>CEX</th><th>DEX</th><th>Hybrid</th></tr></thead>
        <tbody>
          <tr><td>Custody</td><td>Exchange-held</td><td>User self-custody</td><td>User-controlled + escrow</td></tr>
          <tr><td>Speed</td><td>Microseconds</td><td>Block time (seconds)</td><td>Off-chain match, on-chain settle</td></tr>
          <tr><td>Compliance</td><td>Full KYC/AML</td><td>Optional/limited</td><td>Configurable per jurisdiction</td></tr>
          <tr><td>Gas Fees</td><td>None</td><td>Per transaction</td><td>Settlement only</td></tr>
          <tr><td>Liquidity</td><td>Order book depth</td><td>AMM liquidity pools</td><td>Both combined</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</section>

<!-- ========================================
     SECTION 5 — IB PLATFORM
======================================== -->
<section class="sol-section" id="ib-platform">
  <div class="container">
    <div class="sec-label reveal">05 — IB Management</div>
    <div class="sec-title reveal">Introducing Broker Portal<br>&amp; Commission System</div>
    <p class="sec-sub reveal">Automated, scalable IB management — multi-level hierarchies, real-time commissions, and fully brandable partner portals.</p>
    <div class="sol-content reveal">

      <h3>Commission Structures</h3>
      <ul>
        <li><strong>CPA</strong> — Fixed payment per qualified client deposit</li>
        <li><strong>Revenue Share</strong> — Percentage of spread/commission per trade, real-time calculation</li>
        <li><strong>Lot-Based Rebates</strong> — Fixed payment per standard lot traded</li>
        <li><strong>Hybrid CPA + RevShare</strong> — Upfront CPA plus ongoing revenue share</li>
        <li><strong>Tiered Volume</strong> — Rates increase with IB volume growth</li>
        <li><strong>Sub-IB Overrides</strong> — Master IBs earn on sub-IB earnings, cascading through hierarchy</li>
      </ul>

      <h3>Multi-Level Hierarchy</h3>
      <p>Up to 10 levels deep with automatic commission cascading. Real-time tree visualization with client counts, volumes, and commissions at each node.</p>

      <div class="sol-hier reveal">
        <div class="sol-hier-row"><div class="sol-hier-box hl">Master IB</div></div>
        <div class="sol-hier-line"></div>
        <div class="sol-hier-row"><div class="sol-hier-box">Sub-IB L1</div><div class="sol-hier-box">Sub-IB L1</div><div class="sol-hier-box">Sub-IB L1</div></div>
        <div class="sol-hier-line"></div>
        <div class="sol-hier-row"><div class="sol-hier-box">Sub-IB L2</div><div class="sol-hier-box">Sub-IB L2</div><div class="sol-hier-box">Sub-IB L2</div><div class="sol-hier-box">Sub-IB L2</div></div>
        <div class="sol-hier-line"></div>
        <div class="sol-hier-row"><div class="sol-hier-box" style="color:rgba(255,255,255,0.4)">Clients</div></div>
      </div>

      <h3>Portal Features &amp; Marketing Tools</h3>
      <p>Personal dashboard with real-time commissions, referral link generator with UTM tracking, banner ad library, landing page builder, conversion funnel analytics. Client list with trading activity, deposit/withdrawal history. Automatic commission calculation, payment gateway integration (bank wire, crypto, e-wallets), configurable payout scheduling.</p>

      <h3>White-Label &amp; Compliance</h3>
      <p>Fully brandable — custom domain, logo, colors, email templates. IB agreement management with e-signature, KYC for IB partners, audit logging. Admin tools for approval/rejection, manual commission adjustments, caps, and blocking.</p>
    </div>
  </div>
</section>

<!-- ========================================
     SECTION 6 — PAMM / MAMM
======================================== -->
<section class="sol-section sol-section-alt" id="pamm-mamm">
  <div class="container">
    <div class="sec-label reveal">06 — Fund Management</div>
    <div class="sec-title reveal">PAMM &amp; MAMM Fund<br>Management Platform</div>
    <p class="sec-sub reveal">Professional money management with real-time allocation, institutional fee structures, and bulletproof investor protection.</p>
    <div class="sol-content reveal">

      <h3>PAMM vs MAMM</h3>
      <p><strong>PAMM</strong> — Investors allocate capital to a fund. Manager trades from master account, profits/losses distributed proportionally by equity share. Best for pooled investment structures. <strong>MAMM</strong> — Manager directly controls multiple individual accounts. Trades replicated across all linked accounts. Preferred for personalized strategies and account segregation requirements.</p>

      <h3>Allocation Methods</h3>
      <ul>
        <li><strong>Lot-Based</strong> — Pre-configured lot sizes per investor. Simple, predictable.</li>
        <li><strong>Equity-Based</strong> — Proportional to current equity relative to total fund. Most fair and common.</li>
        <li><strong>Balance-Based</strong> — Uses account balance, ignoring unrealized P&amp;L. Simpler calculation.</li>
        <li><strong>Custom Weighting</strong> — Manager assigns custom percentages per investor.</li>
      </ul>

      <h3>Fee Structure</h3>
      <p>High-water mark performance fees (10%-30% of new profits), hurdle rate configuration, AUM-based management fees (1-2% annual), and crystallization periods (monthly/quarterly/annual). All calculations auditable by investors and regulators.</p>

      <div class="sol-flow reveal">
        <div class="sol-flow-box hl">Manager Account</div>
        <div class="sol-flow-arrow">→</div>
        <div class="sol-flow-box accent">Allocation Engine</div>
        <div class="sol-flow-arrow">→</div>
        <div class="sol-flow-outputs">
          <div class="sol-flow-box">Investor A — 40%</div>
          <div class="sol-flow-box">Investor B — 35%</div>
          <div class="sol-flow-box">Investor C — 25%</div>
        </div>
      </div>

      <h3>Portals &amp; Risk Controls</h3>
      <p>Investor portal: browse funds, view equity curves, Sharpe ratio, max drawdown, monthly returns, join/leave during windows. Fund manager portal: trade from master, view allocation breakdown, set entry/exit windows. Risk: maximum drawdown auto-close, max lot per investor, stop-out protection, leverage caps. Technology: MT4/MT5 API replication, Python allocation microservice, React portals, PostgreSQL NAV calculations.</p>
    </div>
  </div>
</section>

<!-- ========================================
     SECTION 7 — PROP TRADING
======================================== -->
<section class="sol-section" id="prop-trading">
  <div class="container">
    <div class="sec-label reveal">07 — Prop Trading</div>
    <div class="sec-title reveal">Proprietary Trading Platform<br>&amp; Funded Trader Challenges</div>
    <p class="sec-sub reveal">Complete infrastructure for prop trading firms — from challenge purchase to rules engine to payout system.</p>
    <div class="sol-content reveal">

      <h3>Challenge System</h3>
      <p>Multi-phase evaluation with automated rule enforcement. Phase 1: reach profit target (8-10%) within risk limits. Phase 2: verification at lower target (5%) confirming consistency. Funded: real capital with configurable profit split (80/20 to 90/10). Challenge types: one-step, two-step, instant funding, aggressive, and swing — all configurable per firm.</p>

      <div class="sol-phases reveal">
        <div class="sol-phase"><div class="sol-phase-num">01</div><div class="sol-phase-title">Evaluation</div><div class="sol-phase-desc">Reach profit target within risk limits. Minimum trading days required.</div></div>
        <div class="sol-phase"><div class="sol-phase-num">02</div><div class="sol-phase-title">Verification</div><div class="sol-phase-desc">Confirm consistency with lower target. Same risk rules apply.</div></div>
        <div class="sol-phase"><div class="sol-phase-num">03</div><div class="sol-phase-title">Funded</div><div class="sol-phase-desc">Trade with real capital. Profit split paid monthly.</div></div>
      </div>

      <h3>Rules Engine</h3>
      <p>Real-time monitoring of every open position: maximum daily loss limit, overall drawdown limit, minimum trading days, profit target tracking. On breach: instant trading freeze, position closure, automated notification (email + SMS + push), admin flagging. Optional restrictions: news trading block (FOMC/NFP), weekend holding restriction, EA/copy trading toggle.</p>

      <h3>Trader Dashboard</h3>
      <p>Real-time compliance meters — daily loss used vs max, drawdown vs limit, profit progress bar, days traded counter, live P&amp;L, open positions. Updates via WebSocket on every tick. Gamification: public leaderboard, badges, trader profiles, certificates. Affiliate system with referral tracking and promo codes.</p>

      <h3>Payout &amp; Scaling</h3>
      <p>Configurable profit split with compliance checks before approval. Bank wire and crypto disbursement. Automated scaling plan — after consecutive profitable months, account size increases. Milestone tracking. White-label: fully brandable prop trading platform matching FTMO/Funded Trader model.</p>
    </div>
  </div>
</section>

<!-- ========================================
     SECTION 8 — COPY TRADING
======================================== -->
<section class="sol-section sol-section-alt" id="copy-trading">
  <div class="container">
    <div class="sec-label reveal">08 — Copy Trading</div>
    <div class="sec-title reveal">Copy Trading &amp; Social<br>Trading Network</div>
    <p class="sec-sub reveal">Proprietary copy trading infrastructure — own the capability natively without third-party platform dependencies.</p>
    <div class="sol-content reveal">

      <h3>Signal Provider Portal</h3>
      <p>Traders apply as signal providers. Verification includes minimum trading history, performance thresholds (win rate, max drawdown, Sharpe ratio), and optional manual review. Public profiles display comprehensive real-time stats: win rate, avg risk/reward, monthly returns, followers count, AUM copied.</p>

      <h3>Investor/Copier Portal</h3>
      <p>Browse signal providers with filters: asset class, risk level, monthly return, drawdown tolerance, track record length. Configure copy: fixed lot / proportional / equity-based allocation, max positions, daily loss limit. Start/stop copying with one click.</p>

      <h3>Replication Engine &amp; Risk Controls</h3>
      <p>Custom engine copies trades in sub-50ms latency. Handles lot scaling, partial fills, and high-frequency queue management. Risk controls: max drawdown auto-unsubscribe, max lot per copy, max open trades, daily loss limit. Automatic alerts on approaching thresholds.</p>

      <h3>Fees, Social &amp; Technology</h3>
      <p>Three fee models: performance fee (% of profits), subscription fee (monthly), spread markup. Social features: comments, ratings, follow-without-copy, activity feeds. Leaderboard ranked by return, Sharpe, followers, AUM. Built with Go replication service, WebSocket real-time updates, React portals, PostgreSQL + TimescaleDB. iOS/Android apps with push notifications. MiFID II suitability assessment and risk warnings included.</p>
    </div>
  </div>
</section>

<!-- CTA -->
<section class="cta-section">
  <div class="cta-box reveal">
    <div class="cta-bg-light l1"></div>
    <div class="cta-bg-light l2"></div>
    <div class="cta-inner">
      <div class="cta-title">Ready to Build Your<br>Trading Infrastructure?</div>
      <p class="cta-sub">Book a free 60-minute consultation with our trading platform architects. Project roadmap delivered within 48 hours.</p>
      <div class="cta-btns">
        <a href="/contact" class="btn-white">Book Free Consultation</a>
        <a href="/pricing" class="btn-outline-white">View Pricing</a>
      </div>
    </div>
  </div>
</section>

<!-- FOOTER -->
`;

export default function SolutionsPage() {
  const contentRef = useRef(null);

  useEffect(() => {
    window.scrollTo(0, 0);
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
    }, { threshold: 0.1 });
    document.querySelectorAll('.reveal').forEach(el => obs.observe(el));

    document.querySelectorAll('.dm-tab').forEach(tab => {
      tab.addEventListener('click', function() {
        document.querySelectorAll('.dm-tab').forEach(t => t.classList.remove('active'));
        this.classList.add('active');
      });
    });

    const stepsFill = document.querySelector('.steps-line-fill');
    if (stepsFill) {
      const so = new IntersectionObserver((entries) => {
        entries.forEach(e => { if (e.isIntersecting) stepsFill.style.width = '100%'; });
      }, { threshold: 0.3 });
      so.observe(stepsFill.parentElement || stepsFill);
    }

    const track = document.querySelector('.testimonials-track');
    if (track && !track.dataset.cloned) {
      track.innerHTML += track.innerHTML;
      track.dataset.cloned = 'true';
    }

    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const scripts = [];
    const load = (src) => new Promise((resolve) => {
      if (document.querySelector('script[src="' + src + '"]')) { resolve(); return; }
      const s = document.createElement('script'); s.src = src; s.onload = resolve;
      document.body.appendChild(s); scripts.push(s);
    });
    load('https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.9.4/p5.min.js')
      .then(() => { setTimeout(initForceField, 100); });
    load('https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js')
      .then(() => { setTimeout(initTextGlitch, 100); });
    return () => scripts.forEach(s => { try { s.remove(); } catch(e){} });
  }, []);
  return (
    <SiteLayout>
      <div ref={contentRef} dangerouslySetInnerHTML={{ __html: htmlContent }} />
    </SiteLayout>
  );
}

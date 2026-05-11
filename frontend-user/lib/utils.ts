import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const inrFmt = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});

const numFmt = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});

export function formatINR(value: number | string | null | undefined, opts?: { withSymbol?: boolean }) {
  if (value === null || value === undefined || value === "") return opts?.withSymbol === false ? "0.00" : "₹ 0.00";
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return opts?.withSymbol === false ? "0.00" : "₹ 0.00";
  return opts?.withSymbol === false ? numFmt.format(n) : inrFmt.format(n).replace("₹", "₹ ");
}

export function formatNumber(value: number | string | null | undefined, fractionDigits = 2) {
  if (value === null || value === undefined || value === "") return "0";
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "0";
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
  }).format(n);
}

export function formatPercent(value: number | string | null | undefined, fractionDigits = 2) {
  if (value === null || value === undefined || value === "") return "0.00%";
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "0.00%";
  return `${n >= 0 ? "+" : ""}${n.toFixed(fractionDigits)}%`;
}

export function pnlColor(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? Number(value) : (value ?? 0);
  if (!Number.isFinite(n) || n === 0) return "text-muted-foreground";
  return n > 0 ? "text-profit" : "text-loss";
}

/** True when the segment/exchange trades in USD on the source feed.
 *  AllTick-mirrored instruments live on virtual exchange `CDS` (forex,
 *  metals XAU/XAG/XPT/XPD, energy USOIL/UKOIL/NATGAS) regardless of segment
 *  string, so checking exchange catches everything segment alone would miss. */
export function isUsdSegment(segmentOrExchange?: string | null): boolean {
  const s = (segmentOrExchange ?? "").toUpperCase();
  return /CRYPTO|FOREX|FX|CDS/.test(s);
}

/** Format a market price respecting source-feed currency: $ for AllTick
 *  (forex / crypto / metals / energy), ₹ for Indian instruments. Pass
 *  `exchange` too whenever you have it — XAUUSD's segment is `COMMODITIES`
 *  but its exchange is `CDS`, so segment alone misclassifies it. */
export function formatPrice(
  value: number | string | null | undefined,
  segment?: string | null,
  exchange?: string | null,
): string {
  const n = typeof value === "string" ? Number(value) : (value ?? 0);
  if (!Number.isFinite(n)) return "—";
  if (isUsdSegment(segment) || isUsdSegment(exchange)) {
    const isCrypto = /CRYPTO/.test((segment ?? "").toUpperCase()) ||
      /CRYPTO/.test((exchange ?? "").toUpperCase());
    const decimals = isCrypto ? 2 : 4;
    return `$${n.toFixed(decimals)}`;
  }
  return formatINR(n);
}

/** Parse a backend datetime string. If no timezone is present, treat it as UTC.
 * Backend stores UTC but historically serialised as `2026-05-09T09:41:18` with
 * no offset, which JS otherwise interprets as the browser's local timezone. */
export function parseBackendDate(v: string | Date | null | undefined): Date | null {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  const hasTz = /[zZ]|[+-]\d{2}:?\d{2}$/.test(v);
  const d = new Date(hasTz ? v : v + "Z");
  return isNaN(d.getTime()) ? null : d;
}

/** Format a backend datetime as Indian Standard Time (e.g. `09 May, 09:41 am IST`). */
export function formatIST(
  v: string | Date | null | undefined,
  opts?: { withSeconds?: boolean }
): string {
  const d = parseBackendDate(v);
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: opts?.withSeconds ? "2-digit" : undefined,
    hour12: true,
  }).format(d) + " IST";
}

export function relativeTime(date: string | Date): string {
  const d = parseBackendDate(date);
  if (!d) return "—";
  const diff = Date.now() - d.getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return d.toLocaleDateString("en-IN");
}

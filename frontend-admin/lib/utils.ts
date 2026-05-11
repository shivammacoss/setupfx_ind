import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const inrFmt = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

export function formatINR(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return "₹ 0.00";
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "₹ 0.00";
  return inrFmt.format(n).replace("₹", "₹ ");
}

export function formatNumber(value: number | string | null | undefined, fractionDigits = 0) {
  if (value === null || value === undefined || value === "") return "0";
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "0";
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
  }).format(n);
}

export function pnlColor(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? Number(value) : (value ?? 0);
  if (!Number.isFinite(n) || n === 0) return "text-muted-foreground";
  return n > 0 ? "text-profit" : "text-loss";
}

export function formatPercent(
  value: number | string | null | undefined,
  fractionDigits = 2,
): string {
  if (value === null || value === undefined || value === "") return "0.00%";
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "0.00%";
  return `${n >= 0 ? "+" : ""}${n.toFixed(fractionDigits)}%`;
}

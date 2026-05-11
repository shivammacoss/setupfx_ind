"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/common/PageHeader";
import { DepositsPanel } from "@/components/admin/payments/DepositsPanel";
import { WithdrawalsPanel } from "@/components/admin/payments/WithdrawalsPanel";
import { RejectedPanel } from "@/components/admin/payments/RejectedPanel";
import { BankAccountsPanel } from "@/components/admin/payments/BankAccountsPanel";
import { cn } from "@/lib/utils";

type Tab = "deposits" | "withdrawals" | "rejected" | "banks";

const TABS: { id: Tab; label: string; description: string }[] = [
  { id: "deposits", label: "Deposits", description: "User-initiated deposit requests — review proof, approve to credit wallet, or reject with reason." },
  { id: "withdrawals", label: "Withdrawals", description: "User withdrawal requests — verify bank, approve with UTR to debit, or reject with reason." },
  { id: "rejected", label: "Rejected", description: "Read-only history of all rejected deposits and withdrawals with the reason given." },
  { id: "banks", label: "Bank Accounts", description: "Bank accounts, UPI IDs and QR codes shown to users on the deposit form." },
];

export default function PaymentsPage() {
  const sp = useSearchParams();
  const initialTab = (sp.get("tab") as Tab) || "deposits";
  const [tab, setTab] = useState<Tab>(initialTab);
  const meta = TABS.find((t) => t.id === tab) ?? TABS[0];

  return (
    <div className="space-y-4">
      <PageHeader title="Payments" description={meta.description} />

      <div className="sticky top-0 z-20 -mx-4 overflow-x-auto border-b border-border bg-background/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/60 scrollbar-thin">
        <div className="inline-flex min-w-full gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium transition-colors",
                tab === t.id
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "deposits" && <DepositsPanel />}
      {tab === "withdrawals" && <WithdrawalsPanel />}
      {tab === "rejected" && <RejectedPanel />}
      {tab === "banks" && <BankAccountsPanel />}
    </div>
  );
}

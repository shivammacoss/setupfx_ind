"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { LedgerAdminAPI } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PageHeader } from "@/components/common/PageHeader";
import { DataTable, type Column } from "@/components/common/DataTable";
import { StatusPill } from "@/components/common/StatusPill";
import { formatINR, pnlColor } from "@/lib/utils";

export default function MasterLedgerPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [type, setType] = useState("");

  const { data, isFetching } = useQuery({
    queryKey: ["admin", "ledger", { type, page }],
    queryFn: () => LedgerAdminAPI.list({ transaction_type: type || undefined, page, page_size: 50 }),
  });

  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ user_id: "", amount: "", transaction_type: "ADJUSTMENT", narration: "" });

  async function create() {
    if (!form.user_id || !form.amount || !form.narration) {
      toast.error("All fields required");
      return;
    }
    try {
      await LedgerAdminAPI.manualEntry({ ...form, amount: Number(form.amount) });
      toast.success("Manual entry posted");
      setCreating(false);
      setForm({ user_id: "", amount: "", transaction_type: "ADJUSTMENT", narration: "" });
      qc.invalidateQueries({ queryKey: ["admin", "ledger"] });
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  const cols: Column<any>[] = [
    { key: "created_at", header: "When", render: (r) => new Date(r.created_at).toLocaleString() },
    { key: "user_code", header: "User" },
    { key: "transaction_type", header: "Type", render: (r) => <StatusPill status={r.transaction_type} /> },
    { key: "narration", header: "Narration", className: "max-w-[300px] truncate" },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      render: (r) => <span className={pnlColor(r.amount)}>{formatINR(r.amount)}</span>,
    },
    { key: "balance_after", header: "Balance", align: "right", render: (r) => formatINR(r.balance_after) },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Master ledger"
        description={`${data?.meta?.total ?? 0} ledger entries`}
        actions={
          <div className="flex gap-2">
            <select
              value={type}
              onChange={(e) => {
                setPage(1);
                setType(e.target.value);
              }}
              className="h-10 rounded-md border border-border bg-background px-3 text-sm"
            >
              <option value="">All types</option>
              <option value="DEPOSIT">Deposit</option>
              <option value="WITHDRAWAL">Withdrawal</option>
              <option value="TRADE">Trade</option>
              <option value="BROKERAGE">Brokerage</option>
              <option value="CHARGES">Charges</option>
              <option value="ADJUSTMENT">Adjustment</option>
              <option value="BONUS">Bonus</option>
              <option value="PENALTY">Penalty</option>
            </select>
            <Dialog open={creating} onOpenChange={setCreating}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="size-4" /> Manual entry
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Manual ledger entry</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>User ID</Label>
                    <Input
                      value={form.user_id}
                      onChange={(e) => setForm((f) => ({ ...f, user_id: e.target.value }))}
                      placeholder="User Mongo ObjectId"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Amount (negative to debit)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={form.amount}
                      onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Type</Label>
                    <select
                      value={form.transaction_type}
                      onChange={(e) => setForm((f) => ({ ...f, transaction_type: e.target.value }))}
                      className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                    >
                      <option value="ADJUSTMENT">Adjustment</option>
                      <option value="BONUS">Bonus</option>
                      <option value="PENALTY">Penalty</option>
                      <option value="PROMO">Promo</option>
                      <option value="REVERSAL">Reversal</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Reason</Label>
                    <Input
                      value={form.narration}
                      onChange={(e) => setForm((f) => ({ ...f, narration: e.target.value }))}
                      placeholder="Mandatory reason / audit trail"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setCreating(false)}>
                    Cancel
                  </Button>
                  <Button onClick={create}>Post entry</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        }
      />
      <DataTable columns={cols} rows={data?.items} keyExtractor={(r) => r.id} loading={isFetching && !data} />
    </div>
  );
}

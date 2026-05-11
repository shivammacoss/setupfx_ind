"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Image as ImageIcon, X } from "lucide-react";
import { PayinOutAPI } from "@/lib/api";
import { API_URL } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable, type Column } from "@/components/common/DataTable";
import { StatusPill } from "@/components/common/StatusPill";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatINR } from "@/lib/utils";

export function DepositsPanel() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("PENDING");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<{ id: string; remark: string } | null>(null);

  const { data, isFetching } = useQuery({
    queryKey: ["admin", "deposits", status],
    queryFn: () => PayinOutAPI.deposits(status || undefined),
  });

  async function approve(id: string) {
    try {
      await PayinOutAPI.approveDeposit(id);
      toast.success("Approved + wallet credited");
      qc.invalidateQueries({ queryKey: ["admin", "deposits"] });
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function reject() {
    if (!rejecting) return;
    if (!rejecting.remark.trim()) {
      toast.error("Reason required");
      return;
    }
    try {
      await PayinOutAPI.rejectDeposit(rejecting.id, rejecting.remark);
      toast.success("Rejected");
      setRejecting(null);
      qc.invalidateQueries({ queryKey: ["admin", "deposits"] });
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  const cols: Column<any>[] = [
    { key: "created_at", header: "When", render: (r) => new Date(r.created_at).toLocaleString() },
    { key: "user_id", header: "User", render: (r) => <span className="font-mono text-[11px]">{r.user_id.slice(-8)}</span> },
    { key: "amount", header: "Amount", align: "right", render: (r) => formatINR(r.amount) },
    { key: "payment_mode", header: "Mode" },
    { key: "utr_number", header: "UTR", render: (r) => r.utr_number || "—" },
    { key: "user_remark", header: "Remark", render: (r) => r.user_remark || "—", className: "max-w-[200px] truncate" },
    {
      key: "screenshot",
      header: "Proof",
      render: (r) =>
        r.screenshot_url ? (
          <Button variant="ghost" size="icon" onClick={() => setPreviewUrl(r.screenshot_url)}>
            <ImageIcon className="size-4" />
          </Button>
        ) : (
          "—"
        ),
    },
    { key: "status", header: "Status", render: (r) => <StatusPill status={r.status} /> },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (r) =>
        r.status === "PENDING" ? (
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="icon" aria-label="Approve" onClick={() => approve(r.id)}>
              <Check className="size-4 text-primary" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Reject"
              onClick={() => setRejecting({ id: r.id, remark: "" })}
            >
              <X className="size-4 text-destructive" />
            </Button>
          </div>
        ) : null,
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          {data?.length ?? 0} {status.toLowerCase() || "all"}
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="h-9 rounded-md border border-border bg-background px-3 text-sm"
        >
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
          <option value="">All</option>
        </select>
      </div>
      <DataTable columns={cols} rows={data} keyExtractor={(r) => r.id} loading={isFetching && !data} />

      <Dialog open={!!previewUrl} onOpenChange={(v) => !v && setPreviewUrl(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Payment proof</DialogTitle>
          </DialogHeader>
          {previewUrl && (
            <img
              src={previewUrl.startsWith("http") ? previewUrl : `${API_URL}${previewUrl}`}
              alt="Proof"
              className="max-h-[70vh] w-full rounded-md object-contain"
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!rejecting} onOpenChange={(v) => !v && setRejecting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject deposit</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Reason (mandatory)"
            value={rejecting?.remark ?? ""}
            onChange={(e) => setRejecting((r) => (r ? { ...r, remark: e.target.value } : r))}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={reject}>
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

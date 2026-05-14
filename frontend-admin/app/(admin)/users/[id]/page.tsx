"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Ban, Check, History, KeyRound, ListOrdered, UserCog } from "lucide-react";
import { UsersAPI } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusPill } from "@/components/common/StatusPill";
import { formatINR } from "@/lib/utils";

export default function UserDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "user", id],
    queryFn: () => UsersAPI.detail(id),
    enabled: !!id,
  });

  const blockMut = useMutation({
    mutationFn: (block: boolean) => (block ? UsersAPI.block(id) : UsersAPI.unblock(id)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "user", id] });
      toast.success("Updated");
    },
    onError: (e: any) => toast.error(e.message || "Failed"),
  });

  const [adjAmount, setAdjAmount] = useState("");
  const [adjNote, setAdjNote] = useState("");
  const [adjType, setAdjType] = useState("ADJUSTMENT");

  async function adjustWallet() {
    if (!adjAmount || isNaN(Number(adjAmount))) {
      toast.error("Enter a numeric amount (negative to debit)");
      return;
    }
    try {
      await UsersAPI.walletAdjust(id, {
        amount: Number(adjAmount),
        narration: adjNote || `${adjType} by admin`,
        transaction_type: adjType,
      });
      toast.success("Wallet adjusted");
      setAdjAmount("");
      setAdjNote("");
      qc.invalidateQueries({ queryKey: ["admin", "user", id] });
    } catch (e: any) {
      toast.error(e.message || "Failed");
    }
  }

  async function resetPassword() {
    const newPw = prompt("New password (min 8 chars):");
    if (!newPw || newPw.length < 8) return;
    try {
      await UsersAPI.resetPassword(id, newPw);
      toast.success("Password reset (user must change on next login)");
    } catch (e: any) {
      toast.error(e.message || "Failed");
    }
  }

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (!data) return <div className="text-sm text-muted-foreground">User not found</div>;

  const u = data;

  return (
    <div className="space-y-6">
      <PageHeader
        title={u.full_name}
        description={`${u.user_code} · ${u.email} · ${u.mobile}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={`/orders?tab=orders&user_id=${id}`}>
                <ListOrdered className="size-4" /> View orders
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/orders?tab=executions&user_id=${id}`}>
                <History className="size-4" /> View trades
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/segment-settings/user/${id}`}>
                <UserCog className="size-4" /> Segment settings
              </Link>
            </Button>
            <Button variant="outline" onClick={resetPassword}>
              <KeyRound className="size-4" /> Reset password
            </Button>
            <Button
              variant={u.status === "BLOCKED" ? "default" : "destructive"}
              onClick={() => blockMut.mutate(u.status !== "BLOCKED")}
              loading={blockMut.isPending}
            >
              {u.status === "BLOCKED" ? <Check className="size-4" /> : <Ban className="size-4" />}
              {u.status === "BLOCKED" ? "Unblock" : "Block"}
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <Row label="Status" value={<StatusPill status={u.status} />} />
            <Row label="Role" value={<StatusPill status={u.role} />} />
            <Row label="Account type" value={u.account_type} />
            <Row label="Demo" value={u.is_demo ? "Yes" : "No"} />
            <Row label="Created" value={new Date(u.created_at).toLocaleString()} />
            <Row label="Last login" value={u.last_login_at ? new Date(u.last_login_at).toLocaleString() : "—"} />
            <Row label="2FA" value={u.two_fa_enabled ? "Enabled" : "Disabled"} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>KYC</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <Row label="PAN" value={u.kyc?.pan || "—"} />
            <Row label="DOB" value={u.kyc?.dob || "—"} />
            <Row label="City" value={u.kyc?.city || "—"} />
            <Row label="Pincode" value={u.kyc?.pincode || "—"} />
            <Row label="Verified" value={u.kyc?.is_verified ? "Yes" : "No"} />
          </CardContent>
        </Card>

        <Card id="wallet">
          <CardHeader>
            <CardTitle>Wallet</CardTitle>
            <CardDescription>Manual credit / debit (admin)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Available" value={formatINR(u.wallet?.available_balance)} />
              <Stat label="Used margin" value={formatINR(u.wallet?.used_margin)} />
              <Stat label="Credit limit" value={formatINR(u.wallet?.credit_limit)} />
              <Stat label="Realized P&L" value={formatINR(u.wallet?.realized_pnl)} />
              <Stat label="Deposits" value={formatINR(u.wallet?.total_deposits)} />
              <Stat label="Withdrawals" value={formatINR(u.wallet?.total_withdrawals)} />
            </div>
            <div className="space-y-2 border-t border-border pt-3">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Manual adjust</Label>
              <select
                value={adjType}
                onChange={(e) => setAdjType(e.target.value)}
                className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
              >
                <option value="ADJUSTMENT">Adjustment</option>
                <option value="BONUS">Bonus (credit)</option>
                <option value="PENALTY">Penalty (debit)</option>
                <option value="PROMO">Promo credit</option>
              </select>
              <Input
                placeholder="Amount (negative to debit)"
                inputMode="numeric"
                value={adjAmount}
                onChange={(e) => setAdjAmount(e.target.value)}
              />
              <Input placeholder="Reason / note" value={adjNote} onChange={(e) => setAdjNote(e.target.value)} />
              <Button onClick={adjustWallet} className="w-full">
                Apply
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border/50 py-1 last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-tabular">{value}</span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 p-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-tabular text-sm">{value}</div>
    </div>
  );
}

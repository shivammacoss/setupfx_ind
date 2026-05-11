"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Ban,
  CheckCircle2,
  CreditCard,
  Eye,
  IndianRupee,
  LogIn,
  MinusCircle,
  MoreHorizontal,
  PlusCircle,
  Power,
  Settings2,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { UsersAPI } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ActionKind =
  | null
  | "addFund"
  | "deductFund"
  | "giveCredit"
  | "takeCredit"
  | "ban"
  | "kill"
  | "delete";

interface Props {
  user: any;
  onChange?: () => void;
}

export function UserActionMenu({ user, onChange }: Props) {
  const router = useRouter();
  const qc = useQueryClient();
  const [action, setAction] = useState<ActionKind>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  function close() {
    setAction(null);
    setAmount("");
    setNote("");
    setBusy(false);
  }

  function refresh() {
    qc.invalidateQueries({ queryKey: ["admin", "users"] });
    qc.invalidateQueries({ queryKey: ["admin", "user", user.id] });
    onChange?.();
  }

  async function runWalletAdjust(kind: "addFund" | "deductFund") {
    const num = Number(amount);
    if (!num || num <= 0) {
      toast.error("Enter a positive amount");
      return;
    }
    if (!note.trim()) {
      toast.error("Reason is mandatory");
      return;
    }
    setBusy(true);
    try {
      await UsersAPI.walletAdjust(user.id, {
        amount: kind === "addFund" ? num : -num,
        narration: note.trim(),
        transaction_type: kind === "addFund" ? "ADJUSTMENT" : "ADJUSTMENT",
      });
      toast.success(
        kind === "addFund" ? `Credited ₹${num} to ${user.user_code}` : `Debited ₹${num} from ${user.user_code}`
      );
      refresh();
      close();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || e.message || "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function runCredit(kind: "giveCredit" | "takeCredit") {
    const num = Number(amount);
    if (!num || num <= 0) {
      toast.error("Enter a positive amount");
      return;
    }
    if (!note.trim()) {
      toast.error("Reason is mandatory");
      return;
    }
    setBusy(true);
    try {
      const r = await UsersAPI.creditLimit(user.id, {
        delta: kind === "giveCredit" ? num : -num,
        narration: note.trim(),
      });
      toast.success(`Credit limit now ₹${r.credit_limit}`);
      refresh();
      close();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || e.message || "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function runBan() {
    setBusy(true);
    try {
      if (user.status === "BLOCKED") {
        await UsersAPI.unblock(user.id);
        toast.success(`${user.user_code} unblocked`);
      } else {
        await UsersAPI.block(user.id, note.trim() || undefined);
        toast.success(`${user.user_code} blocked`);
      }
      refresh();
      close();
    } catch (e: any) {
      toast.error(e.message || "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function runKillSwitch() {
    setBusy(true);
    try {
      const r = await UsersAPI.killSwitch(user.id, note.trim() || "kill switch");
      toast.success(
        `Kill switch ✓ — ${r.orders_cancelled} orders cancelled, ${r.positions_squared_off} positions squared off, account blocked`
      );
      refresh();
      close();
    } catch (e: any) {
      toast.error(e.message || "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function runLoginAs() {
    setBusy(true);
    try {
      const r = await UsersAPI.impersonate(user.id);
      const userAppUrl = (r.user_app_url || "http://localhost:3000").replace(/\/$/, "");
      // The user app reads localStorage["nb.accessToken"] / "nb.refreshToken".
      // We push them into the user app's storage, then navigate.
      // Cross-origin localStorage write is blocked, so we open the user app
      // with the tokens in the URL hash and let it persist them.
      const params = new URLSearchParams({
        access: r.access_token,
        refresh: r.refresh_token,
        impersonating: "1",
      });
      window.open(`${userAppUrl}/login?${params.toString()}#impersonate`, "_blank");
      toast.success(`Opened user app as ${user.user_code}`);
      close();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || e.message || "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function runDelete() {
    setBusy(true);
    try {
      await UsersAPI.delete(user.id);
      toast.success(`${user.user_code} archived`);
      refresh();
      close();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || e.message || "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="More actions"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={4}>
          <DropdownMenuItem onClick={() => router.push(`/users/${user.id}`)}>
            <Eye /> View Profile
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push(`/segment-settings?tab=users&user=${user.id}`)}>
            <Settings2 /> Segment Overrides
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push(`/risk-management?user=${user.id}`)}>
            <ShieldCheck /> Risk Settings
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setAction("addFund")}>
            <PlusCircle /> Add Fund
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setAction("deductFund")}>
            <MinusCircle /> Deduct Fund
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setAction("giveCredit")}>
            <CreditCard /> Give Credit
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setAction("takeCredit")}>
            <IndianRupee /> Take Credit
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem destructive onClick={() => setAction("ban")}>
            {user.status === "BLOCKED" ? <CheckCircle2 /> : <Ban />}
            {user.status === "BLOCKED" ? "Unblock User" : "Ban User"}
          </DropdownMenuItem>
          <DropdownMenuItem destructive onClick={() => setAction("kill")}>
            <Power /> Kill Switch
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={runLoginAs}>
            <LogIn /> Login As User
          </DropdownMenuItem>
          <DropdownMenuItem destructive onClick={() => setAction("delete")}>
            <Trash2 /> Delete User
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* ── Dialogs ───────────────────────────────────────────── */}
      <AmountDialog
        open={action === "addFund"}
        title={`Add fund — ${user.user_code}`}
        description={`Credit a positive amount to ${user.full_name}'s wallet.`}
        actionLabel="Credit wallet"
        amount={amount}
        setAmount={setAmount}
        note={note}
        setNote={setNote}
        busy={busy}
        onCancel={close}
        onSubmit={() => runWalletAdjust("addFund")}
      />
      <AmountDialog
        open={action === "deductFund"}
        title={`Deduct fund — ${user.user_code}`}
        description="Debit will be rejected if balance + credit limit can't cover it."
        actionLabel="Debit wallet"
        actionVariant="destructive"
        amount={amount}
        setAmount={setAmount}
        note={note}
        setNote={setNote}
        busy={busy}
        onCancel={close}
        onSubmit={() => runWalletAdjust("deductFund")}
      />
      <AmountDialog
        open={action === "giveCredit"}
        title={`Give credit — ${user.user_code}`}
        description="Increases the user's credit limit (line of credit)."
        actionLabel="Give credit"
        amount={amount}
        setAmount={setAmount}
        note={note}
        setNote={setNote}
        busy={busy}
        onCancel={close}
        onSubmit={() => runCredit("giveCredit")}
      />
      <AmountDialog
        open={action === "takeCredit"}
        title={`Take credit — ${user.user_code}`}
        description="Reduces the user's credit limit. Cannot go below zero."
        actionLabel="Take credit"
        actionVariant="destructive"
        amount={amount}
        setAmount={setAmount}
        note={note}
        setNote={setNote}
        busy={busy}
        onCancel={close}
        onSubmit={() => runCredit("takeCredit")}
      />

      {/* Ban / Unblock */}
      <Dialog open={action === "ban"} onOpenChange={(v) => !v && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {user.status === "BLOCKED" ? "Unblock" : "Ban"} {user.user_code}?
            </DialogTitle>
            <DialogDescription>
              {user.status === "BLOCKED"
                ? "User will be allowed to log in and trade again."
                : "User will be unable to log in or place orders. Existing positions stay open."}
            </DialogDescription>
          </DialogHeader>
          {user.status !== "BLOCKED" && (
            <div className="space-y-1.5">
              <Label>Reason (optional)</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button
              variant={user.status === "BLOCKED" ? "default" : "destructive"}
              onClick={runBan}
              loading={busy}
            >
              {user.status === "BLOCKED" ? "Unblock" : "Ban"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Kill switch */}
      <Dialog open={action === "kill"} onOpenChange={(v) => !v && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Kill switch — {user.user_code}</DialogTitle>
            <DialogDescription>
              This will <strong>cancel all pending orders</strong>, <strong>square off all open positions</strong>{" "}
              at market, and <strong>block</strong> the account. Use only in emergencies.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Reason</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. risk breach"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={runKillSwitch} loading={busy}>
              <Power className="size-4" /> Trigger kill switch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <Dialog open={action === "delete"} onOpenChange={(v) => !v && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {user.user_code}?</DialogTitle>
            <DialogDescription>
              The account is archived (status = CLOSED) — it cannot log in, but its trade history and
              ledger remain for compliance.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={runDelete} loading={busy}>
              <Trash2 className="size-4" /> Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AmountDialog({
  open,
  title,
  description,
  actionLabel,
  actionVariant = "default",
  amount,
  setAmount,
  note,
  setNote,
  busy,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  title: string;
  description: string;
  actionLabel: string;
  actionVariant?: "default" | "destructive";
  amount: string;
  setAmount: (v: string) => void;
  note: string;
  setNote: (v: string) => void;
  busy: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Amount (₹)</Label>
            <Input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label>Reason / narration</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Mandatory for audit trail"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant={actionVariant} onClick={onSubmit} loading={busy}>
            {actionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

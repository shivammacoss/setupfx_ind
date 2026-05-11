"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { toast } from "sonner";
import { Plus, Search, Trash2, X } from "lucide-react";
import { InstrumentAPI, MarketwatchAPI } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PageHeader } from "@/components/common/PageHeader";
import { DataTable, type Column } from "@/components/common/DataTable";
import { cn, formatNumber, formatPercent, pnlColor } from "@/lib/utils";

export default function MarketwatchPage() {
  const qc = useQueryClient();
  const { data: watchlists } = useQuery({ queryKey: ["watchlists"], queryFn: () => MarketwatchAPI.list() });
  const [activeId, setActiveId] = useState<string | null>(null);

  const active = watchlists?.find((w: any) => w.id === activeId) ?? watchlists?.[0];
  const activeWlId = active?.id;

  const { data: quotes, isFetching } = useQuery({
    queryKey: ["watchlist-quotes", activeWlId],
    queryFn: () => MarketwatchAPI.quotes(activeWlId!),
    enabled: !!activeWlId,
    refetchInterval: 2000,
  });

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  async function createWl() {
    try {
      await MarketwatchAPI.create(newName);
      toast.success("Created");
      setCreating(false);
      setNewName("");
      qc.invalidateQueries({ queryKey: ["watchlists"] });
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function removeWl(id: string) {
    if (!confirm("Delete this watchlist?")) return;
    try {
      await MarketwatchAPI.delete(id);
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["watchlists"] });
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  const [search, setSearch] = useState("");
  const { data: searchResults } = useQuery({
    queryKey: ["instr-search-mw", search],
    queryFn: () => InstrumentAPI.search(search, undefined, undefined, 12),
    enabled: search.length > 0,
  });

  async function addItem(token: string) {
    if (!activeWlId) return;
    try {
      await MarketwatchAPI.addItem(activeWlId, token);
      toast.success("Added");
      qc.invalidateQueries({ queryKey: ["watchlist-quotes", activeWlId] });
      qc.invalidateQueries({ queryKey: ["watchlists"] });
      setSearch("");
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function removeItem(itemId: string) {
    if (!activeWlId) return;
    try {
      await MarketwatchAPI.removeItem(activeWlId, itemId);
      qc.invalidateQueries({ queryKey: ["watchlist-quotes", activeWlId] });
      qc.invalidateQueries({ queryKey: ["watchlists"] });
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  const cols: Column<any>[] = [
    {
      key: "symbol",
      header: "Symbol",
      render: (q) => (
        <Link href={`/terminal?token=${q.instrument_token}`} className="hover:text-primary">
          <span className="font-medium">{q.symbol}</span>
          <span className="ml-1 text-[10px] text-muted-foreground">{q.exchange}</span>
        </Link>
      ),
    },
    { key: "ltp", header: "LTP", align: "right", render: (q) => formatNumber(q.ltp) },
    {
      key: "change",
      header: "Change",
      align: "right",
      render: (q) => <span className={pnlColor(q.change)}>{formatNumber(q.change)}</span>,
    },
    {
      key: "change_pct",
      header: "%",
      align: "right",
      render: (q) => <span className={pnlColor(q.change_pct)}>{formatPercent(q.change_pct)}</span>,
    },
    { key: "open", header: "Open", align: "right", render: (q) => formatNumber(q.open) },
    { key: "high", header: "High", align: "right", render: (q) => formatNumber(q.high) },
    { key: "low", header: "Low", align: "right", render: (q) => formatNumber(q.low) },
    { key: "volume", header: "Volume", align: "right", render: (q) => q.volume?.toLocaleString("en-IN") },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (q) => {
        const itemId = active?.items?.find((i: any) => i.instrument_token === q.instrument_token)?.id;
        return itemId ? (
          <Button variant="ghost" size="icon" aria-label="Remove" onClick={() => removeItem(itemId)}>
            <X className="size-4 text-muted-foreground" />
          </Button>
        ) : null;
      },
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Marketwatch"
        description="Up to 10 watchlists. Live prices refresh every 2 s."
        actions={
          <Dialog open={creating} onOpenChange={setCreating}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="size-4" /> New watchlist
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New watchlist</DialogTitle>
              </DialogHeader>
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. F&O picks" />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreating(false)}>
                  Cancel
                </Button>
                <Button onClick={createWl}>Create</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="flex flex-wrap gap-2">
        {watchlists?.map((w: any) => (
          <button
            key={w.id}
            onClick={() => setActiveId(w.id)}
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs",
              (active?.id === w.id) ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:bg-accent"
            )}
          >
            {w.name}
            <span className="rounded-full bg-muted px-1.5 text-[10px] text-foreground">{w.items?.length ?? 0}</span>
            {watchlists.length > 1 && (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  removeWl(w.id);
                }}
                className="ml-1 text-muted-foreground hover:text-destructive"
                aria-label="Delete"
                role="button"
              >
                <Trash2 className="size-3" />
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search & add to active watchlist (RELIANCE, NIFTY, etc.)"
          className="pl-9"
        />
        {search && searchResults && searchResults.length > 0 && (
          <div className="absolute z-10 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-border bg-popover shadow-lg scrollbar-thin">
            {searchResults.map((r: any) => (
              <button
                key={r.token}
                onClick={() => addItem(r.token)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent"
              >
                <span>
                  <span className="font-medium">{r.symbol}</span>
                  <span className="ml-1 text-xs text-muted-foreground">{r.name}</span>
                </span>
                <span className="text-[10px] text-muted-foreground">{r.exchange}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <DataTable columns={cols} rows={quotes} keyExtractor={(q) => q.instrument_token} loading={isFetching && !quotes} />
    </div>
  );
}

"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MarketwatchAPI } from "@/lib/api";
import { OptionChainPicker } from "@/components/trading/OptionChainPicker";
import { cn } from "@/lib/utils";

export interface ChartTab {
  token: string;
  symbol: string;
  /** Watchlist-item id — used by the max-tab eviction logic to call
   *  removeItem on the oldest tab. Optional because the picker can pass
   *  ad-hoc tabs that aren't yet in the watchlist. */
  id?: string;
}

/** Maximum number of chart tabs kept open at once. Adding a third tab
 *  auto-evicts the oldest (FIFO) — per user request, keeps the strip
 *  uncluttered on mobile where horizontal tab scroll would otherwise
 *  build up over the session. */
const MAX_TABS = 2;

interface Props {
  tabs: ChartTab[];
  active: string | null;
  onSelect: (token: string) => void;
  onClose?: (token: string) => void;
  /** Called after a new instrument has been added; parent can refresh & select. */
  onAdded?: (token: string, symbol: string) => void;
  /** Active watchlist id — needed to add new tabs to the watchlist. */
  watchlistId?: string | null;
}

export function ChartTabs({ tabs, active, onSelect, onClose, onAdded, watchlistId }: Props) {
  const qc = useQueryClient();
  const [pickerOpen, setPickerOpen] = useState(false);

  async function addTab(token: string, symbol: string) {
    try {
      // If the picked instrument is already in tabs, just activate it
      // instead of re-adding (the watchlist endpoint would 409 anyway).
      const existing = tabs.find((t) => t.token === token);
      if (existing) {
        onSelect(token);
        setPickerOpen(false);
        return;
      }

      if (watchlistId) {
        // Cap the tab strip to MAX_TABS items. When at the cap, evict the
        // OLDEST tab (FIFO — first entry in the array, since the
        // watchlist API returns items in insertion order) so the new
        // tab can slot in. If the oldest tab happens to be the one
        // currently selected, that's fine — the new tab becomes active
        // immediately via the onSelect call below.
        if (tabs.length >= MAX_TABS) {
          const oldest = tabs[0];
          if (oldest?.id) {
            try {
              await MarketwatchAPI.removeItem(watchlistId, oldest.id);
            } catch {
              // Don't block the add on a failed evict — the worst case
              // is a 3-tab strip, which the next add will trim down.
            }
          }
        }

        await MarketwatchAPI.addItem(watchlistId, token);
        qc.invalidateQueries({ queryKey: ["watchlist-quotes"] });
        qc.invalidateQueries({ queryKey: ["watchlists"] });
      }
      onAdded?.(token, symbol);
      onSelect(token);
      setPickerOpen(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to add");
    }
  }

  return (
    <div className="relative flex items-center gap-1 overflow-x-auto border-b border-border bg-card/60 px-2 pt-2 scrollbar-thin">
      {tabs.map((t) => {
        const isActive = t.token === active;
        return (
          <div
            key={t.token}
            onClick={() => onSelect(t.token)}
            className={cn(
              "group flex shrink-0 cursor-pointer items-center gap-2 rounded-t-md px-3 py-1.5 text-xs transition-colors",
              isActive
                ? "border border-b-0 border-border bg-background text-foreground"
                : "text-muted-foreground hover:bg-muted/30 hover:text-foreground"
            )}
          >
            <span className="font-medium">{t.symbol}</span>
            {onClose && (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(t.token);
                }}
                className="rounded p-0.5 text-muted-foreground opacity-60 transition hover:bg-destructive/20 hover:text-destructive hover:opacity-100"
                aria-label="Close tab"
              >
                <X className="size-3" />
              </span>
            )}
          </div>
        );
      })}

      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        className="ml-1 grid size-7 shrink-0 place-items-center rounded text-muted-foreground hover:bg-muted/30 hover:text-foreground"
        aria-label="Add tab"
      >
        <Plus className="size-4" />
      </button>

      <OptionChainPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPick={addTab}
      />
    </div>
  );
}

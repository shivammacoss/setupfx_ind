"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { NettingAPI } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { CATEGORY_FIELDS, isFieldNA, type SegmentRow } from "@/lib/nettingMatrixConfig";
import { Cell } from "./Cell";

export function SegmentMatrix({ categoryId }: { categoryId: string }) {
  const qc = useQueryClient();
  const fields = CATEGORY_FIELDS[categoryId] || [];
  const { data: segments, isLoading } = useQuery({
    queryKey: ["admin", "netting", "segments"],
    queryFn: () => NettingAPI.segments(),
  });

  const [edits, setEdits] = useState<Record<string, Record<string, any>>>({});
  const [saving, setSaving] = useState(false);

  function setEdit(segId: string, key: string, val: any) {
    setEdits((prev) => ({ ...prev, [segId]: { ...(prev[segId] || {}), [key]: val } }));
  }
  function getValue(seg: any, key: string) {
    if (edits[seg.id]?.[key] !== undefined) return edits[seg.id][key];
    return seg[key];
  }

  const dirtyCount = Object.values(edits).reduce((s, e) => s + Object.keys(e).length, 0);

  async function saveAll() {
    setSaving(true);
    try {
      // Parallelise the PUTs. The old sequential loop made saving 14 dirty
      // segments take ~14× longer than necessary because every backend
      // request also does an O(N) Redis SCAN to invalidate the per-user
      // effective-settings cache. With Promise.all the round-trips overlap
      // and total wall time drops to ~one slow request, not the sum of all.
      const ids = Object.keys(edits);
      await Promise.all(ids.map((id) => NettingAPI.updateSegment(id, edits[id])));
      toast.success(`Saved ${dirtyCount} change${dirtyCount === 1 ? "" : "s"}`);
      setEdits({});
      qc.invalidateQueries({ queryKey: ["admin", "netting", "segments"] });
      // Also evict the user-side effective-settings cache key so any tab the
      // admin has open (terminal preview, etc.) refetches the new numbers on
      // its next 30 s window instead of holding stale values.
      qc.invalidateQueries({ queryKey: ["segment-settings"] });
    } catch (e: any) {
      toast.error(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading segments…</div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <Button onClick={saveAll} disabled={dirtyCount === 0} loading={saving}>
          <Save className="size-4" /> Save {dirtyCount > 0 ? `(${dirtyCount})` : ""}
        </Button>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="min-w-full text-xs">
          <thead className="bg-card">
            <tr className="border-b border-border">
              <th className="sticky left-0 z-10 bg-card px-3 py-2 text-left text-muted-foreground">
                Segment
              </th>
              {fields.map((f) => (
                <th key={f.key} className="whitespace-nowrap px-2 py-2 text-left text-muted-foreground">
                  {f.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(segments ?? []).map((seg: any) => {
              const segRow: SegmentRow = {
                code: seg.name,
                name: seg.displayName,
                lotApplies: seg.lotApplies,
                qtyApplies: seg.qtyApplies,
                optionApplies: seg.optionApplies,
                expiryHoldApplies: seg.expiryHoldApplies,
                futureApplies: seg.futureApplies,
              };
              return (
                <tr key={seg.id} className="hover:bg-muted/30">
                  <td className="sticky left-0 z-0 whitespace-nowrap bg-card px-3 py-2">
                    <div className="font-medium">{seg.displayName}</div>
                    <div className="text-[10px] font-mono text-muted-foreground">{seg.name}</div>
                  </td>
                  {fields.map((f) => (
                    <td key={f.key} className="px-1 py-1">
                      <Cell
                        field={f}
                        na={isFieldNA(segRow, categoryId, f)}
                        value={getValue(seg, f.key)}
                        dirty={edits[seg.id]?.[f.key] !== undefined}
                        onChange={(v) => setEdit(seg.id, f.key, v)}
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

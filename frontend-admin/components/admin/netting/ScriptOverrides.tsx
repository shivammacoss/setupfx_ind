"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Save, Trash2 } from "lucide-react";
import { NettingAPI } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CATEGORY_FIELDS, isFieldNA } from "@/lib/nettingMatrixConfig";
import { Cell } from "./Cell";

export function ScriptOverrides({ categoryId }: { categoryId: string }) {
  const qc = useQueryClient();
  const fields = CATEGORY_FIELDS[categoryId] || [];
  const { data: segments } = useQuery({
    queryKey: ["admin", "netting", "segments"],
    queryFn: () => NettingAPI.segments(),
  });
  const [segmentName, setSegmentName] = useState<string>("");
  const { data: scripts, isLoading } = useQuery({
    queryKey: ["admin", "netting", "scripts", segmentName],
    queryFn: () => NettingAPI.scripts(segmentName || undefined),
    enabled: !!segments,
  });

  const [edits, setEdits] = useState<Record<string, Record<string, any>>>({});
  const [saving, setSaving] = useState(false);
  const [newSym, setNewSym] = useState("");
  const [newSegId, setNewSegId] = useState("");
  const [adding, setAdding] = useState(false);

  function setEdit(id: string, key: string, val: any) {
    setEdits((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), [key]: val } }));
  }
  function getValue(s: any, key: string) {
    if (edits[s.id]?.[key] !== undefined) return edits[s.id][key];
    return s[key];
  }

  const dirtyCount = Object.values(edits).reduce((s, e) => s + Object.keys(e).length, 0);

  async function saveAll() {
    setSaving(true);
    try {
      for (const id of Object.keys(edits)) {
        await NettingAPI.updateScript(id, edits[id]);
      }
      toast.success(`Saved ${dirtyCount} change${dirtyCount === 1 ? "" : "s"}`);
      setEdits({});
      qc.invalidateQueries({ queryKey: ["admin", "netting", "scripts"] });
    } catch (e: any) {
      toast.error(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function addScript() {
    if (!newSym.trim()) return toast.error("Enter symbol");
    if (!newSegId) return toast.error("Pick a segment");
    const seg = segments?.find((s: any) => s.id === newSegId);
    if (!seg) return toast.error("Invalid segment");
    setAdding(true);
    try {
      await NettingAPI.createScript({
        segment_id: newSegId,
        segment_name: seg.name,
        symbol: newSym.trim().toUpperCase(),
        tradingSymbol: newSym.trim().toUpperCase(),
      });
      toast.success(`Added ${newSym.trim().toUpperCase()} to ${seg.name}`);
      setNewSym("");
      setNewSegId("");
      qc.invalidateQueries({ queryKey: ["admin", "netting", "scripts"] });
    } catch (e: any) {
      toast.error(e.message || "Add failed");
    } finally {
      setAdding(false);
    }
  }

  async function delScript(id: string, sym: string) {
    if (!confirm(`Remove override for ${sym}?`)) return;
    try {
      await NettingAPI.deleteScript(id);
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["admin", "netting", "scripts"] });
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2 rounded-md border border-border bg-muted/10 p-3 text-sm">
        <div className="space-y-1">
          <Label>Segment</Label>
          <select
            value={segmentName}
            onChange={(e) => setSegmentName(e.target.value)}
            className="h-9 rounded-md border border-border bg-background px-2 text-xs"
          >
            <option value="">— All segments —</option>
            {segments?.map((s: any) => (
              <option key={s.id} value={s.name}>
                {s.displayName}
              </option>
            ))}
          </select>
        </div>
        <div className="ml-auto flex items-end gap-2">
          <div className="space-y-1">
            <Label>Add symbol to</Label>
            <select
              value={newSegId}
              onChange={(e) => setNewSegId(e.target.value)}
              className="h-9 rounded-md border border-border bg-background px-2 text-xs"
            >
              <option value="">— Pick segment —</option>
              {segments?.map((s: any) => (
                <option key={s.id} value={s.id}>
                  {s.displayName}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label>Symbol</Label>
            <Input
              value={newSym}
              onChange={(e) => setNewSym(e.target.value)}
              placeholder="e.g. RELIANCE"
              className="h-9 w-40 uppercase"
            />
          </div>
          <Button onClick={addScript} loading={adding}>
            <Plus className="size-4" /> Add
          </Button>
          <Button onClick={saveAll} disabled={dirtyCount === 0} loading={saving}>
            <Save className="size-4" /> Save {dirtyCount > 0 ? `(${dirtyCount})` : ""}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading scripts…</div>
      ) : (scripts ?? []).length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No script overrides yet. Pick a segment + add a symbol above to start.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="min-w-full text-xs">
            <thead className="bg-card">
              <tr className="border-b border-border">
                <th className="sticky left-0 z-10 bg-card px-3 py-2 text-left text-muted-foreground">
                  Script
                </th>
                {fields.map((f) => (
                  <th
                    key={f.key}
                    className="whitespace-nowrap px-2 py-2 text-left text-muted-foreground"
                  >
                    {f.label}
                  </th>
                ))}
                <th className="px-2 py-2 text-right text-muted-foreground">Del</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(scripts ?? []).map((s: any) => {
                const segRow = segments?.find((g: any) => g.name === s.segment_name);
                return (
                  <tr key={s.id} className="hover:bg-muted/30">
                    <td className="sticky left-0 z-0 whitespace-nowrap bg-card px-3 py-2">
                      <div className="font-mono text-[11px]">{s.symbol}</div>
                      <div className="text-[10px] text-muted-foreground">{s.segment_name}</div>
                    </td>
                    {fields.map((f) => (
                      <td key={f.key} className="px-1 py-1">
                        <Cell
                          field={f}
                          na={isFieldNA(segRow as any, categoryId, f)}
                          value={getValue(s, f.key)}
                          dirty={edits[s.id]?.[f.key] !== undefined}
                          inheritPlaceholder
                          onChange={(v) => setEdit(s.id, f.key, v)}
                        />
                      </td>
                    ))}
                    <td className="px-2 py-1 text-right">
                      <Button variant="ghost" size="icon" onClick={() => delScript(s.id, s.symbol)}>
                        <Trash2 className="size-3.5 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

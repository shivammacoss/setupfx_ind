"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SettingsAPI } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/PageHeader";
import { DataTable, type Column } from "@/components/common/DataTable";
import { StatusPill } from "@/components/common/StatusPill";

export default function AuditLogsPage() {
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [page, setPage] = useState(1);

  const { data, isFetching } = useQuery({
    queryKey: ["admin", "audit", { action, entityType, page }],
    queryFn: () =>
      SettingsAPI.audit({
        action: action || undefined,
        entity_type: entityType || undefined,
        page,
        page_size: 50,
      }),
  });

  const cols: Column<any>[] = [
    { key: "created_at", header: "When", render: (r) => new Date(r.created_at).toLocaleString() },
    { key: "action", header: "Action", render: (r) => <StatusPill status={r.action} /> },
    { key: "entity_type", header: "Entity" },
    { key: "entity_id", header: "ID", render: (r) => <span className="font-mono text-[11px]">{r.entity_id?.slice(-12) || "—"}</span> },
    { key: "user_id", header: "Actor", render: (r) => (r.user_id ? r.user_id.slice(-8) : "system") },
    { key: "target_user_id", header: "Target", render: (r) => (r.target_user_id ? r.target_user_id.slice(-8) : "—") },
    {
      key: "metadata",
      header: "Detail",
      className: "max-w-[300px] truncate",
      render: (r) => <code className="text-[10px]">{JSON.stringify(r.metadata)}</code>,
    },
    { key: "ip_address", header: "IP" },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="Audit logs" description={`${data?.meta?.total ?? 0} events`} />

      <div className="flex flex-wrap gap-2">
        <Input
          value={action}
          onChange={(e) => {
            setPage(1);
            setAction(e.target.value);
          }}
          placeholder="Filter action (e.g. APPROVE)"
          className="h-10 max-w-xs"
        />
        <Input
          value={entityType}
          onChange={(e) => {
            setPage(1);
            setEntityType(e.target.value);
          }}
          placeholder="Filter entity type (e.g. User)"
          className="h-10 max-w-xs"
        />
      </div>

      <DataTable columns={cols} rows={data?.items} keyExtractor={(r) => r.id} loading={isFetching && !data} />

      {(data?.meta?.total_pages ?? 1) > 1 && (
        <div className="flex justify-end gap-2 text-xs">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Prev
          </Button>
          <span className="self-center text-muted-foreground">
            {page} / {data?.meta?.total_pages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= (data?.meta?.total_pages ?? 1)}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

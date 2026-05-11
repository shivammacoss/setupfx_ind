"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
  className?: string;
  width?: string;
  align?: "left" | "right" | "center";
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[] | undefined;
  keyExtractor: (row: T) => string;
  loading?: boolean;
  empty?: ReactNode;
  rowClassName?: (row: T) => string | undefined;
  onRowClick?: (row: T) => void;
}

export function DataTable<T>({ columns, rows, keyExtractor, loading, empty, rowClassName, onRowClick }: Props<T>) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card scrollbar-thin">
      <table className="min-w-full text-sm">
        <thead className="border-b border-border bg-muted/30 text-xs uppercase text-muted-foreground">
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                className={cn(
                  "px-3 py-2 font-medium",
                  c.align === "right" && "text-right",
                  c.align === "center" && "text-center",
                  !c.align && "text-left",
                  c.className
                )}
                style={{ width: c.width }}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {loading && (
            <tr>
              <td colSpan={columns.length} className="px-3 py-12 text-center text-muted-foreground">
                Loading…
              </td>
            </tr>
          )}
          {!loading && (!rows || rows.length === 0) && (
            <tr>
              <td colSpan={columns.length} className="px-3 py-12 text-center text-muted-foreground">
                {empty ?? "No data"}
              </td>
            </tr>
          )}
          {!loading &&
            rows?.map((row) => (
              <tr
                key={keyExtractor(row)}
                onClick={() => onRowClick?.(row)}
                className={cn(
                  "transition-colors hover:bg-muted/40",
                  onRowClick && "cursor-pointer",
                  rowClassName?.(row)
                )}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      "whitespace-nowrap px-3 py-2 font-tabular",
                      c.align === "right" && "text-right",
                      c.align === "center" && "text-center",
                      c.className
                    )}
                  >
                    {c.render ? c.render(row) : (row as any)[c.key]}
                  </td>
                ))}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

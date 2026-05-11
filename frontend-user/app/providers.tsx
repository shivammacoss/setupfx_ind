"use client";

import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ThemeProvider, useTheme } from "next-themes";
import { Toaster } from "sonner";

function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Toaster
      theme={(resolvedTheme === "light" ? "light" : "dark") as "light" | "dark"}
      position="top-right"
      toastOptions={{
        style: {
          background: "hsl(var(--card))",
          border: "1px solid hsl(var(--border))",
          color: "hsl(var(--foreground))",
        },
      }}
    />
  );
}

/** Live-cache invalidator. Mirrors what big consumer apps (YouTube, Flipkart)
 *  do: data is treated as stale almost immediately and re-fetched on every
 *  trigger that signals "user is back / scene changed":
 *    • route navigation
 *    • window focus
 *    • network reconnect
 *    • a periodic 30 s sweep (catches background tabs that never lose focus)
 *  Components that opt for tighter polling (e.g. order book at 500 ms) are
 *  unaffected — they still get their own refetchInterval. */
function LiveCacheBridge() {
  const qc = useQueryClient();
  const pathname = usePathname();

  // Invalidate everything whenever the route changes — every page sees fresh
  // data on first paint instead of cached values from a previous visit.
  useEffect(() => {
    qc.invalidateQueries();
  }, [pathname, qc]);

  // Periodic sweep — keeps long-running background tabs honest.
  useEffect(() => {
    const id = setInterval(() => qc.invalidateQueries(), 30_000);
    return () => clearInterval(id);
  }, [qc]);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Treat data as stale almost immediately so any access path
            // (mount, focus, reconnect) triggers a re-fetch. Components that
            // need tighter or looser caching set their own staleTime.
            staleTime: 0,
            // Keep cached data for 5 min after last use so quick navigation
            // doesn't show a flash of "Loading…" while the refetch lands.
            gcTime: 5 * 60_000,
            refetchOnWindowFocus: true,
            refetchOnReconnect: true,
            refetchOnMount: "always",
            retry: (count, err: any) => {
              const status = err?.response?.status;
              if (status && status >= 400 && status < 500) return false;
              return count < 2;
            },
          },
        },
      })
  );

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      disableTransitionOnChange
    >
      <QueryClientProvider client={client}>
        <LiveCacheBridge />
        {children}
        <ThemedToaster />
      </QueryClientProvider>
    </ThemeProvider>
  );
}

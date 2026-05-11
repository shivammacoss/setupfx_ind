"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
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

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // 30 s stale window — within this, navigating around the admin
            // panel serves data from cache (instant). After 30 s the next
            // mount / focus / reconnect refetches the mounted queries only.
            // Lists that change live (positions, orders, pnl summary) keep
            // their own `refetchInterval` and aren't affected by this.
            staleTime: 30_000,
            gcTime: 5 * 60_000,
            refetchOnWindowFocus: true,
            refetchOnReconnect: true,
            refetchOnMount: true,
            retry: (count, err: any) =>
              err?.response?.status >= 400 && err?.response?.status < 500 ? false : count < 2,
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
        {children}
        <ThemedToaster />
      </QueryClientProvider>
    </ThemeProvider>
  );
}

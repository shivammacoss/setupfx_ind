"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAdminAuthStore } from "@/stores/authStore";
import { AdminSidebar } from "@/components/layout/AdminSidebar";
import { AdminTopBar } from "@/components/layout/AdminTopBar";
import { AdminPrefetcher } from "@/components/layout/AdminPrefetcher";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const admin = useAdminAuthStore((s) => s.admin);
  const hydrated = useAdminAuthStore((s) => s.hydrated);

  useEffect(() => {
    if (hydrated && !admin) router.replace("/login");
  }, [hydrated, admin, router]);

  if (!hydrated) {
    return <div className="grid h-screen place-items-center text-sm text-muted-foreground">Loading…</div>;
  }
  if (!admin) return null;

  return (
    <div className="grid min-h-screen grid-cols-1 md:grid-cols-[auto_1fr]">
      <AdminPrefetcher />
      <AdminSidebar />
      <div className="flex min-h-screen flex-col">
        <AdminTopBar />
        <main className="flex-1 overflow-y-auto bg-background scrollbar-thin">
          <div className="mx-auto max-w-screen-2xl p-4 md:p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}

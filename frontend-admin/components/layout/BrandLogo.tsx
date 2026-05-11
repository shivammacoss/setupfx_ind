import { TrendingUp } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface BrandLogoProps {
  href?: string | null;
  size?: "sm" | "md" | "lg";
  showAdminBadge?: boolean;
  className?: string;
}

export function BrandLogo({ href = "/dashboard", size = "md", showAdminBadge = true, className }: BrandLogoProps) {
  const sizes = {
    sm: { wrap: "text-sm", icon: "size-5", badge: "p-1" },
    md: { wrap: "text-lg", icon: "size-6", badge: "p-1.5" },
    lg: { wrap: "text-2xl", icon: "size-8", badge: "p-2" },
  }[size];

  const content = (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", sizes.wrap, className)}>
      <span className={cn("rounded-md bg-primary/15 text-primary", sizes.badge)}>
        <TrendingUp className={sizes.icon} strokeWidth={2.5} />
      </span>
      <span className="text-foreground">
        <span className="text-primary">SetupFX</span> Broker
        {showAdminBadge && (
          <span className="ml-1.5 rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-destructive">
            Admin
          </span>
        )}
      </span>
    </span>
  );

  if (href) {
    return (
      <Link href={href} className="outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md">
        {content}
      </Link>
    );
  }
  return content;
}

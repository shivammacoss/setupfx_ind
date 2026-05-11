import { BrandLogo } from "@/components/layout/BrandLogo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen w-full bg-background">
      <div className="grid min-h-screen w-full grid-cols-1 lg:grid-cols-2">
        <div className="hidden flex-col justify-between bg-gradient-to-br from-primary/15 via-card to-background p-12 lg:flex">
          <BrandLogo href="/" size="md" />
          <div className="space-y-4">
            <h1 className="text-4xl font-bold leading-tight">
              Trade Indian markets — fast, fair, focused.
            </h1>
            <p className="max-w-md text-muted-foreground">
              Live equities, F&amp;O, commodities, currencies and crypto. One dark dashboard,
              built for serious traders.
            </p>
          </div>
          <div className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} SetupFX Broker · All rights reserved
          </div>
        </div>
        <div className="flex items-center justify-center p-6">
          <div className="w-full max-w-md">{children}</div>
        </div>
      </div>
    </main>
  );
}

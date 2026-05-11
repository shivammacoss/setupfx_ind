"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { ApiError, ProfileAPI, setTokens } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const schema = z.object({
  identifier: z.string().min(3, "Enter your email or mobile"),
  password: z.string().min(8, "Minimum 8 characters"),
  two_fa_code: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const setUser = useAuthStore((s) => s.setUser);
  const [showPwd, setShowPwd] = useState(false);
  const [needs2fa, setNeeds2fa] = useState(false);

  // Admin "Login as user" — accepts ?access=…&refresh=…&impersonating=1
  // Persists the tokens, fetches /me to populate the auth store, and routes
  // to the dashboard. The window is opened by the admin panel; user never
  // sees this URL directly.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const access = params.get("access");
    const refresh = params.get("refresh");
    if (!access || !refresh) return;
    setTokens(access, refresh);
    ProfileAPI.me()
      .then((u: any) => {
        setUser(u as any);
        toast.success(`Signed in as ${u.full_name}`);
        router.replace("/dashboard");
      })
      .catch(() => {
        toast.error("Impersonation token rejected");
      });
  }, [router, setUser]);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { identifier: "", password: "", two_fa_code: "" },
  });

  async function onSubmit(values: FormValues) {
    try {
      await login(values.identifier, values.password, values.two_fa_code || undefined);
      toast.success("Welcome back");
      router.push("/dashboard");
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "TWO_FA_REQUIRED") {
          setNeeds2fa(true);
          toast.info("Enter your 2FA code to continue");
          return;
        }
        toast.error(err.message);
      } else {
        toast.error("Login failed. Please try again.");
      }
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight">Sign in</h2>
        <p className="text-sm text-muted-foreground">Welcome back. Enter your credentials below.</p>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="identifier">Email or Mobile</Label>
          <Input
            id="identifier"
            placeholder="you@example.com or 9999900000"
            autoComplete="username"
            {...form.register("identifier")}
          />
          {form.formState.errors.identifier && (
            <p className="text-xs text-destructive">{form.formState.errors.identifier.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link href="/forgot-password" className="text-xs text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Input
              id="password"
              type={showPwd ? "text" : "password"}
              autoComplete="current-password"
              {...form.register("password")}
            />
            <button
              type="button"
              className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
              onClick={() => setShowPwd((v) => !v)}
              aria-label={showPwd ? "Hide password" : "Show password"}
            >
              {showPwd ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          {form.formState.errors.password && (
            <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
          )}
        </div>

        {needs2fa && (
          <div className="space-y-2">
            <Label htmlFor="two_fa_code">2FA Code</Label>
            <Input
              id="two_fa_code"
              inputMode="numeric"
              maxLength={6}
              placeholder="123456"
              autoComplete="one-time-code"
              {...form.register("two_fa_code")}
            />
          </div>
        )}

        <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
          Sign in
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link href="/register" className="text-primary hover:underline">
          Create one
        </Link>
      </p>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { AuthAPI, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const schema = z.object({
  full_name: z.string().min(2, "Enter your full name").max(128),
  email: z.string().email("Invalid email"),
  mobile: z
    .string()
    .regex(/^[6-9]\d{9}$/, "10-digit Indian mobile starting 6/7/8/9"),
  pan: z
    .string()
    .regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, "Invalid PAN format")
    .optional()
    .or(z.literal("")),
  password: z
    .string()
    .min(8, "Minimum 8 characters")
    .regex(/[A-Z]/, "Must contain an uppercase letter")
    .regex(/[a-z]/, "Must contain a lowercase letter")
    .regex(/\d/, "Must contain a digit"),
});
type FormValues = z.infer<typeof schema>;

export default function RegisterPage() {
  const router = useRouter();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { full_name: "", email: "", mobile: "", pan: "", password: "" },
  });

  async function onSubmit(values: FormValues) {
    try {
      await AuthAPI.register({
        full_name: values.full_name,
        email: values.email,
        mobile: values.mobile,
        pan: values.pan || undefined,
        password: values.password,
      });
      toast.success("Account created. Please sign in.");
      router.push("/login");
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Registration failed";
      toast.error(msg);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight">Create account</h2>
        <p className="text-sm text-muted-foreground">Open your trading account in 60 seconds.</p>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="full_name">Full name</Label>
          <Input id="full_name" placeholder="Rohan Sharma" {...form.register("full_name")} />
          {form.formState.errors.full_name && (
            <p className="text-xs text-destructive">{form.formState.errors.full_name.message}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" placeholder="you@example.com" {...form.register("email")} />
            {form.formState.errors.email && (
              <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="mobile">Mobile</Label>
            <Input id="mobile" inputMode="numeric" maxLength={10} placeholder="9999900000" {...form.register("mobile")} />
            {form.formState.errors.mobile && (
              <p className="text-xs text-destructive">{form.formState.errors.mobile.message}</p>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="pan">PAN (optional)</Label>
          <Input
            id="pan"
            placeholder="ABCDE1234F"
            maxLength={10}
            className="uppercase"
            {...form.register("pan", {
              onChange: (e) => (e.target.value = e.target.value.toUpperCase()),
            })}
          />
          {form.formState.errors.pan && (
            <p className="text-xs text-destructive">{form.formState.errors.pan.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" {...form.register("password")} />
          {form.formState.errors.password && (
            <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
          )}
        </div>

        <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
          Create account
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}

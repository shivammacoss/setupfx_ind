"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Mail, MapPin, MessageSquare, Phone, Send } from "lucide-react";
import { toast } from "sonner";

const CHANNELS = [
  {
    icon: Mail,
    title: "Email",
    primary: "support@setupfx.com",
    href: "mailto:support@setupfx.com",
    desc: "Replies within 4 working hours on trading days.",
  },
  {
    icon: Phone,
    title: "Phone",
    primary: "+91 80 6900 0000",
    href: "tel:+918069000000",
    desc: "Mon–Fri · 09:00–18:00 IST (excluding NSE holidays).",
  },
  {
    icon: MapPin,
    title: "Office",
    primary: "Bengaluru, Karnataka",
    href: "#",
    desc: "HSR Layout · Visits by appointment only.",
  },
];

export default function ContactPage() {
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    setSubmitting(true);
    try {
      // Marketing site form — no backend wiring yet. We just simulate the
      // send so the user gets feedback. When ready, POST this to a /contact
      // ingestion endpoint or a forms-as-a-service (e.g. Formspree).
      await new Promise((r) => setTimeout(r, 500));
      toast.success("Message sent — we'll reply within 4 working hours.");
      form.reset();
    } finally {
      setSubmitting(false);
    }
    void data;
  }

  return (
    <>
      {/* Hero */}
      <section className="border-b border-border bg-gradient-to-b from-primary/5 to-background">
        <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 sm:py-20 lg:px-8">
          <span className="text-xs font-semibold uppercase tracking-wider text-primary">
            Contact
          </span>
          <h1 className="mt-2 text-4xl font-bold tracking-tight sm:text-5xl">
            We're here when you need us.
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground sm:text-lg">
            KYC questions, brokerage clarifications, withdrawals, or a feature
            request — pick whichever channel works for you.
          </p>
        </div>
      </section>

      {/* Channels */}
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-4 sm:grid-cols-3">
          {CHANNELS.map((c) => {
            const Icon = c.icon;
            return (
              <a
                key={c.title}
                href={c.href}
                className="rounded-xl border border-border bg-card p-5 transition-all hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5"
              >
                <div className="grid size-10 place-items-center rounded-md bg-primary/10 text-primary">
                  <Icon className="size-5" />
                </div>
                <div className="mt-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {c.title}
                </div>
                <div className="mt-1 text-sm font-semibold text-foreground">
                  {c.primary}
                </div>
                <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
                  {c.desc}
                </p>
              </a>
            );
          })}
        </div>
      </section>

      {/* Form */}
      <section id="form" className="border-y border-border bg-muted/20 py-16">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <MessageSquare className="mx-auto size-7 text-primary" />
            <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
              Send us a message
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Pre-tickets help us route your query faster. We reply on weekdays
              within 4 working hours.
            </p>
          </div>

          <form
            onSubmit={onSubmit}
            className="mt-8 space-y-4 rounded-xl border border-border bg-card p-6"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field name="name" label="Your name" placeholder="Vibhooti Bhooshan" required />
              <Field name="email" label="Email" type="email" placeholder="you@example.com" required />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field name="phone" label="Phone (optional)" placeholder="+91 …" />
              <SelectField
                name="topic"
                label="Topic"
                required
                options={[
                  { value: "kyc", label: "KYC / Account opening" },
                  { value: "brokerage", label: "Brokerage / charges" },
                  { value: "deposit", label: "Deposits & withdrawals" },
                  { value: "trading", label: "Trading / order issue" },
                  { value: "feedback", label: "Product feedback" },
                  { value: "careers", label: "Careers" },
                  { value: "other", label: "Other" },
                ]}
              />
            </div>
            <TextareaField name="message" label="Message" rows={5} required />

            <div className="flex items-center justify-between gap-3 pt-2">
              <p className="text-[11px] text-muted-foreground">
                By submitting, you agree to be contacted by our support team.
              </p>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                {submitting ? "Sending…" : (
                  <>
                    Send message <Send className="size-3.5" />
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-4 rounded-xl border border-border bg-card p-6 text-center sm:flex-row sm:text-left">
          <div>
            <h2 className="text-xl font-semibold">Existing customer?</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Login first — we'll have all your account context when you raise a ticket.
            </p>
          </div>
          <Link
            href="/login"
            className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Login to your account <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>
    </>
  );
}

function Field({
  name,
  label,
  placeholder,
  type = "text",
  required = false,
}: {
  name: string;
  label: string;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </span>
      <input
        type={type}
        name={name}
        placeholder={placeholder}
        required={required}
        className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary"
      />
    </label>
  );
}

function TextareaField({
  name,
  label,
  rows = 4,
  required = false,
}: {
  name: string;
  label: string;
  rows?: number;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </span>
      <textarea
        name={name}
        rows={rows}
        required={required}
        placeholder="Tell us how we can help…"
        className="mt-1 w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
      />
    </label>
  );
}

function SelectField({
  name,
  label,
  options,
  required = false,
}: {
  name: string;
  label: string;
  options: { value: string; label: string }[];
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </span>
      <select
        name={name}
        required={required}
        defaultValue=""
        className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary"
      >
        <option value="" disabled>
          Choose a topic…
        </option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

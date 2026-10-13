import { Label as LabelPrimitive, Slot } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "./cn.ts";

const buttonVariants = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 shadow-sm",
  secondary: "bg-panel text-ink border border-line hover:bg-brand-50 dark:hover:bg-white/5",
  ghost: "text-ink hover:bg-brand-50 dark:hover:bg-white/5",
  danger: "bg-status-red text-white hover:opacity-90",
} as const;

export function Button({
  variant = "primary",
  asChild,
  className,
  ...props
}: ComponentProps<"button"> & { variant?: keyof typeof buttonVariants; asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
        "disabled:pointer-events-none disabled:opacity-50",
        buttonVariants[variant],
        className,
      )}
      {...props}
    />
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-lg border border-line bg-panel px-3 text-sm text-ink placeholder:text-muted",
        "focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25",
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-10 w-full rounded-lg border border-line bg-panel px-3 text-sm text-ink",
        "focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25",
        className,
      )}
      {...props}
    />
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <LabelPrimitive.Root className="grid gap-1.5 text-sm font-medium">
      <span>{label}</span>
      {children}
      {hint && <span className="text-xs font-normal text-muted">{hint}</span>}
    </LabelPrimitive.Root>
  );
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-card border border-line bg-panel p-5 shadow-xs", className)} {...props} />;
}

const tones = {
  green: "bg-status-green",
  orange: "bg-status-orange",
  red: "bg-status-red",
  purple: "bg-status-purple",
  blue: "bg-status-blue",
  pink: "bg-status-pink",
  brand: "bg-brand-600",
} as const;
export type Tone = keyof typeof tones;

export function Badge({ tone = "brand", className, ...props }: ComponentProps<"span"> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold text-white",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

export function Stat({ label, value, tone = "brand" }: { label: string; value: ReactNode; tone?: Tone }) {
  return (
    <Card className="relative overflow-hidden">
      <span className={cn("absolute inset-y-0 left-0 w-1.5", tones[tone])} />
      <div className="text-sm text-muted">{label}</div>
      <div className="mt-1 text-3xl font-semibold tabular-nums">{value}</div>
    </Card>
  );
}

export function ErrorText({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-lg bg-status-red/10 px-3 py-2 text-sm text-status-red">
      {children}
    </p>
  );
}

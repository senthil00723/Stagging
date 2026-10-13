import { Badge, Button, Card, ErrorText, Field, Input, Stat } from "@g3/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut, ShieldCheck } from "lucide-react";
import { useActionState, useState } from "react";
import { ApiError, adminApi } from "./api.ts";

type LoginStep =
  | { status: "totp"; challenge: string }
  | { status: "enroll"; challenge: string; otpauthUrl: string; qrDataUrl: string };

interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: "active" | "suspended";
  users: number;
  createdAt: string;
}

export function App() {
  const me = useQuery({ queryKey: ["me"], queryFn: () => adminApi<{ email: string }>("/me") });
  if (me.isPending) return <div className="grid min-h-dvh place-items-center text-muted">Loading…</div>;
  return me.data ? <Console email={me.data.email} /> : <Login />;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-gradient-to-br from-zinc-900 via-zinc-800 to-brand-700 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2 text-lg font-bold text-white">
          <ShieldCheck className="size-5" /> G3Leads Platform Admin
        </div>
        <Card className="p-6">{children}</Card>
      </div>
    </div>
  );
}

function Login() {
  const qc = useQueryClient();
  const [step, setStep] = useState<LoginStep | null>(null);
  const message = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong");

  const [pwError, passwordAction, pwPending] = useActionState<string | null, FormData>(async (_p, f) => {
    try {
      setStep(await adminApi<LoginStep>("/auth/login", { method: "POST", body: Object.fromEntries(f) }));
      return null;
    } catch (e) {
      return message(e);
    }
  }, null);

  const [codeError, codeAction, codePending] = useActionState<string | null, FormData>(async (_p, f) => {
    try {
      await adminApi("/auth/totp", { method: "POST", body: { challenge: step!.challenge, code: f.get("code") } });
      await qc.invalidateQueries({ queryKey: ["me"] });
      return null;
    } catch (e) {
      if (e instanceof ApiError && e.message.includes("expired")) setStep(null);
      return message(e);
    }
  }, null);

  if (!step) {
    return (
      <Shell>
        <form action={passwordAction} className="grid gap-4">
          <Field label="Email">
            <Input name="email" type="email" autoComplete="username" required />
          </Field>
          <Field label="Password">
            <Input name="password" type="password" autoComplete="current-password" required />
          </Field>
          <ErrorText>{pwError}</ErrorText>
          <Button disabled={pwPending}>Continue</Button>
        </form>
      </Shell>
    );
  }

  return (
    <Shell>
      <form action={codeAction} className="grid gap-4">
        {step.status === "enroll" ? (
          <div className="grid justify-items-center gap-2 text-center text-sm">
            <p className="font-medium">Two-factor authentication is mandatory.</p>
            <p className="text-muted">Scan with Google Authenticator, Authy or 1Password, then enter the code.</p>
            <img src={step.qrDataUrl} alt="TOTP enrolment QR code" className="size-44 rounded-lg bg-white p-2" />
            <code className="break-all text-xs text-muted" data-testid="otpauth">
              {step.otpauthUrl}
            </code>
          </div>
        ) : (
          <p className="text-sm text-muted">Enter the 6-digit code from your authenticator app.</p>
        )}
        <Field label="Authentication code">
          <Input
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            required
            autoFocus
          />
        </Field>
        <ErrorText>{codeError}</ErrorText>
        <Button disabled={codePending}>Verify</Button>
      </form>
    </Shell>
  );
}

function Console({ email }: { email: string }) {
  const qc = useQueryClient();
  const metrics = useQuery({
    queryKey: ["metrics"],
    queryFn: () => adminApi<Record<string, number>>("/metrics"),
  });
  const tenants = useQuery({ queryKey: ["tenants"], queryFn: () => adminApi<Tenant[]>("/tenants") });
  const toggle = useMutation({
    mutationFn: (t: Tenant) =>
      adminApi(`/tenants/${t.id}/${t.status === "active" ? "suspend" : "reactivate"}`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries(),
  });
  const logout = useMutation({
    mutationFn: () => adminApi("/auth/logout", { method: "POST" }),
    onSuccess: () => qc.resetQueries(),
  });

  return (
    <div className="min-h-dvh">
      <header className="flex items-center justify-between bg-zinc-900 px-4 py-3 text-white md:px-8">
        <div className="flex items-center gap-2 font-semibold">
          <ShieldCheck className="size-5" /> G3Leads Platform Admin
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="hidden opacity-70 sm:inline">{email}</span>
          <Button variant="ghost" className="text-white hover:bg-white/10" onClick={() => logout.mutate()}>
            <LogOut className="size-4" />
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl p-4 md:p-8">
        <div className="grid gap-4 sm:grid-cols-4">
          <Stat label="Tenants" value={metrics.data?.tenants ?? "–"} tone="purple" />
          <Stat label="Active" value={metrics.data?.active ?? "–"} tone="green" />
          <Stat label="Suspended" value={metrics.data?.suspended ?? "–"} tone="red" />
          <Stat label="Users" value={metrics.data?.users ?? "–"} tone="blue" />
        </div>
        <h2 className="mt-8 mb-3 font-semibold">Tenants</h2>
        <div className="overflow-x-auto rounded-card border border-line bg-panel">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
              <tr>
                {["Organization", "Workspace", "Users", "Status", "Created", ""].map((h) => (
                  <th key={h} className="px-4 py-3 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {tenants.data?.map((t) => (
                <tr key={t.id}>
                  <td className="px-4 py-3 font-medium">{t.name}</td>
                  <td className="px-4 py-3 font-mono text-xs">{t.slug}</td>
                  <td className="px-4 py-3 tabular-nums">{t.users}</td>
                  <td className="px-4 py-3">
                    <Badge tone={t.status === "active" ? "green" : "red"}>{t.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-muted">{new Date(t.createdAt).toLocaleDateString("en-IN")}</td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant={t.status === "active" ? "danger" : "secondary"}
                      className="h-8"
                      onClick={() => toggle.mutate(t)}
                    >
                      {t.status === "active" ? "Suspend" : "Reactivate"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-6 text-xs text-muted">
          Every action here is written to the platform audit log. Impersonation, billing overrides and feature flags
          arrive in Phase 5.
        </p>
      </main>
    </div>
  );
}

import { Button } from "@g3/ui";
import { useState } from "react";
import { useNavigate } from "react-router";
import { api } from "../lib/api.ts";
import { useAuth } from "../lib/auth.ts";
import { DEMO_ACCOUNTS, DEMO_PASSWORD, resetDemo } from "./mock-api.ts";

/** Demo build only: one-click sign-in as each seeded role. */
export function DemoAccounts() {
  const navigate = useNavigate();
  const load = useAuth((s) => s.load);
  const [busy, setBusy] = useState<string | null>(null);
  const [reset, setReset] = useState(false);

  const signIn = async (email: string) => {
    setBusy(email);
    const res = await api<{ landingRoute: string }>("/auth/login", {
      method: "POST",
      body: { email, password: DEMO_PASSWORD },
    });
    await load();
    navigate(res.landingRoute, { replace: true });
  };

  return (
    <div className="mt-6 grid gap-3 border-t border-line pt-5">
      <div>
        <p className="text-sm font-semibold">Try a role</p>
        <p className="text-xs text-muted">
          Demo workspace “Acme Traders”. Every account uses the password <code>{DEMO_PASSWORD}</code>. Data stays in
          this browser.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {DEMO_ACCOUNTS.map((a) => (
          <Button
            key={a.email}
            variant="secondary"
            className="h-auto flex-col items-start gap-0 px-3 py-2 text-left"
            disabled={busy !== null}
            onClick={() => signIn(a.email)}
          >
            <span className="text-sm font-medium">{a.label}</span>
            <span className="text-xs font-normal text-muted">{a.email}</span>
          </Button>
        ))}
      </div>
      <button
        type="button"
        className="justify-self-start text-xs text-muted underline underline-offset-2"
        onClick={() => {
          resetDemo();
          setReset(true);
        }}
      >
        {reset ? "Demo data reset" : "Reset demo data"}
      </button>
    </div>
  );
}

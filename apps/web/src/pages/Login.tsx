import { Button, ErrorText, Field, Input } from "@g3/ui";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { DemoAccounts } from "../demo/DemoAccounts.tsx";
import { AuthCard } from "./AuthCard.tsx";
import { str, useAuthAction } from "./useAuthAction.ts";

export function LoginPage() {
  const { t } = useTranslation();
  const [error, action, pending] = useAuthAction("/auth/login", (f) => ({
    email: str(f, "email"),
    password: f.get("password"),
    orgSlug: str(f, "orgSlug"),
  }));
  return (
    <AuthCard
      title={t("login.title")}
      footer={
        <>
          {t("login.noAccount")}{" "}
          <Link className="font-medium text-brand-600" to="/signup">
            {t("login.create")}
          </Link>
        </>
      }
    >
      <form action={action} className="grid gap-4">
        <Field label={t("login.email")}>
          <Input name="email" type="email" autoComplete="username" required />
        </Field>
        <Field label={t("login.password")}>
          <Input name="password" type="password" autoComplete="current-password" required />
        </Field>
        <Field label={t("login.workspace")} hint="Only needed if your email belongs to several workspaces">
          <Input name="orgSlug" placeholder="acme" />
        </Field>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" disabled={pending}>
          {t("login.submit")}
        </Button>
      </form>
      {import.meta.env.VITE_DEMO === "1" && <DemoAccounts />}
    </AuthCard>
  );
}

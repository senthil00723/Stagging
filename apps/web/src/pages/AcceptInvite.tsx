import { Button, ErrorText, Field, Input } from "@g3/ui";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { AuthCard } from "./AuthCard.tsx";
import { str, useAuthAction } from "./useAuthAction.ts";

export function AcceptInvitePage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [error, action, pending] = useAuthAction("/auth/accept-invite", (f) => ({
    token,
    name: str(f, "name"),
    password: f.get("password"),
  }));
  return (
    <AuthCard title={t("invite.title")}>
      <form action={action} className="grid gap-4">
        <Field label={t("signup.name")}>
          <Input name="name" required autoComplete="name" />
        </Field>
        <Field label={t("login.password")} hint="At least 10 characters">
          <Input name="password" type="password" minLength={10} required autoComplete="new-password" />
        </Field>
        <ErrorText>{token ? error : "This invite link is incomplete."}</ErrorText>
        <Button type="submit" disabled={pending || !token}>
          {t("invite.submit")}
        </Button>
      </form>
    </AuthCard>
  );
}

import { Button, ErrorText, Field, Input } from "@g3/ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { AuthCard } from "./AuthCard.tsx";
import { str, useAuthAction } from "./useAuthAction.ts";

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

export function SignupPage() {
  const { t } = useTranslation();
  const [slug, setSlug] = useState("");
  const [touched, setTouched] = useState(false);
  const [error, action, pending] = useAuthAction("/auth/signup", (f) => ({
    orgName: str(f, "orgName"),
    slug: str(f, "slug"),
    name: str(f, "name"),
    email: str(f, "email"),
    password: f.get("password"),
  }));
  return (
    <AuthCard
      title={t("signup.title")}
      footer={
        <>
          {t("signup.haveAccount")}{" "}
          <Link className="font-medium text-brand-600" to="/login">
            {t("login.submit")}
          </Link>
        </>
      }
    >
      <form action={action} className="grid gap-4">
        <Field label={t("signup.orgName")}>
          <Input name="orgName" required onChange={(e) => !touched && setSlug(slugify(e.target.value))} />
        </Field>
        <Field label={t("signup.slug")} hint={`${slug || "your-company"}.g3leads.com`}>
          <Input
            name="slug"
            required
            value={slug}
            onChange={(e) => {
              setTouched(true);
              setSlug(slugify(e.target.value));
            }}
          />
        </Field>
        <Field label={t("signup.name")}>
          <Input name="name" required autoComplete="name" />
        </Field>
        <Field label={t("login.email")}>
          <Input name="email" type="email" required autoComplete="email" />
        </Field>
        <Field label={t("login.password")} hint="At least 10 characters">
          <Input name="password" type="password" minLength={10} required autoComplete="new-password" />
        </Field>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" disabled={pending}>
          {t("signup.submit")}
        </Button>
      </form>
    </AuthCard>
  );
}

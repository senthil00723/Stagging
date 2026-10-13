import { Button, Card, ErrorText, Field, Input, Stat } from "@g3/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api.ts";
import { useAuth } from "../lib/auth.ts";
import type { Contact } from "./contacts.ts";
import { PageHeader, Table } from "./PageHeader.tsx";

export function MyWorkspacePage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const userId = useAuth((s) => s.session?.user.id);
  const contacts = useQuery({ queryKey: ["contacts"], queryFn: () => api<Contact[]>("/contacts") });
  const mine = contacts.data?.filter((c) => c.ownerId === userId) ?? [];

  const add = useMutation({
    mutationFn: (body: { name: string; email?: string; phone?: string }) => api("/contacts", { method: "POST", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contacts"] }),
  });
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const opt = (k: string) => String(f.get(k) ?? "").trim() || undefined;
    add.mutate({ name: String(f.get("name")), email: opt("email"), phone: opt("phone") });
    e.currentTarget.reset();
  };

  return (
    <>
      <PageHeader title={t("workspace.title")} subtitle="Only the leads and contacts you own" />
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label={t("workspace.myContacts")} value={contacts.isSuccess ? mine.length : "–"} tone="purple" />
        <Stat label="Tasks due today" value="Phase 1" tone="orange" />
        <Stat label="Deals in pipeline" value="Phase 1" tone="green" />
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Table head={[t("workspace.name"), "Email", t("workspace.phone")]}>
          {mine.map((c) => (
            <tr key={c.id}>
              <td className="px-4 py-3 font-medium">{c.name}</td>
              <td className="px-4 py-3 text-muted">{c.email ?? "—"}</td>
              <td className="px-4 py-3 tabular-nums">{c.phone ?? "—"}</td>
            </tr>
          ))}
        </Table>
        <Card>
          <h2 className="mb-4 font-semibold">{t("workspace.add")}</h2>
          <form onSubmit={submit} className="grid gap-3">
            <Field label={t("workspace.name")}>
              <Input name="name" required />
            </Field>
            <Field label="Email">
              <Input name="email" type="email" />
            </Field>
            <Field label={t("workspace.phone")}>
              <Input name="phone" type="tel" placeholder="+91 98765 43210" />
            </Field>
            <ErrorText>{add.error?.message}</ErrorText>
            <Button type="submit" disabled={add.isPending}>
              {t("workspace.add")}
            </Button>
          </form>
        </Card>
      </div>
    </>
  );
}

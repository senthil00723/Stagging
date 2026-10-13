import { Card, Stat } from "@g3/ui";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api.ts";
import { PageHeader } from "./PageHeader.tsx";

export function InboxPage() {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ["dash", "inbox"],
    queryFn: () => api<{ openConversations: number }>("/dashboards/inbox"),
  });
  return (
    <>
      <PageHeader title={t("inbox.title")} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Open conversations" value={q.data?.openConversations ?? "–"} tone="blue" />
      </div>
      <Card className="mt-6 text-muted">{t("inbox.soon")}</Card>
    </>
  );
}

export function InvoicingPage() {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ["dash", "invoicing"],
    queryFn: () => api<{ outstandingInr: number }>("/dashboards/invoicing"),
  });
  const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });
  return (
    <>
      <PageHeader title={t("invoicing.title")} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Outstanding" value={q.data ? inr.format(q.data.outstandingInr) : "–"} tone="green" />
      </div>
      <Card className="mt-6 text-muted">{t("invoicing.soon")}</Card>
    </>
  );
}

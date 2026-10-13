import { Card, Stat } from "@g3/ui";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api.ts";
import type { Contact } from "./contacts.ts";
import { PageHeader, Table } from "./PageHeader.tsx";

interface TeamSummary {
  contacts: number;
  byOwner: { owner: string | null; contacts: number }[];
}

const BAR = ["bg-status-purple", "bg-status-green", "bg-status-blue", "bg-status-orange", "bg-status-pink"];

export function TeamPage() {
  const { t } = useTranslation();
  const summary = useQuery({ queryKey: ["dash", "team"], queryFn: () => api<TeamSummary>("/dashboards/team") });
  const contacts = useQuery({ queryKey: ["contacts"], queryFn: () => api<Contact[]>("/contacts") });
  const max = Math.max(1, ...(summary.data?.byOwner.map((o) => o.contacts) ?? []));

  return (
    <>
      <PageHeader title={t("team.title")} subtitle="Team-wide view for managers and leads" />
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label={t("team.contacts")} value={summary.data?.contacts ?? "–"} tone="blue" />
        <Stat label="Reps with contacts" value={summary.data?.byOwner.length ?? "–"} tone="green" />
        <Stat label="Open deals" value="Phase 1" tone="pink" />
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-[20rem_1fr]">
        <Card>
          <h2 className="mb-4 font-semibold">{t("team.byOwner")}</h2>
          <div className="grid gap-3">
            {summary.data?.byOwner.map((o, i) => (
              <div key={o.owner ?? "unassigned"} className="grid gap-1 text-sm">
                <div className="flex justify-between">
                  <span>{o.owner ?? "Unassigned"}</span>
                  <span className="tabular-nums text-muted">{o.contacts}</span>
                </div>
                <div className="h-2 rounded-full bg-black/5 dark:bg-white/10">
                  <div
                    className={`h-2 rounded-full ${BAR[i % BAR.length]}`}
                    style={{ width: `${(o.contacts / max) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
        <Table head={["Name", "Email", "Phone"]}>
          {contacts.data?.map((c) => (
            <tr key={c.id}>
              <td className="px-4 py-3 font-medium">{c.name}</td>
              <td className="px-4 py-3 text-muted">{c.email ?? "—"}</td>
              <td className="px-4 py-3 tabular-nums">{c.phone ?? "—"}</td>
            </tr>
          ))}
        </Table>
      </div>
    </>
  );
}

import { LANDING_ROUTES, PERMISSION_KEYS, PERMISSIONS } from "@g3/shared";
import { Badge, Button, Card, ErrorText, Field, Input, Select, Stat, type Tone } from "@g3/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api.ts";
import { PageHeader, Table } from "./PageHeader.tsx";

interface Role {
  id: string;
  name: string;
  landingRoute: string;
  permissions: string[];
  isSystem: boolean;
}
interface User {
  id: string;
  name: string;
  email: string;
  roleId: string;
  roleName: string;
  positionName: string | null;
}
interface AdminSummary {
  users: number;
  roles: number;
  pendingInvites: number;
  recentAudit: { action: string; entity: string; createdAt: string }[];
}

const ROLE_TONES: Tone[] = ["purple", "green", "blue", "orange", "pink", "red"];

export function AdminPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const summary = useQuery({ queryKey: ["dash", "admin"], queryFn: () => api<AdminSummary>("/dashboards/admin") });
  const roles = useQuery({ queryKey: ["roles"], queryFn: () => api<Role[]>("/roles") });
  const users = useQuery({ queryKey: ["users"], queryFn: () => api<User[]>("/users") });
  const toneOf = (roleId: string) =>
    ROLE_TONES[Math.max(0, roles.data?.findIndex((r) => r.id === roleId) ?? 0) % ROLE_TONES.length]!;

  const changeRole = useMutation({
    mutationFn: ({ id, roleId }: { id: string; roleId: string }) =>
      api(`/users/${id}`, { method: "PATCH", body: { roleId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });

  return (
    <>
      <PageHeader title={t("admin.title")} subtitle="Users, roles and the customization engine for your organization" />
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label={t("admin.users")} value={summary.data?.users ?? "–"} tone="purple" />
        <Stat label={t("admin.roles")} value={summary.data?.roles ?? "–"} tone="green" />
        <Stat label={t("admin.pendingInvites")} value={summary.data?.pendingInvites ?? "–"} tone="orange" />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_22rem]">
        <section>
          <h2 className="mb-3 font-semibold">{t("admin.users")}</h2>
          <Table head={["Name", "Email", "Position", "Role"]}>
            {users.data?.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-3 font-medium">{u.name}</td>
                <td className="px-4 py-3 text-muted">{u.email}</td>
                <td className="px-4 py-3">{u.positionName ?? "—"}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Badge tone={toneOf(u.roleId)}>{u.roleName}</Badge>
                    <Select
                      aria-label={`Change role for ${u.name}`}
                      className="h-8 w-auto text-xs"
                      value={u.roleId}
                      onChange={(e) => changeRole.mutate({ id: u.id, roleId: e.target.value })}
                    >
                      {roles.data?.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        </section>
        <InviteCard roles={roles.data ?? []} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_22rem]">
        <section>
          <h2 className="mb-3 font-semibold">{t("admin.roles")}</h2>
          <Table head={["Role", "Lands on", "Permissions"]}>
            {roles.data?.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3">
                  <Badge tone={toneOf(r.id)}>{r.name}</Badge>
                  {!r.isSystem && <span className="ml-2 text-xs text-muted">custom</span>}
                </td>
                <td className="px-4 py-3 font-mono text-xs">{r.landingRoute}</td>
                <td className="px-4 py-3 text-xs text-muted">{r.permissions.join(", ")}</td>
              </tr>
            ))}
          </Table>
        </section>
        <NewRoleCard />
      </div>

      <section className="mt-8">
        <h2 className="mb-3 font-semibold">{t("admin.recent")}</h2>
        <Card className="divide-y divide-[var(--line)] p-0">
          {summary.data?.recentAudit.length === 0 && <p className="px-5 py-4 text-sm text-muted">No activity yet.</p>}
          {summary.data?.recentAudit.map((a) => (
            <div key={`${a.createdAt}-${a.action}-${a.entity}`} className="flex justify-between px-5 py-2.5 text-sm">
              <span>
                <span className="font-medium">{a.action}</span> {a.entity}
              </span>
              <time className="text-muted">{new Date(a.createdAt).toLocaleString("en-IN")}</time>
            </div>
          ))}
        </Card>
      </section>
    </>
  );
}

function InviteCard({ roles }: { roles: Role[] }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [link, setLink] = useState<string | null>(null);
  const invite = useMutation({
    mutationFn: (body: { email: string; roleId: string }) =>
      api<{ invitePath: string }>("/invitations", { method: "POST", body }),
    onSuccess: (r) => {
      setLink(window.location.origin + r.invitePath);
      void qc.invalidateQueries({ queryKey: ["dash", "admin"] });
    },
  });
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    invite.mutate({ email: String(f.get("email")), roleId: String(f.get("roleId")) });
    e.currentTarget.reset();
  };
  return (
    <Card>
      <h2 className="mb-4 font-semibold">{t("admin.invite")}</h2>
      <form onSubmit={submit} className="grid gap-3">
        <Field label={t("login.email")}>
          <Input name="email" type="email" required />
        </Field>
        <Field label="Role">
          <Select name="roleId" required>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </Field>
        <ErrorText>{invite.error?.message}</ErrorText>
        <Button type="submit" disabled={invite.isPending}>
          {t("admin.invite")}
        </Button>
      </form>
      {link && (
        <div className="mt-4 grid gap-2 rounded-lg bg-brand-50 p-3 text-xs dark:bg-white/5">
          <span className="font-medium">{t("admin.inviteLink")}</span>
          <code className="break-all" data-testid="invite-link">
            {link}
          </code>
          <Button variant="secondary" className="h-8" onClick={() => navigator.clipboard.writeText(link)}>
            <Copy className="size-3.5" /> Copy
          </Button>
        </div>
      )}
    </Card>
  );
}

function NewRoleCard() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const create = useMutation({
    mutationFn: (body: { name: string; landingRoute: string; permissions: string[] }) =>
      api("/roles", { method: "POST", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["roles"] }),
  });
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    create.mutate({
      name: String(f.get("name")),
      landingRoute: String(f.get("landingRoute")),
      permissions: f.getAll("permissions").map(String),
    });
    e.currentTarget.reset();
  };
  return (
    <Card>
      <h2 className="mb-1 font-semibold">{t("admin.newRole")}</h2>
      <p className="mb-4 text-xs text-muted">e.g. “Regional Sales Head”, no engineer needed.</p>
      <form onSubmit={submit} className="grid gap-3">
        <Field label="Name">
          <Input name="name" required minLength={2} />
        </Field>
        <Field label="Landing page">
          <Select name="landingRoute">
            {LANDING_ROUTES.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </Select>
        </Field>
        <fieldset className="grid gap-1.5 text-sm">
          <legend className="mb-1.5 font-medium">Permissions</legend>
          {PERMISSION_KEYS.map((p) => (
            <label key={p} className="flex items-start gap-2">
              <input type="checkbox" name="permissions" value={p} className="mt-1 accent-brand-600" />
              <span>
                <span className="font-mono text-xs">{p}</span>
                <span className="block text-xs text-muted">{PERMISSIONS[p]}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <ErrorText>{create.error?.message}</ErrorText>
        <Button type="submit" disabled={create.isPending}>
          {t("admin.create")}
        </Button>
      </form>
    </Card>
  );
}

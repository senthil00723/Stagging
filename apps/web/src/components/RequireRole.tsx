import type { Permission } from "@g3/shared";
import { Card } from "@g3/ui";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../lib/auth.ts";

/**
 * Route guard driven by the session's permissions (roles are tenant data, so
 * we gate on permissions rather than role names). UX only: the API enforces
 * the same permission on every request behind this page.
 */
export function RequireRole({ permission, children }: { permission: Permission; children: ReactNode }) {
  const allowed = useAuth((s) => s.session?.permissions.includes(permission) ?? false);
  const { t } = useTranslation();
  if (!allowed) {
    return (
      <Card className="mx-auto mt-16 max-w-md text-center" data-testid="forbidden">
        <p className="text-lg font-medium">{t("forbidden")}</p>
      </Card>
    );
  }
  return children;
}

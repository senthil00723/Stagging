import { Card } from "@g3/ui";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Brand } from "../components/AppShell.tsx";

export function AuthCard({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="w-full max-w-md">
      <div className="mb-6 grid justify-items-center gap-1 text-center">
        <Brand />
        <p className="text-sm text-muted">{t("tagline")}</p>
      </div>
      <Card className="p-6 sm:p-8">
        <h1 className="mb-5 text-xl font-semibold">{title}</h1>
        {children}
      </Card>
      {footer && <p className="mt-4 text-center text-sm text-muted">{footer}</p>}
    </div>
  );
}

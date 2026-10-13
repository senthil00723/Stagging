import { LANDING_ROUTES, ROUTE_PERMISSION } from "@g3/shared";
import { Button, cn } from "@g3/ui";
import { Inbox, LayoutDashboard, LogOut, ReceiptIndianRupee, Settings2, UserRound, Users } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { setLanguage } from "../i18n/index.ts";
import { useAuth } from "../lib/auth.ts";

const ICONS = {
  "/admin": Settings2,
  "/team": Users,
  "/my-workspace": UserRound,
  "/inbox": Inbox,
  "/invoicing": ReceiptIndianRupee,
} as const;

function useSessionBootstrap() {
  const { status, load } = useAuth();
  useEffect(() => {
    if (status === "loading") void load();
  }, [status, load]);
  return status;
}

export function PublicOnly() {
  const status = useSessionBootstrap();
  const session = useAuth((s) => s.session);
  if (status === "loading") return <Splash />;
  if (session) return <Navigate to={session.role.landingRoute} replace />;
  return (
    <div className="grid min-h-dvh place-items-center bg-gradient-to-br from-brand-50 via-surface to-surface px-4 py-10">
      <Outlet />
    </div>
  );
}

export function AppShell() {
  const status = useSessionBootstrap();
  const { session, can, logout } = useAuth();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  if (status === "loading") return <Splash />;
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  const nav = LANDING_ROUTES.filter((r) => can(ROUTE_PERMISSION[r]));

  return (
    <div className="flex min-h-dvh">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-panel p-4 md:flex">
        <Brand />
        <div className="mt-6 mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-muted">
          {session.org.name}
        </div>
        <nav className="grid gap-1">
          {nav.map((route) => {
            const Icon = ICONS[route];
            return (
              <NavLink
                key={route}
                to={route}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium",
                    isActive ? "bg-brand-600 text-white" : "hover:bg-brand-50 dark:hover:bg-white/5",
                  )
                }
              >
                <Icon className="size-4" />
                {t(`nav.${route.slice(1)}`)}
              </NavLink>
            );
          })}
        </nav>
        <div className="mt-auto grid gap-3 border-t border-line pt-4 text-sm">
          <div>
            <div className="font-medium">{session.user.name}</div>
            <div className="text-xs text-muted">
              {session.position?.name ?? session.role.name} · {session.role.name}
            </div>
          </div>
          <div className="flex gap-1 text-xs">
            {(["en", "hi"] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLanguage(l)}
                className={cn("rounded px-2 py-1", i18n.language === l ? "bg-brand-100 text-brand-700" : "text-muted")}
              >
                {l === "en" ? "English" : "हिन्दी"}
              </button>
            ))}
          </div>
          <Button
            variant="secondary"
            onClick={async () => {
              await logout();
              navigate("/login");
            }}
          >
            <LogOut className="size-4" /> {t("nav.logout")}
          </Button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-line bg-panel px-4 py-3 md:hidden">
          <Brand />
          <Button variant="ghost" onClick={() => logout().then(() => navigate("/login"))} aria-label={t("nav.logout")}>
            <LogOut className="size-4" />
          </Button>
        </header>
        <nav className="flex gap-1 overflow-x-auto border-b border-line bg-panel px-2 py-2 md:hidden">
          {nav.map((route) => (
            <NavLink
              key={route}
              to={route}
              className={({ isActive }) =>
                cn("whitespace-nowrap rounded-md px-3 py-1.5 text-sm", isActive && "bg-brand-600 text-white")
              }
            >
              {t(`nav.${route.slice(1)}`)}
            </NavLink>
          ))}
        </nav>
        <main className="mx-auto w-full max-w-6xl flex-1 p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function Brand() {
  return (
    <div className="flex items-center gap-2 px-2 text-lg font-bold tracking-tight">
      <span className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-brand-500 to-status-pink text-white">
        <LayoutDashboard className="size-4" />
      </span>
      G3Leads
    </div>
  );
}

function Splash() {
  return <div className="grid min-h-dvh place-items-center text-muted">Loading…</div>;
}

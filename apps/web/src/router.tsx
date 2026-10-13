import { createBrowserRouter, createHashRouter, Navigate } from "react-router";
import { AppShell, PublicOnly } from "./components/AppShell.tsx";
import { RequireRole } from "./components/RequireRole.tsx";
import { useAuth } from "./lib/auth.ts";
import { AcceptInvitePage } from "./pages/AcceptInvite.tsx";
import { AdminPage } from "./pages/Admin.tsx";
import { LoginPage } from "./pages/Login.tsx";
import { MyWorkspacePage } from "./pages/MyWorkspace.tsx";
import { InboxPage, InvoicingPage } from "./pages/Placeholders.tsx";
import { SignupPage } from "./pages/Signup.tsx";
import { TeamPage } from "./pages/Team.tsx";

/** After login everyone lands on their role's (tenant-configurable) route. */
function Landing() {
  const session = useAuth((s) => s.session);
  return <Navigate to={session?.role.landingRoute ?? "/login"} replace />;
}

// The static demo is served from a single page, so it routes with the URL hash.
const createRouter = import.meta.env.VITE_DEMO === "1" ? createHashRouter : createBrowserRouter;

export const router = createRouter([
  {
    element: <PublicOnly />,
    children: [
      { path: "/login", element: <LoginPage /> },
      { path: "/signup", element: <SignupPage /> },
      { path: "/accept-invite", element: <AcceptInvitePage /> },
    ],
  },
  {
    element: <AppShell />,
    children: [
      { index: true, element: <Landing /> },
      {
        path: "/admin",
        element: (
          <RequireRole permission="org.admin">
            <AdminPage />
          </RequireRole>
        ),
      },
      {
        path: "/team",
        element: (
          <RequireRole permission="team.view">
            <TeamPage />
          </RequireRole>
        ),
      },
      {
        path: "/my-workspace",
        element: (
          <RequireRole permission="contacts.read.own">
            <MyWorkspacePage />
          </RequireRole>
        ),
      },
      {
        path: "/inbox",
        element: (
          <RequireRole permission="inbox.view">
            <InboxPage />
          </RequireRole>
        ),
      },
      {
        path: "/invoicing",
        element: (
          <RequireRole permission="billing.view">
            <InvoicingPage />
          </RequireRole>
        ),
      },
      { path: "*", element: <Landing /> },
    ],
  },
]);

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router/dom";
import { installDemoApi } from "./demo/mock-api.ts";
import "./i18n/index.ts";
import "./index.css";
import { router } from "./router.tsx";

// Static demo build: serve the API from the browser instead of apps/api.
if (import.meta.env.VITE_DEMO === "1") installDemoApi();

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);

import { useActionState } from "react";
import { useNavigate } from "react-router";
import { ApiError, api } from "../lib/api.ts";
import { useAuth } from "../lib/auth.ts";

/** React 19 form action: POST the form, load the session, go to the role's landing page. */
export function useAuthAction(path: string, toBody: (f: FormData) => unknown) {
  const navigate = useNavigate();
  const load = useAuth((s) => s.load);
  return useActionState<string | null, FormData>(async (_prev, form) => {
    try {
      const res = await api<{ landingRoute: string }>(path, { method: "POST", body: toBody(form) });
      await load();
      navigate(res.landingRoute, { replace: true });
      return null;
    } catch (e) {
      return e instanceof ApiError ? e.message : "Something went wrong";
    }
  }, null);
}

export const str = (f: FormData, k: string) => {
  const v = String(f.get(k) ?? "").trim();
  return v === "" ? undefined : v;
};

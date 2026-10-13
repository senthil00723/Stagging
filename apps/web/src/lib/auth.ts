import type { Permission, Session } from "@g3/shared";
import { create } from "zustand";
import { api } from "./api.ts";

type Status = "loading" | "authenticated" | "anonymous";

interface AuthState {
  status: Status;
  session: Session | null;
  load: () => Promise<Session | null>;
  logout: () => Promise<void>;
  can: (p: Permission) => boolean;
}

/** Client-side session store. Purely for rendering decisions: the API
 *  re-checks every permission on every request. */
export const useAuth = create<AuthState>((set, get) => ({
  status: "loading",
  session: null,
  load: async () => {
    try {
      const session = await api<Session>("/me");
      set({ status: "authenticated", session });
      return session;
    } catch {
      set({ status: "anonymous", session: null });
      return null;
    }
  },
  logout: async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => {});
    set({ status: "anonymous", session: null });
  },
  can: (p) => get().session?.permissions.includes(p) ?? false,
}));

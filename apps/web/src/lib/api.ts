/** Fetch wrapper: cookies carry the session (httpOnly), and a 401 triggers
 *  one silent refresh-token rotation before giving up. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

let refreshing: Promise<boolean> | null = null;
const refresh = () =>
  (refreshing ??= fetch("/api/v1/auth/refresh", { method: "POST", credentials: "include" })
    .then((r) => r.ok)
    .finally(() => {
      refreshing = null;
    }));

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}, retry = true): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    method: init.method ?? "GET",
    credentials: "include",
    headers: init.body === undefined ? undefined : { "content-type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (res.status === 401 && retry && !path.startsWith("/auth/")) {
    if (await refresh()) return api<T>(path, init, false);
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.error ?? res.statusText);
  return data as T;
}

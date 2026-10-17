export class ApiError extends Error {
  constructor(message: string, public readonly code: string, public readonly status: number, public readonly details?: unknown) {
    super(message); this.name = "ApiError";
  }
}
export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store", credentials: "same-origin", ...init,
    headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers },
  });
  const data = await response.json();
  if (!response.ok) throw new ApiError(data.error?.message || "Unable to load this information.", data.error?.code || "REQUEST_FAILED", response.status, data.error?.details);
  return data as T;
}

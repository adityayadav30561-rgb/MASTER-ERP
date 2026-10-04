/**
 * HTTP client for /api/v1 (API-AND-INTEGRATION-ARCHITECTURE §2): JSON in and out, errors as RFC 9457 problem
 * details, ETag/If-Match for updates. Cookies carry the session (same origin).
 */
export interface FieldError {
  field: string;
  message: string;
}

export class ApiError extends Error {
  override name = "ApiError";
  constructor(
    readonly status: number,
    readonly type: string,
    readonly title: string,
    readonly detail: string | undefined,
    readonly errors: FieldError[],
  ) {
    super(detail ? `${title}: ${detail}` : title);
  }

  get needsStepUp(): boolean {
    return this.type.endsWith("/step-up");
  }
}

export interface Versioned<T> {
  data: T;
  etag: string | null;
}

async function problem(response: Response): Promise<ApiError> {
  let body: { type?: string; title?: string; detail?: string; errors?: FieldError[] } = {};
  try {
    body = (await response.json()) as typeof body;
  } catch {
    /* not JSON */
  }
  return new ApiError(response.status, body.type ?? "about:blank", body.title ?? response.statusText, body.detail, body.errors ?? []);
}

export async function request<T>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<Versioned<T>> {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: { accept: "application/json", ...(body !== undefined && !(body instanceof Blob) ? { "content-type": "application/json" } : {}), ...headers },
    ...(body !== undefined ? { body: body instanceof Blob ? body : JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw await problem(response);
  const text = response.status === 204 ? "" : await response.text();
  return { data: (text ? JSON.parse(text) : undefined) as T, etag: response.headers.get("etag") };
}

export const api = {
  get: async <T>(path: string) => (await request<T>("GET", path)).data,
  getVersioned: <T>(path: string) => request<T>("GET", path),
  post: async <T>(path: string, body?: unknown, headers?: Record<string, string>) => (await request<T>("POST", path, body ?? {}, headers)).data,
  put: <T>(path: string, body: unknown, etag?: string | null) => request<T>("PUT", path, body, etag ? { "if-match": etag } : {}),
  upload: async <T>(path: string, file: Blob, contentType: string) => (await request<T>("POST", path, file, { "content-type": contentType })).data,
};

/** Download a file response (Excel template) and save it. */
export async function download(path: string, filename: string): Promise<void> {
  const response = await fetch(path, { credentials: "same-origin" });
  if (!response.ok) throw await problem(response);
  const url = URL.createObjectURL(await response.blob());
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

/** Server field paths ("addresses[0].line1", "ext.gsm") → form field names ("addresses.0.line1", "ext.gsm"). */
export function formField(field: string): string {
  return field.replace(/\[(\d+)\]/g, ".$1");
}

/** Form building blocks: a labelled field with its error, and a problem banner for API errors. */
import type { ReactNode } from "react";
import { ApiError } from "../lib/api.ts";

export function Field({ label, htmlFor, error, hint, required, children }: { label: string; htmlFor: string; error?: string | undefined; hint?: string | undefined; required?: boolean; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-700">
        {label}
        {required ? <span className="text-red-700" aria-hidden> *</span> : null}
      </label>
      {children}
      {hint && !error ? <p className="text-xs text-slate-500">{hint}</p> : null}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-xs text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** The text of a form field error (React Hook Form's error type is wider than a string). */
export function messageOf(error: { message?: unknown } | undefined): string | undefined {
  return typeof error?.message === "string" ? error.message : undefined;
}

export function ProblemBanner({ error }: { error: unknown }) {
  if (!error) return null;
  const e = error instanceof ApiError ? error : undefined;
  return (
    <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
      <p className="font-medium">{e?.title ?? "Something went wrong"}</p>
      {e?.detail ? <p>{e.detail}</p> : null}
      {e && e.errors.length > 0 && e.errors.some((x) => !x.field) ? (
        <ul className="list-disc pl-5">{e.errors.filter((x) => !x.field).map((x) => <li key={x.message}>{x.message}</li>)}</ul>
      ) : null}
      {!e && error instanceof Error ? <p>{error.message}</p> : null}
    </div>
  );
}

export function PageHeader({ title, actions, children }: { title: string; actions?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold">{title}</h1>
        {children ? <div className="text-sm text-slate-600">{children}</div> : null}
      </div>
      {actions ? <div className="flex gap-2">{actions}</div> : null}
    </div>
  );
}

/**
 * Role home (UX-ARCHITECTURE §3): each person lands on what their role needs. Owner/Admin see the getting-started
 * checklist; shop-floor people get big tiles for their tasks; everyone else gets their menu as shortcuts.
 */
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Circle } from "lucide-react";
import { api } from "../lib/api.ts";
import { useCan, useMe } from "../session.tsx";
import { useMenu } from "../components/shell.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card.tsx";
import { PageHeader } from "../components/form.tsx";

interface ChecklistStatus {
  key: string;
  area: string;
  label: string;
  help: string | null;
  manual: boolean;
  done: boolean;
}

const LINKS: Record<string, string> = {
  "organisation.sites": "/admin/org",
  "users.invited": "/admin/users",
  "users.mfa": "/admin/users",
  "configuration.numbering": "/admin/numbering",
  "configuration.settings": "/admin/settings",
  "masters.customers": "/import",
  "masters.vendors": "/import",
  "masters.items": "/import",
};

export function Checklist({ compact = false }: { compact?: boolean }) {
  const { data } = useQuery({ queryKey: ["checklist"], queryFn: () => api.get<ChecklistStatus[]>("/api/v1/admin/checklist") });
  if (!data) return null;
  const done = data.filter((c) => c.done).length;
  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle>Getting started</CardTitle>
        <span className="text-sm text-slate-600">{done} of {data.length} done</span>
      </CardHeader>
      <CardContent>
        <div className="mb-3 h-2 rounded bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={data.length} aria-valuenow={done} aria-label="Checklist progress">
          <div className="h-2 rounded bg-green-600" style={{ width: `${(done / Math.max(data.length, 1)) * 100}%` }} />
        </div>
        <ul className="space-y-2">
          {data.filter((c) => !compact || !c.done).map((c) => (
            <li key={c.key} className="flex items-start gap-2 text-sm">
              {c.done ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-green-700" aria-label="done" /> : <Circle className="mt-0.5 h-4 w-4 text-slate-400" aria-label="to do" />}
              <span>
                <Link to={LINKS[c.key] ?? "/"} className={c.done ? "text-slate-500" : "font-medium text-brand-700 hover:underline"}>{c.label}</Link>
                {c.help && !c.done ? <span className="block text-xs text-slate-500">{c.help}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export function HomePage() {
  const { data: me } = useMe();
  const can = useCan();
  const menu = useMenu();
  const shortcuts = menu.main.filter((m) => m.to !== "/");

  if (me?.authMethod === "device-pin") {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Hello, {me.displayName}</h1>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {shortcuts.map((m) => (
            <Link key={m.to} to={m.to} className="flex h-28 items-center gap-4 rounded-xl border border-slate-200 bg-white p-5 text-xl font-medium shadow-sm hover:bg-brand-50">
              <m.icon className="h-8 w-8 text-brand-700" aria-hidden />
              {m.label}
            </Link>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader title={`Welcome, ${me?.displayName ?? ""}`}>{me?.tenantName}</PageHeader>
      <div className="grid gap-4 lg:grid-cols-2">
        {can("admin.settings.read") ? <Checklist compact /> : null}
        <Card>
          <CardHeader><CardTitle>Shortcuts</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-2">
            {[...shortcuts, ...menu.admin].map((m) => (
              <Link key={m.to} to={m.to} className="flex items-center gap-2 rounded-md border border-slate-200 p-3 text-sm hover:bg-slate-50">
                <m.icon className="h-4 w-4 text-brand-700" aria-hidden />
                {m.label}
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

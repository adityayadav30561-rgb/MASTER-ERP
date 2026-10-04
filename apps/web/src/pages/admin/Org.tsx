/** Organisation: the company, its sites and stores (ADR-0004). Scopes on roles refer to these units. */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { api } from "../../lib/api.ts";
import { useCan } from "../../session.tsx";
import { Button } from "../../components/ui/button.tsx";
import { Input, Select } from "../../components/ui/input.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card.tsx";
import { Field, PageHeader, ProblemBanner } from "../../components/form.tsx";

interface OrgUnit { id: string; kind: string; parent_id: string | null; code: string; name: string }
const CHILD_KINDS: Record<string, string[]> = { company: ["site", "department", "cost_center"], site: ["warehouse", "work_center"], warehouse: ["location"] };

export function OrgPage() {
  const can = useCan();
  const client = useQueryClient();
  const units = useQuery({ queryKey: ["org-units"], queryFn: () => api.get<OrgUnit[]>("/api/v1/admin/org-units") });
  const [error, setError] = useState<unknown>(null);
  const form = useForm<{ parentId: string; kind: string; code: string; name: string }>();
  const parentId = form.watch("parentId");
  const parent = units.data?.find((u) => u.id === parentId);

  const tree = (parent: string | null, depth: number): React.ReactNode[] =>
    (units.data ?? []).filter((u) => u.parent_id === parent).flatMap((u) => [
      <li key={u.id} style={{ paddingLeft: `${depth * 1.25}rem` }} className="py-0.5 text-sm">
        <span className="font-medium">{u.name}</span> <span className="font-mono text-xs text-slate-500">{u.code}</span> <span className="text-xs text-slate-500">· {u.kind.replace("_", " ")}</span>
      </li>,
      ...tree(u.id, depth + 1),
    ]);

  return (
    <div className="grid max-w-5xl gap-4 lg:grid-cols-2">
      <div className="lg:col-span-2"><PageHeader title="Organisation">Sites are factories or offices; stores (warehouses) hold stock.</PageHeader></div>
      <Card>
        <CardHeader><CardTitle>Structure</CardTitle></CardHeader>
        <CardContent><ul>{tree(null, 0)}</ul></CardContent>
      </Card>
      {can("admin.org.manage") ? (
        <Card>
          <CardHeader><CardTitle>Add a unit</CardTitle></CardHeader>
          <CardContent>
            <form
              className="space-y-3"
              onSubmit={form.handleSubmit(async (v) => {
                setError(null);
                try {
                  await api.post("/api/v1/admin/org-units", { ...v, code: v.code.toUpperCase() });
                  await client.invalidateQueries({ queryKey: ["org-units"] });
                  form.reset({ parentId: v.parentId, kind: v.kind, code: "", name: "" });
                } catch (e) {
                  setError(e);
                }
              })}
            >
              <ProblemBanner error={error} />
              <Field label="Under" htmlFor="o-parent">
                <Select id="o-parent" {...form.register("parentId", { required: true })}>
                  <option value="">—</option>
                  {units.data?.filter((u) => CHILD_KINDS[u.kind]).map((u) => <option key={u.id} value={u.id}>{u.name} ({u.kind})</option>)}
                </Select>
              </Field>
              <Field label="Kind" htmlFor="o-kind">
                <Select id="o-kind" {...form.register("kind", { required: true })}>
                  {(CHILD_KINDS[parent?.kind ?? ""] ?? []).map((k) => <option key={k} value={k}>{k.replace("_", " ")}</option>)}
                </Select>
              </Field>
              <Field label="Code" htmlFor="o-code" hint="Short, e.g. VAPI or FG"><Input id="o-code" className="uppercase" {...form.register("code", { required: true })} /></Field>
              <Field label="Name" htmlFor="o-name"><Input id="o-name" {...form.register("name", { required: true })} /></Field>
              <Button type="submit">Add</Button>
            </form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

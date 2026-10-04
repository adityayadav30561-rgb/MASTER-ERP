/** People and roles: list members, add a person with scoped roles, change roles, set a shop-floor PIN. */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import type { FieldPath } from "react-hook-form";
import { api, ApiError, formField } from "../../lib/api.ts";
import { useCan, useStepUp } from "../../session.tsx";
import { Button } from "../../components/ui/button.tsx";
import { Input, Select } from "../../components/ui/input.tsx";
import { Card } from "../../components/ui/card.tsx";
import { Badge } from "../../components/ui/badge.tsx";
import { Dialog } from "../../components/ui/dialog.tsx";
import { Table, Td, Th } from "../../components/ui/table.tsx";
import { Field, messageOf, PageHeader, ProblemBanner } from "../../components/form.tsx";

interface Scope { type: string; id?: string }
interface Member { membershipId: string; displayName: string; status: string; employeeCode: string | null; hasPin: boolean; roles: { role: string; roleName: string; privileged: boolean; shopFloor: boolean; scope: Scope }[] }
interface Role { code: string; name: string; description: string | null; privileged: boolean; shopFloor: boolean; permissions: string[] }
interface OrgUnit { id: string; kind: string; code: string; name: string }

export function UsersPage() {
  const can = useCan();
  const withStepUp = useStepUp();
  const client = useQueryClient();
  const members = useQuery({ queryKey: ["members"], queryFn: () => api.get<Member[]>("/api/v1/admin/members") });
  const roles = useQuery({ queryKey: ["roles"], queryFn: () => api.get<Role[]>("/api/v1/admin/roles"), enabled: can("admin.roles.read") });
  const units = useQuery({ queryKey: ["org-units"], queryFn: () => api.get<OrgUnit[]>("/api/v1/admin/org-units"), enabled: can("admin.org.read") });
  const [adding, setAdding] = useState(false);
  const [pinFor, setPinFor] = useState<Member | null>(null);
  const [error, setError] = useState<unknown>(null);
  const unitName = (id?: string) => units.data?.find((u) => u.id === id)?.name ?? "one unit";
  const manage = can("admin.users.manage");

  const setStatus = async (m: Member, status: "active" | "suspended") => {
    try {
      await withStepUp(() => api.post(`/api/v1/admin/members/${m.membershipId}/status`, { status }));
      await client.invalidateQueries({ queryKey: ["members"] });
    } catch (e) {
      setError(e);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader title="People and roles" actions={manage ? <Button onClick={() => setAdding(true)}>Add a person</Button> : undefined}>
        Roles decide what each person sees and does; a scope limits a role to one site or store.
      </PageHeader>
      <ProblemBanner error={error ?? members.error} />
      <Card>
        <Table>
          <thead><tr><Th>Name</Th><Th>Employee code</Th><Th>Roles</Th><Th>Status</Th><Th><span className="sr-only">Actions</span></Th></tr></thead>
          <tbody>
            {members.data?.map((m) => (
              <tr key={m.membershipId}>
                <Td className="font-medium">{m.displayName}</Td>
                <Td className="font-mono text-xs">{m.employeeCode}</Td>
                <Td className="space-x-1">
                  {m.roles.map((r) => (
                    <Badge key={`${r.role}-${r.scope.id ?? r.scope.type}`} tone={r.privileged ? "warn" : "info"}>
                      {r.roleName}{r.scope.type === "org_unit" ? ` · ${unitName(r.scope.id)}` : ""}
                    </Badge>
                  ))}
                </Td>
                <Td><Badge tone={m.status === "active" ? "good" : "bad"}>{m.status}</Badge></Td>
                <Td className="space-x-2 whitespace-nowrap text-right">
                  {manage && m.roles.some((r) => r.shopFloor) ? <Button size="sm" variant="outline" onClick={() => setPinFor(m)}>{m.hasPin ? "Change PIN" : "Set PIN"}</Button> : null}
                  {manage ? (m.status === "active" ? <Button size="sm" variant="ghost" onClick={() => void setStatus(m, "suspended")}>Suspend</Button> : <Button size="sm" variant="ghost" onClick={() => void setStatus(m, "active")}>Re-activate</Button>) : null}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
      {roles.data ? (
        <details className="rounded-lg border border-slate-200 bg-white p-4">
          <summary className="cursor-pointer font-medium">Roles and what they allow ({roles.data.length})</summary>
          <ul className="mt-3 space-y-2 text-sm">
            {roles.data.map((r) => (
              <li key={r.code}>
                <span className="font-medium">{r.name}</span> {r.privileged ? <Badge tone="warn">two-step sign-in</Badge> : null} {r.shopFloor ? <Badge>tablet</Badge> : null}
                <span className="block text-xs text-slate-600">{r.description}</span>
                <span className="block font-mono text-xs text-slate-500">{r.permissions.join(" · ")}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <AddPersonDialog open={adding} onClose={() => setAdding(false)} roles={roles.data ?? []} units={units.data ?? []} />
      <PinDialog member={pinFor} onClose={() => setPinFor(null)} />
    </div>
  );
}

function AddPersonDialog({ open, onClose, roles, units }: { open: boolean; onClose: () => void; roles: Role[]; units: OrgUnit[] }) {
  const withStepUp = useStepUp();
  const client = useQueryClient();
  const [error, setError] = useState<unknown>(null);
  type PersonForm = { name: string; email: string; employeeCode: string; role: string; scope: string; initialPassword: string };
  const form = useForm<PersonForm>({ defaultValues: { scope: "tenant" } });
  const err = (n: string) => messageOf(form.getFieldState(n as FieldPath<PersonForm>, form.formState).error);
  const submit = form.handleSubmit(async (v) => {
    setError(null);
    try {
      await withStepUp(() =>
        api.post("/api/v1/admin/members", {
          name: v.name, email: v.email, ...(v.employeeCode ? { employeeCode: v.employeeCode } : {}), ...(v.initialPassword ? { initialPassword: v.initialPassword } : {}),
          roles: [{ role: v.role, scope: v.scope === "tenant" ? { type: "tenant" } : { type: "org_unit", id: v.scope } }],
        }),
      );
      await client.invalidateQueries({ queryKey: ["members"] });
      form.reset();
      onClose();
    } catch (e) {
      if (e instanceof ApiError) for (const fe of e.errors) form.setError(formField(fe.field).replace(/^roles\.0\..*/, "role") as FieldPath<PersonForm>, { message: fe.message });
      setError(e);
    }
  });
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title="Add a person" description="They sign in with their e-mail and the password you set, or with Google/Microsoft.">
      <form className="space-y-3" onSubmit={(e) => void submit(e)}>
        <ProblemBanner error={error} />
        <Field label="Name" htmlFor="m-name" required error={err("name")}><Input id="m-name" {...form.register("name", { required: "is required" })} /></Field>
        <Field label="E-mail" htmlFor="m-email" required error={err("email")}><Input id="m-email" type="email" {...form.register("email", { required: "is required" })} /></Field>
        <Field label="Employee code" htmlFor="m-code" hint="Needed for tablet sign-in with a PIN" error={err("employeeCode")}><Input id="m-code" {...form.register("employeeCode")} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Role" htmlFor="m-role" required error={err("role")}>
            <Select id="m-role" {...form.register("role", { required: "is required" })}>
              <option value="">—</option>
              {roles.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
            </Select>
          </Field>
          <Field label="Where" htmlFor="m-scope">
            <Select id="m-scope" {...form.register("scope")}>
              <option value="tenant">Whole business</option>
              {units.filter((u) => u.kind !== "company").map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="First password" htmlFor="m-password" hint="At least 15 characters; they can change it later" error={err("initialPassword")}><Input id="m-password" type="password" autoComplete="new-password" {...form.register("initialPassword")} /></Field>
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={form.formState.isSubmitting}>Add</Button></div>
      </form>
    </Dialog>
  );
}

function PinDialog({ member, onClose }: { member: Member | null; onClose: () => void }) {
  const client = useQueryClient();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<unknown>(null);
  return (
    <Dialog open={Boolean(member)} onOpenChange={(o) => !o && onClose()} title={`Tablet PIN for ${member?.displayName ?? ""}`} description="6 digits, not easy to guess (not 123456 or 111111).">
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api.post(`/api/v1/admin/members/${member?.membershipId ?? ""}/pin`, { pin });
            await client.invalidateQueries({ queryKey: ["members"] });
            setPin("");
            onClose();
          } catch (x) {
            setError(x);
          }
        }}
      >
        <ProblemBanner error={error} />
        <Field label="PIN" htmlFor="pin"><Input id="pin" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value)} autoComplete="off" /></Field>
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button type="submit">Save PIN</Button></div>
      </form>
    </Dialog>
  );
}

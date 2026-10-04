/** Parties: list (search, role filter, load more) and the master form (UX archetypes "list" and "master"). */
import { useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import type { FieldPath } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { api, ApiError, formField } from "../lib/api.ts";
import { useCan } from "../session.tsx";
import { Button } from "../components/ui/button.tsx";
import { Input, Select } from "../components/ui/input.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card.tsx";
import { StatusBadge, Badge } from "../components/ui/badge.tsx";
import { Table, Td, Th } from "../components/ui/table.tsx";
import { Field, messageOf, PageHeader, ProblemBanner } from "../components/form.tsx";
import { ExtFields } from "../components/ext-fields.tsx";
import type { FieldDef } from "../components/ext-fields.tsx";

interface PartySummary { id: string; code: string; name: string; status: string; roles: string[]; gstins: string[]; city: string | null }
interface Page<T> { items: T[]; nextCursor: string | null }
const ROLES = ["customer", "vendor", "transporter", "job_worker"] as const;

export function PartiesPage() {
  const { t } = useTranslation();
  const can = useCan();
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const query = useInfiniteQuery({
    queryKey: ["parties", search, role],
    initialPageParam: "",
    queryFn: ({ pageParam }) => {
      const p = new URLSearchParams({ limit: "50" });
      if (search) p.set("search", search);
      if (role) p.set("filter[role]", role);
      if (pageParam) p.set("cursor", pageParam);
      return api.get<Page<PartySummary>>(`/api/v1/parties?${p.toString()}`);
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const rows = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div>
      <PageHeader title={t("nav.parties")} actions={can("foundation.party.create") ? <Button asChild><Link to="/parties/new">{t("common.new")}</Link></Button> : undefined}>
        Customers, vendors, transporters and job workers — one master (ADR-0013).
      </PageHeader>
      <div className="mb-3 flex flex-wrap gap-2">
        <Input className="max-w-xs" type="search" placeholder={`${t("common.search")}: name or code`} aria-label="Search parties" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select className="max-w-[12rem]" aria-label="Role" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">All roles</option>
          {ROLES.map((r) => <option key={r} value={r}>{r.replace("_", " ")}</option>)}
        </Select>
      </div>
      <ProblemBanner error={query.error} />
      <Card>
        <Table>
          <thead><tr><Th>Code</Th><Th>Name</Th><Th>Roles</Th><Th>GSTIN</Th><Th>City</Th><Th>Status</Th></tr></thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50">
                <Td className="font-mono text-xs">{p.code}</Td>
                <Td><Link to="/parties/$id" params={{ id: p.id }} className="font-medium text-brand-700 hover:underline">{p.name}</Link></Td>
                <Td className="space-x-1">{p.roles.map((r) => <Badge key={r} tone="info">{r.replace("_", " ")}</Badge>)}</Td>
                <Td className="font-mono text-xs">{p.gstins.join(", ")}</Td>
                <Td>{p.city}</Td>
                <Td><StatusBadge status={p.status} /></Td>
              </tr>
            ))}
            {rows.length === 0 && !query.isLoading ? <tr><Td colSpan={6} className="text-center text-slate-500">{t("common.none")}</Td></tr> : null}
          </tbody>
        </Table>
      </Card>
      {query.hasNextPage ? <Button variant="outline" className="mt-3" onClick={() => void query.fetchNextPage()}>{t("common.loadMore")}</Button> : null}
    </div>
  );
}

interface PartyForm {
  code?: string;
  name: string;
  legalName?: string;
  roles: string[];
  gstin?: string;
  pan?: string;
  addresses: { kind: string; line1: string; line2?: string; city: string; district?: string; regionCode: string; postalCode?: string }[];
  contacts: { name: string; phone?: string; email?: string }[];
  ext: Record<string, unknown>;
}

interface Party extends Omit<PartyForm, "gstin" | "pan"> { id: string; code: string; status: string; version: number; taxIds: { scheme: string; value: string }[] }

const blankAddress = { kind: "registered", line1: "", city: "", regionCode: "" };

function toForm(p: Party): PartyForm {
  return {
    code: p.code, name: p.name, legalName: p.legalName ?? "", roles: p.roles,
    gstin: p.taxIds.find((x) => x.scheme === "gstin")?.value ?? "", pan: p.taxIds.find((x) => x.scheme === "pan")?.value ?? "",
    addresses: p.addresses.length ? p.addresses : [blankAddress], contacts: p.contacts.length ? p.contacts : [{ name: "" }], ext: p.ext,
  };
}

function toBody(f: PartyForm) {
  const clean = <T extends object>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== "" && v !== undefined && v !== null)) as T;
  return clean({
    code: f.code || undefined, name: f.name, legalName: f.legalName || undefined, roles: f.roles,
    taxIds: [f.gstin ? { scheme: "gstin", value: f.gstin } : null, f.pan ? { scheme: "pan", value: f.pan } : null].filter(Boolean),
    addresses: f.addresses.filter((a) => a.line1 || a.city).map((a) => clean({ ...a, regionCode: a.regionCode.toUpperCase() })),
    contacts: f.contacts.filter((c) => c.name).map((c) => clean(c)),
    ext: Object.fromEntries(Object.entries(f.ext ?? {}).filter(([, v]) => v !== "" && v !== undefined && v !== null)),
  });
}

export function PartyFormPage({ id }: { id?: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const client = useQueryClient();
  const can = useCan();
  const existing = useQuery({ queryKey: ["party", id], queryFn: () => api.getVersioned<Party>(`/api/v1/parties/${id ?? ""}`), enabled: Boolean(id) });
  const fields = useQuery({ queryKey: ["fields", "foundation.party"], queryFn: () => api.get<FieldDef[]>("/api/v1/fields/foundation.party") });
  const [error, setError] = useState<unknown>(null);
  const form = useForm<PartyForm>({
    ...(existing.data ? { values: toForm(existing.data.data) } : {}),
    defaultValues: { name: "", roles: ["customer"], addresses: [blankAddress], contacts: [{ name: "" }], ext: {} },
  });
  const editable = id ? can("foundation.party.update") : can("foundation.party.create");
  const err = (n: string) => messageOf(form.getFieldState(n as FieldPath<PartyForm>, form.formState).error);

  const save = form.handleSubmit(async (values) => {
    setError(null);
    try {
      const body = toBody(values);
      const saved = id ? (await api.put<Party>(`/api/v1/parties/${id}`, body, existing.data?.etag)).data : await api.post<Party>("/api/v1/parties", body);
      await client.invalidateQueries({ queryKey: ["parties"] });
      await client.invalidateQueries({ queryKey: ["party", saved.id] });
      await navigate({ to: "/parties/$id", params: { id: saved.id } });
    } catch (e) {
      if (e instanceof ApiError) {
        for (const fe of e.errors) {
          const name = formField(fe.field).replace(/^taxIds\.0\.value$/, values.gstin ? "gstin" : "pan").replace(/^taxIds\.1\.value$/, "pan");
          form.setError(name as FieldPath<PartyForm>, { message: fe.message });
        }
      }
      setError(e);
    }
  });

  const status = existing.data?.data.status;
  const act = async (action: string) => {
    try {
      await api.post(`/api/v1/parties/${id ?? ""}/actions/${action}`);
      await existing.refetch();
      await client.invalidateQueries({ queryKey: ["parties"] });
    } catch (e) {
      setError(e);
    }
  };

  return (
    <form onSubmit={(e) => void save(e)} className="max-w-4xl space-y-4" noValidate>
      <PageHeader
        title={id ? (existing.data?.data.name ?? "…") : "New party"}
        actions={
          <>
            {id && status && can("foundation.party.update") ? (
              status === "active" ? <Button variant="outline" onClick={() => void act("block")}>Block</Button> : <Button variant="outline" onClick={() => void act("unblock")}>Unblock</Button>
            ) : null}
            {editable ? <Button type="submit" disabled={form.formState.isSubmitting}>{t("common.save")}</Button> : null}
          </>
        }
      >
        {id ? <span className="font-mono">{existing.data?.data.code}</span> : null} {status ? <StatusBadge status={status} /> : null}
      </PageHeader>
      <ProblemBanner error={error} />
      <fieldset disabled={!editable} className="space-y-4">
        <Card>
          <CardHeader><CardTitle>General</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" htmlFor="name" required error={err("name")}><Input id="name" {...form.register("name", { required: "is required" })} /></Field>
            <Field label="Code" htmlFor="code" hint="Leave blank to generate from the name" error={err("code")}><Input id="code" {...form.register("code")} /></Field>
            <Field label="Legal name" htmlFor="legalName" error={err("legalName")}><Input id="legalName" {...form.register("legalName")} /></Field>
            <div>
              <p className="mb-1 text-sm font-medium text-slate-700">Roles <span className="text-red-700" aria-hidden>*</span></p>
              <div className="flex flex-wrap gap-3" role="group" aria-label="Roles">
                {ROLES.map((r) => (
                  <label key={r} className="flex items-center gap-1 text-sm"><input type="checkbox" value={r} {...form.register("roles")} /> {r.replace("_", " ")}</label>
                ))}
              </div>
              {err("roles") ? <p role="alert" className="text-xs text-red-700">{err("roles")}</p> : null}
            </div>
            <Field label="GSTIN" htmlFor="gstin" error={err("gstin")} hint="15 characters; the state must match an address"><Input id="gstin" className="font-mono uppercase" {...form.register("gstin")} /></Field>
            <Field label="PAN" htmlFor="pan" error={err("pan")}><Input id="pan" className="font-mono uppercase" {...form.register("pan")} /></Field>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Address</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Field label="Address line 1" htmlFor="a-line1" error={err("addresses.0.line1")}><Input id="a-line1" {...form.register("addresses.0.line1")} /></Field>
            <Field label="Address line 2" htmlFor="a-line2"><Input id="a-line2" {...form.register("addresses.0.line2")} /></Field>
            <Field label="City" htmlFor="a-city" error={err("addresses.0.city")}><Input id="a-city" {...form.register("addresses.0.city")} /></Field>
            <Field label="State code" htmlFor="a-region" hint="ISO code, e.g. IN-MH for Maharashtra" error={err("addresses.0.regionCode")}><Input id="a-region" className="uppercase" {...form.register("addresses.0.regionCode")} /></Field>
            <Field label="PIN code" htmlFor="a-pin" error={err("addresses.0.postalCode")}><Input id="a-pin" inputMode="numeric" {...form.register("addresses.0.postalCode")} /></Field>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Contact</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <Field label="Name" htmlFor="c-name" error={err("contacts.0.name")}><Input id="c-name" {...form.register("contacts.0.name")} /></Field>
            <Field label="Phone" htmlFor="c-phone" error={err("contacts.0.phone")}><Input id="c-phone" type="tel" {...form.register("contacts.0.phone")} /></Field>
            <Field label="E-mail" htmlFor="c-email" error={err("contacts.0.email")}><Input id="c-email" type="email" {...form.register("contacts.0.email")} /></Field>
          </CardContent>
        </Card>
        {fields.data && fields.data.length > 0 ? (
          <Card>
            <CardHeader><CardTitle>More details</CardTitle></CardHeader>
            <CardContent><ExtFields fields={fields.data} form={form} /></CardContent>
          </Card>
        ) : null}
      </fieldset>
    </form>
  );
}

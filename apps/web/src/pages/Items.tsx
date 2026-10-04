/** Items: list and master form. The attribute fields follow the chosen category (board → GSM, size …). */
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
import { StatusBadge } from "../components/ui/badge.tsx";
import { Table, Td, Th } from "../components/ui/table.tsx";
import { Field, messageOf, PageHeader, ProblemBanner } from "../components/form.tsx";
import { ExtFields } from "../components/ext-fields.tsx";
import type { FieldDef } from "../components/ext-fields.tsx";

interface ItemSummary { id: string; code: string; name: string; category: string; baseUom: string; hsnSac: string | null; status: string }
interface Category { id: string; code: string; name: string; itemType: string; defaultUom: string | null }
interface Uom { code: string; name: string }
interface TaxCategory { code: string; name: string }
interface Item {
  id: string; code: string; name: string; description: string | null; category: string; itemType: string; baseUom: string; hsnSac: string | null; taxCategory: string | null;
  status: string; ext: Record<string, unknown>; computed: Record<string, unknown>; conversions: { from: string; to: string; factor: string }[]; version: number;
}
interface ItemForm { code?: string; name: string; description?: string; category: string; baseUom?: string; hsnSac?: string; taxCategory?: string; ext: Record<string, unknown> }

export function ItemsPage() {
  const { t } = useTranslation();
  const can = useCan();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const categories = useQuery({ queryKey: ["item-categories"], queryFn: () => api.get<Category[]>("/api/v1/item-categories") });
  const query = useInfiniteQuery({
    queryKey: ["items", search, category],
    initialPageParam: "",
    queryFn: ({ pageParam }) => {
      const p = new URLSearchParams({ limit: "50" });
      if (search) p.set("search", search);
      if (category) p.set("filter[category]", category);
      if (pageParam) p.set("cursor", pageParam);
      return api.get<{ items: ItemSummary[]; nextCursor: string | null }>(`/api/v1/items?${p.toString()}`);
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const rows = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div>
      <PageHeader title={t("nav.items")} actions={can("foundation.item.create") ? <Button asChild><Link to="/items/new">{t("common.new")}</Link></Button> : undefined} />
      <div className="mb-3 flex flex-wrap gap-2">
        <Input className="max-w-xs" type="search" placeholder={`${t("common.search")}: name or code`} aria-label="Search items" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select className="max-w-[14rem]" aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {categories.data?.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
        </Select>
      </div>
      <ProblemBanner error={query.error} />
      <Card>
        <Table>
          <thead><tr><Th>Code</Th><Th>Name</Th><Th>Category</Th><Th>Unit</Th><Th>HSN/SAC</Th><Th>Status</Th></tr></thead>
          <tbody>
            {rows.map((i) => (
              <tr key={i.id} className="hover:bg-slate-50">
                <Td className="font-mono text-xs">{i.code}</Td>
                <Td><Link to="/items/$id" params={{ id: i.id }} className="font-medium text-brand-700 hover:underline">{i.name}</Link></Td>
                <Td>{i.category}</Td>
                <Td>{i.baseUom}</Td>
                <Td className="font-mono text-xs">{i.hsnSac}</Td>
                <Td><StatusBadge status={i.status} /></Td>
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

export function ItemFormPage({ id }: { id?: string }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const client = useQueryClient();
  const can = useCan();
  const [error, setError] = useState<unknown>(null);
  const existing = useQuery({ queryKey: ["item", id], queryFn: () => api.getVersioned<Item>(`/api/v1/items/${id ?? ""}`), enabled: Boolean(id) });
  const categories = useQuery({ queryKey: ["item-categories"], queryFn: () => api.get<Category[]>("/api/v1/item-categories") });
  const uoms = useQuery({ queryKey: ["uoms"], queryFn: () => api.get<Uom[]>("/api/v1/uoms") });
  const taxes = useQuery({ queryKey: ["tax-categories"], queryFn: () => api.get<TaxCategory[]>("/api/v1/tax-categories") });
  const item = existing.data?.data;
  const form = useForm<ItemForm>({
    ...(item ? { values: { code: item.code, name: item.name, description: item.description ?? "", category: item.category, baseUom: item.baseUom, hsnSac: item.hsnSac ?? "", taxCategory: item.taxCategory ?? "", ext: item.ext } } : {}),
    defaultValues: { name: "", category: "", ext: {} },
  });
  const category = form.watch("category");
  const fields = useQuery({
    queryKey: ["fields", "foundation.item", category, i18n.language],
    queryFn: () => api.get<FieldDef[]>(`/api/v1/fields/foundation.item?category=${encodeURIComponent(category)}&lang=${i18n.language}`),
    enabled: Boolean(category),
  });
  const editable = id ? can("foundation.item.update") : can("foundation.item.create");
  const err = (n: string) => messageOf(form.getFieldState(n as FieldPath<ItemForm>, form.formState).error);

  const save = form.handleSubmit(async (v) => {
    setError(null);
    const allowed = new Set((fields.data ?? []).filter((f) => f.type !== "computed").map((f) => f.key));
    const body = Object.fromEntries(
      Object.entries({ ...v, ext: Object.fromEntries(Object.entries(v.ext ?? {}).filter(([k, x]) => allowed.has(k) && x !== "" && x !== null && x !== undefined && x !== false)) }).filter(([, x]) => x !== "" && x !== undefined),
    );
    try {
      const saved = id ? (await api.put<Item>(`/api/v1/items/${id}`, body, existing.data?.etag)).data : await api.post<Item>("/api/v1/items", body);
      await client.invalidateQueries({ queryKey: ["items"] });
      await client.invalidateQueries({ queryKey: ["item", saved.id] });
      await navigate({ to: "/items/$id", params: { id: saved.id } });
    } catch (e) {
      if (e instanceof ApiError) for (const fe of e.errors) form.setError(formField(fe.field) as FieldPath<ItemForm>, { message: fe.message });
      setError(e);
    }
  });

  return (
    <form onSubmit={(e) => void save(e)} className="max-w-4xl space-y-4" noValidate>
      <PageHeader title={id ? (item?.name ?? "…") : "New item"} actions={editable ? <Button type="submit" disabled={form.formState.isSubmitting}>{t("common.save")}</Button> : undefined}>
        {item ? <><span className="font-mono">{item.code}</span> <StatusBadge status={item.status} /></> : null}
      </PageHeader>
      <ProblemBanner error={error} />
      <fieldset disabled={!editable} className="space-y-4">
        <Card>
          <CardHeader><CardTitle>General</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" htmlFor="name" required error={err("name")}><Input id="name" {...form.register("name", { required: "is required" })} /></Field>
            <Field label="Code" htmlFor="code" hint="Leave blank to number per category" error={err("code")}><Input id="code" {...form.register("code")} /></Field>
            <Field label="Category" htmlFor="category" required error={err("category")}>
              <Select id="category" {...form.register("category", { required: "is required" })} disabled={Boolean(id)}>
                <option value="">—</option>
                {categories.data?.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Unit" htmlFor="baseUom" hint="Default: the category's unit" error={err("baseUom")}>
              <Select id="baseUom" {...form.register("baseUom")}>
                <option value="">—</option>
                {uoms.data?.map((u) => <option key={u.code} value={u.code}>{u.name} ({u.code})</option>)}
              </Select>
            </Field>
            <Field label="HSN / SAC" htmlFor="hsnSac" hint="Default: the category's" error={err("hsnSac")}><Input id="hsnSac" inputMode="numeric" {...form.register("hsnSac")} /></Field>
            <Field label="Tax category" htmlFor="taxCategory" hint="Default: the category's" error={err("taxCategory")}>
              <Select id="taxCategory" {...form.register("taxCategory")}>
                <option value="">—</option>
                {taxes.data?.map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}
              </Select>
            </Field>
          </CardContent>
        </Card>
        {fields.data && fields.data.length > 0 ? (
          <Card>
            <CardHeader><CardTitle>Specification</CardTitle></CardHeader>
            <CardContent><ExtFields fields={fields.data} form={form} computed={item?.computed ?? {}} /></CardContent>
          </Card>
        ) : null}
        {item && item.conversions.length > 0 ? (
          <Card>
            <CardHeader><CardTitle>Unit conversions</CardTitle></CardHeader>
            <CardContent>
              <ul className="text-sm">{item.conversions.map((c) => <li key={`${c.from}-${c.to}`}>1 {c.from} = {c.factor} {c.to}</li>)}</ul>
            </CardContent>
          </Card>
        ) : null}
      </fieldset>
    </form>
  );
}

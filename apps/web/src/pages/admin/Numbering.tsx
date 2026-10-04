/** Numbering series: patterns and a preview of the longest number; a pattern can change only before its first number. */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api.ts";
import { useCan } from "../../session.tsx";
import { Button } from "../../components/ui/button.tsx";
import { Input } from "../../components/ui/input.tsx";
import { Card } from "../../components/ui/card.tsx";
import { Badge } from "../../components/ui/badge.tsx";
import { Table, Td, Th } from "../../components/ui/table.tsx";
import { PageHeader, ProblemBanner } from "../../components/form.tsx";

interface Series { id: string; document_type: string; pattern: string; reset_policy: string; gapless: boolean; max_length: number | null; used: boolean; preview: string }

export function NumberingPage() {
  const can = useCan();
  const client = useQueryClient();
  const series = useQuery({ queryKey: ["numbering"], queryFn: () => api.get<Series[]>("/api/v1/admin/numbering") });
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);
  return (
    <div className="max-w-5xl space-y-4">
      <PageHeader title="Numbering">
        Tokens: {"{FY}"} 26-27 · {"{FYYYY}"} 2026-27 · {"{YYYY}"} · {"{MM}"} · {"{COMPANY}"} · {"{SITE}"} · {"{SEQ:5}"} 00001. GST invoices: at most 16 characters, a new series each financial year.
      </PageHeader>
      <ProblemBanner error={error} />
      <Card>
        <Table>
          <thead><tr><Th>Document</Th><Th>Pattern</Th><Th>Longest number</Th><Th>Rules</Th><Th><span className="sr-only">Save</span></Th></tr></thead>
          <tbody>
            {series.data?.map((s) => (
              <tr key={s.id}>
                <Td className="font-mono text-xs">{s.document_type}</Td>
                <Td className="w-64">
                  <Input aria-label={`Pattern for ${s.document_type}`} className="font-mono" value={draft[s.id] ?? s.pattern} disabled={s.used || !can("admin.numbering.update")} onChange={(e) => setDraft({ ...draft, [s.id]: e.target.value })} />
                </Td>
                <Td className="font-mono text-xs">{s.preview}</Td>
                <Td className="space-x-1">
                  <Badge>{s.reset_policy.replace("_", " ")}</Badge>
                  {s.gapless ? <Badge tone="info">no gaps</Badge> : null}
                  {s.max_length ? <Badge tone="warn">≤ {s.max_length}</Badge> : null}
                  {s.used ? <Badge tone="neutral">in use</Badge> : null}
                </Td>
                <Td className="text-right">
                  {draft[s.id] !== undefined ? (
                    <Button size="sm" onClick={async () => {
                      setError(null);
                      try {
                        await api.put(`/api/v1/admin/numbering/${s.id}`, { pattern: draft[s.id] });
                        setDraft(({ [s.id]: _, ...rest }) => rest);
                        await client.invalidateQueries({ queryKey: ["numbering"] });
                      } catch (e) {
                        setError(e);
                      }
                    }}>Save</Button>
                  ) : null}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}

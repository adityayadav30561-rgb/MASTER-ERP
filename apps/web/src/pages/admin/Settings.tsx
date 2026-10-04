/** Settings: values from the packages and this business; settings locked by a package (law) cannot change. */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { api } from "../../lib/api.ts";
import { useCan } from "../../session.tsx";
import { Button } from "../../components/ui/button.tsx";
import { Input, Select } from "../../components/ui/input.tsx";
import { Card } from "../../components/ui/card.tsx";
import { Table, Td, Th } from "../../components/ui/table.tsx";
import { PageHeader, ProblemBanner } from "../../components/form.tsx";

interface Setting { key: string; description: string; schema: { enum?: string[] }; value: unknown; locked: boolean }

export function SettingsPage() {
  const can = useCan();
  const client = useQueryClient();
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => api.get<Setting[]>("/api/v1/admin/settings") });
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);
  const save = async (key: string) => {
    setError(null);
    try {
      await api.put(`/api/v1/admin/settings/${key}`, { value: draft[key] });
      await client.invalidateQueries({ queryKey: ["settings"] });
      setDraft(({ [key]: _, ...rest }) => rest);
    } catch (e) {
      setError(e);
    }
  };
  return (
    <div className="max-w-4xl space-y-4">
      <PageHeader title="Settings" />
      <ProblemBanner error={error} />
      <Card>
        <Table>
          <thead><tr><Th>Setting</Th><Th>Value</Th><Th><span className="sr-only">Save</span></Th></tr></thead>
          <tbody>
            {settings.data?.map((s) => {
              const value = draft[s.key] ?? String(s.value);
              const editable = can("admin.settings.update") && !s.locked;
              return (
                <tr key={s.key}>
                  <Td>
                    <span className="font-medium">{s.description}</span>
                    <span className="block font-mono text-xs text-slate-500">{s.key}</span>
                  </Td>
                  <Td className="w-56">
                    {s.locked ? (
                      <span className="flex items-center gap-1 text-sm" title="Set by law through the localization pack"><Lock className="h-3 w-3" aria-label="locked" /> {String(s.value)}</span>
                    ) : s.schema.enum ? (
                      <Select aria-label={s.description} value={value} disabled={!editable} onChange={(e) => setDraft({ ...draft, [s.key]: e.target.value })}>{s.schema.enum.map((v) => <option key={v}>{v}</option>)}</Select>
                    ) : (
                      <Input aria-label={s.description} value={value} disabled={!editable} onChange={(e) => setDraft({ ...draft, [s.key]: e.target.value })} />
                    )}
                  </Td>
                  <Td className="w-24 text-right">{draft[s.key] !== undefined ? <Button size="sm" onClick={() => void save(s.key)}>Save</Button> : null}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}

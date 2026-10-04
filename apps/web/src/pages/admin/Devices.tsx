/** Shop-floor tablets (Step 6 §4.3): register a tablet at a site; its code is shown once, then only a hash is kept. */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api.ts";
import { Button } from "../../components/ui/button.tsx";
import { Input, Select } from "../../components/ui/input.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card.tsx";
import { Badge } from "../../components/ui/badge.tsx";
import { Table, Td, Th } from "../../components/ui/table.tsx";
import { Field, PageHeader, ProblemBanner } from "../../components/form.tsx";
import { formatDateTime } from "../../lib/format.ts";

interface Device { id: string; siteId: string; name: string; active: boolean; lastSeenAt: string | null }
interface OrgUnit { id: string; kind: string; name: string }

export function DevicesPage() {
  const client = useQueryClient();
  const devices = useQuery({ queryKey: ["devices"], queryFn: () => api.get<Device[]>("/api/v1/admin/devices") });
  const units = useQuery({ queryKey: ["org-units"], queryFn: () => api.get<OrgUnit[]>("/api/v1/admin/org-units") });
  const sites = units.data?.filter((u) => u.kind === "site") ?? [];
  const [siteId, setSiteId] = useState("");
  const [name, setName] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  const register = async () => {
    setError(null);
    try {
      const r = await api.post<{ id: string; token: string }>("/api/v1/admin/devices", { siteId: siteId || sites[0]?.id, name });
      setToken(r.token);
      setName("");
      await client.invalidateQueries({ queryKey: ["devices"] });
    } catch (e) {
      setError(e);
    }
  };

  return (
    <div className="max-w-4xl space-y-4">
      <PageHeader title="Shop-floor tablets">A registered tablet lets operators and store keepers sign in with their employee code and PIN.</PageHeader>
      <ProblemBanner error={error} />
      <Card>
        <CardHeader><CardTitle>Register a tablet</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Site" htmlFor="d-site">
              <Select id="d-site" value={siteId} onChange={(e) => setSiteId(e.target.value)}>{sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
            </Field>
            <Field label="Name" htmlFor="d-name"><Input id="d-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Paper store tablet" /></Field>
            <div className="flex items-end"><Button disabled={!name || sites.length === 0} onClick={() => void register()}>Register</Button></div>
          </div>
          {token ? (
            <div role="status" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
              <p className="font-medium">Device code — shown only now. On the tablet, open “Shop-floor tablet sign-in” and enter it:</p>
              <code className="mt-1 block break-all font-mono text-xs" data-testid="device-token">{token}</code>
            </div>
          ) : null}
        </CardContent>
      </Card>
      <Card>
        <Table>
          <thead><tr><Th>Name</Th><Th>Site</Th><Th>Last used</Th><Th>Status</Th><Th><span className="sr-only">Actions</span></Th></tr></thead>
          <tbody>
            {devices.data?.map((d) => (
              <tr key={d.id}>
                <Td>{d.name}</Td>
                <Td>{units.data?.find((u) => u.id === d.siteId)?.name}</Td>
                <Td>{formatDateTime(d.lastSeenAt)}</Td>
                <Td><Badge tone={d.active ? "good" : "bad"}>{d.active ? "active" : "revoked"}</Badge></Td>
                <Td className="text-right">
                  {d.active ? <Button size="sm" variant="ghost" onClick={async () => { await api.post(`/api/v1/admin/devices/${d.id}/actions/revoke`); await client.invalidateQueries({ queryKey: ["devices"] }); }}>Revoke</Button> : null}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}

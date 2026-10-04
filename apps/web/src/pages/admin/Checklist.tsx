/** Getting started: the onboarding checklist, with the review steps a person confirms. */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api.ts";
import { useCan } from "../../session.tsx";
import { Button } from "../../components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card.tsx";
import { PageHeader } from "../../components/form.tsx";
import { Checklist } from "../Home.tsx";

interface Step { key: string; label: string; manual: boolean; done: boolean }

export function ChecklistPage() {
  const can = useCan();
  const client = useQueryClient();
  const steps = useQuery({ queryKey: ["checklist"], queryFn: () => api.get<Step[]>("/api/v1/admin/checklist") });
  const manual = steps.data?.filter((s) => s.manual) ?? [];
  return (
    <div className="grid max-w-5xl gap-4 lg:grid-cols-2">
      <div className="lg:col-span-2"><PageHeader title="Getting started">Most steps tick themselves when the data is there; reviews are confirmed here.</PageHeader></div>
      <Checklist />
      {can("admin.settings.update") && manual.length > 0 ? (
        <Card>
          <CardHeader><CardTitle>Reviews</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {manual.map((s) => (
              <div key={s.key} className="flex items-center justify-between gap-2 text-sm">
                <span>{s.label}</span>
                <Button size="sm" variant={s.done ? "outline" : "default"} onClick={async () => {
                  await api.post(`/api/v1/admin/checklist/${s.key}`, { done: !s.done });
                  await client.invalidateQueries({ queryKey: ["checklist"] });
                }}>{s.done ? "Re-open" : "Mark reviewed"}</Button>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

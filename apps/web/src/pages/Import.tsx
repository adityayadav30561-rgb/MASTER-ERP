/**
 * Excel import wizard (UX archetype "wizard"): 1 choose what to import, 2 download the template, 3 upload for a
 * check (nothing is saved), 4 save — all rows or none.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Download, Upload } from "lucide-react";
import { api, download } from "../lib/api.ts";
import { useCan } from "../session.tsx";
import { Button } from "../components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card.tsx";
import { Table, Td, Th } from "../components/ui/table.tsx";
import { PageHeader, ProblemBanner } from "../components/form.tsx";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
interface Report { mode: string; committed: boolean; total: number; created: number; skipped: number; failed: number; errors: { row: number; column: string | null; message: string }[]; unknownColumns: string[] }

export function ImportPage() {
  const { t } = useTranslation();
  const can = useCan();
  const client = useQueryClient();
  const targets = [
    { key: "parties", label: "Parties (customers, vendors …)", permission: "foundation.party.import" },
    { key: "items", label: "Items (paper, board, ink, products …)", permission: "foundation.item.import" },
  ].filter((x) => can(x.permission));
  const [target, setTarget] = useState(targets[0]?.key ?? "parties");
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const run = async (mode: "dry-run" | "commit") => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.upload<Report>(`/api/v1/imports/${target}?mode=${mode}`, file, XLSX);
      setReport(r);
      if (r.committed) await client.invalidateQueries({ queryKey: [target] });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-4">
      <PageHeader title={t("nav.import")}>Bring your masters from Tally or Excel. A check runs first; nothing is saved until every row is correct.</PageHeader>
      <Card>
        <CardHeader><CardTitle>1. What do you want to import?</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-4">
          {targets.map((x) => (
            <label key={x.key} className="flex items-center gap-2 text-sm">
              <input type="radio" name="target" value={x.key} checked={target === x.key} onChange={() => { setTarget(x.key); setReport(null); }} /> {x.label}
            </label>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>2. Download the template and fill it in</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>The template has your business's columns (for example GSTIN and GSM), drop-down lists and an Instructions sheet.</p>
          <Button variant="outline" onClick={() => void download(`/api/v1/imports/${target}/template`, `${target}-template.xlsx`).catch(setError)}>
            <Download className="h-4 w-4" aria-hidden /> Download template
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>3. Upload and check</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <input type="file" accept={`.xlsx,${XLSX}`} aria-label="Filled template" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setReport(null); }} />
          <div className="flex gap-2">
            <Button disabled={!file || busy} onClick={() => void run("dry-run")}><Upload className="h-4 w-4" aria-hidden /> Check file</Button>
            <Button variant="outline" disabled={!file || busy || !report || report.failed > 0 || report.committed} onClick={() => void run("commit")}>4. Save all rows</Button>
          </div>
          <ProblemBanner error={error} />
          {report ? <ImportReport report={report} /> : null}
        </CardContent>
      </Card>
    </div>
  );
}

function ImportReport({ report }: { report: Report }) {
  return (
    <div className="space-y-2" aria-live="polite">
      <p className={report.failed ? "text-sm font-medium text-red-800" : "text-sm font-medium text-green-800"}>
        {report.committed
          ? `Saved: ${report.created} new, ${report.skipped} already existed.`
          : report.failed
            ? `${report.failed} of ${report.total} rows need correction. Nothing was saved.`
            : `All ${report.total} rows are correct (${report.created} new, ${report.skipped} already exist). Click "Save all rows".`}
      </p>
      {report.unknownColumns.length ? <p className="text-xs text-amber-800">Ignored columns: {report.unknownColumns.join(", ")}</p> : null}
      {report.errors.length ? (
        <Table>
          <thead><tr><Th>Row</Th><Th>Column</Th><Th>Problem</Th></tr></thead>
          <tbody>
            {report.errors.map((e, i) => (
              <tr key={i}><Td>{e.row}</Td><Td>{e.column ?? ""}</Td><Td>{e.message}</Td></tr>
            ))}
          </tbody>
        </Table>
      ) : null}
    </div>
  );
}

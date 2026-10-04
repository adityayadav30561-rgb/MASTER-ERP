/**
 * Metadata form renderer (ADR-0027 "generated screens"): draws the extension fields a package defines (GSM,
 * board type, MSME …) from GET /api/v1/fields. Values stay text (decimals as strings, ADR-0053).
 */
import type { FieldValues, Path, UseFormReturn } from "react-hook-form";
import { Input, Select } from "./ui/input.tsx";
import { Field, messageOf } from "./form.tsx";

export interface FieldDef {
  key: string;
  label: string;
  type: string;
  values?: string[];
  requiredNow?: boolean;
  maxLength?: number;
  min?: string;
  max?: string;
}

export function ExtFields<F extends FieldValues>({ fields, form, computed = {} }: { fields: readonly FieldDef[]; form: UseFormReturn<F>; computed?: Record<string, unknown> }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {fields.map((f) => {
        const name = `ext.${f.key}` as Path<F>;
        const id = `ext-${f.key}`;
        const error = messageOf(form.getFieldState(name, form.formState).error);
        const common = { id, "aria-invalid": Boolean(error), "aria-describedby": error ? `${id}-error` : undefined };
        let control;
        switch (f.type) {
          case "computed":
            control = <output id={id} className="block h-9 rounded-md bg-slate-50 px-3 py-2 text-sm">{computed[f.key] === null || computed[f.key] === undefined ? "—" : String(computed[f.key])}</output>;
            break;
          case "picklist":
            control = (
              <Select {...common} {...form.register(name)}>
                <option value="">—</option>
                {(f.values ?? []).map((v) => <option key={v} value={v}>{v.replace(/_/g, " ")}</option>)}
              </Select>
            );
            break;
          case "boolean":
            control = <input type="checkbox" {...common} {...form.register(name)} />;
            break;
          case "date":
            control = <Input type="date" {...common} {...form.register(name)} />;
            break;
          case "integer":
          case "decimal":
          case "percent":
            control = <Input inputMode="decimal" pattern="-?[0-9]+(\.[0-9]+)?" {...common} {...form.register(name)} />;
            break;
          case "long_text":
            control = <textarea className="w-full rounded-md border border-slate-300 p-2 text-sm" rows={3} {...common} {...form.register(name)} />;
            break;
          default:
            control = <Input {...common} maxLength={f.maxLength} {...form.register(name)} />;
        }
        const hint = f.min || f.max ? `${f.min ?? ""}–${f.max ?? ""}` : undefined;
        return (
          <Field key={f.key} label={f.label} htmlFor={id} required={f.requiredNow ?? false} error={error} hint={hint}>
            {control}
          </Field>
        );
      })}
    </div>
  );
}

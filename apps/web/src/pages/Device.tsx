/**
 * Shop-floor tablet (Step 6 §4.3, UX "touch-first"): the administrator registers the tablet once and types its
 * device code here; after that, people sign in with their employee code and PIN on a big keypad.
 */
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Delete } from "lucide-react";
import { Button } from "../components/ui/button.tsx";
import { Input } from "../components/ui/input.tsx";
import { Card, CardContent } from "../components/ui/card.tsx";
import { Field, ProblemBanner } from "../components/form.tsx";
import { deviceToken, signInWithPin } from "../lib/session.ts";
import { useRefreshSession } from "../session.tsx";

export function DevicePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const refresh = useRefreshSession();
  const [token, setToken] = useState(deviceToken.get());
  const [draftToken, setDraftToken] = useState("");
  const [employeeCode, setEmployeeCode] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<unknown>(null);

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="space-y-4 p-6">
            <h1 className="text-xl font-semibold">{t("device.setup")}</h1>
            <Field label={t("device.token")} htmlFor="device-token" hint="Shown once when the tablet is registered under Administration → Shop-floor tablets.">
              <Input id="device-token" value={draftToken} onChange={(e) => setDraftToken(e.target.value)} autoComplete="off" />
            </Field>
            <Button
              disabled={draftToken.trim().length < 32}
              onClick={() => {
                deviceToken.set(draftToken);
                setToken(deviceToken.get());
              }}
            >
              {t("common.save")}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const press = (digit: string) => setPin((p) => (p.length < 6 ? p + digit : p));
  const submit = async () => {
    setError(null);
    try {
      await signInWithPin(employeeCode.trim().toUpperCase(), pin);
      await refresh();
      await navigate({ to: "/" });
    } catch (e) {
      setPin("");
      setError(e);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardContent className="space-y-4 p-6">
          <h1 className="text-2xl font-semibold">{t("device.title")}</h1>
          <ProblemBanner error={error} />
          <Field label={t("device.employeeCode")} htmlFor="employee-code">
            <Input id="employee-code" className="h-14 text-xl" value={employeeCode} onChange={(e) => setEmployeeCode(e.target.value)} autoComplete="off" autoCapitalize="characters" />
          </Field>
          <div>
            <p className="mb-1 text-sm font-medium text-slate-700" id="pin-label">{t("device.pin")}</p>
            <p aria-labelledby="pin-label" className="mb-3 h-10 text-center text-3xl tracking-[0.5em]" data-testid="pin-dots">{"•".repeat(pin.length)}</p>
            <div className="grid grid-cols-3 gap-2" role="group" aria-label="PIN keypad">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
                <Button key={d} variant="outline" size="touch" onClick={() => press(d)} aria-label={d}>{d}</Button>
              ))}
              <Button variant="ghost" size="touch" onClick={() => setPin((p) => p.slice(0, -1))} aria-label="Delete last digit"><Delete aria-hidden /></Button>
              <Button variant="outline" size="touch" onClick={() => press("0")} aria-label="0">0</Button>
              <Button size="touch" disabled={pin.length !== 6 || !employeeCode} onClick={() => void submit()}>OK</Button>
            </div>
          </div>
          <button className="text-xs text-slate-500 underline" onClick={() => { deviceToken.clear(); setToken(null); }}>Reset this tablet</button>
        </CardContent>
      </Card>
    </div>
  );
}

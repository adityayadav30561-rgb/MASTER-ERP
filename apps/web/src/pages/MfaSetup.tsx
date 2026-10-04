/**
 * Two-step sign-in enrolment (ADR-0032): mandatory for owner, admin and accountant before they can use anything.
 * Scan the QR code with an authenticator app (Google Authenticator, Microsoft Authenticator …), enter a code,
 * and keep the backup codes.
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "@tanstack/react-router";
import { renderSVG } from "uqr";
import { Button } from "../components/ui/button.tsx";
import { Input } from "../components/ui/input.tsx";
import { Card, CardContent } from "../components/ui/card.tsx";
import { Field, ProblemBanner } from "../components/form.tsx";
import { enableTotp, verifyTotp } from "../lib/session.ts";
import { useRefreshSession } from "../session.tsx";

export function MfaSetupPage() {
  const navigate = useNavigate();
  const refresh = useRefreshSession();
  const [enrolment, setEnrolment] = useState<{ totpURI: string; backupCodes: string[] } | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const passwordForm = useForm<{ password: string }>();
  const codeForm = useForm<{ code: string }>();
  const secret = enrolment ? (new URL(enrolment.totpURI).searchParams.get("secret") ?? "") : "";

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardContent className="space-y-4 p-6">
          <h1 className="text-xl font-semibold">Set up two-step sign-in</h1>
          <p className="text-sm text-slate-600">Your role can change money and people, so a password alone is not enough. You will need your phone each time you sign in on a new browser.</p>
          <ProblemBanner error={error} />
          {!enrolment ? (
            <form
              className="space-y-3"
              onSubmit={passwordForm.handleSubmit(async (v) => {
                setError(null);
                try {
                  setEnrolment(await enableTotp(v.password));
                } catch (e) {
                  setError(e);
                }
              })}
            >
              <Field label="Your password" htmlFor="mfa-password">
                <Input id="mfa-password" type="password" autoComplete="current-password" required {...passwordForm.register("password")} />
              </Field>
              <Button type="submit">Continue</Button>
            </form>
          ) : !done ? (
            <form
              className="space-y-3"
              onSubmit={codeForm.handleSubmit(async (v) => {
                setError(null);
                try {
                  await verifyTotp(v.code.replace(/\s/g, ""));
                  setDone(true);
                } catch (e) {
                  setError(e);
                }
              })}
            >
              <p className="text-sm">1. Scan this code with your authenticator app.</p>
              <div className="mx-auto w-48" aria-label="QR code for the authenticator app" dangerouslySetInnerHTML={{ __html: renderSVG(enrolment.totpURI) }} />
              <p className="text-xs text-slate-600">
                Cannot scan? Enter this key: <code className="break-all font-mono">{secret}</code>
              </p>
              <Field label="2. Enter the 6-digit code it shows" htmlFor="mfa-code">
                <Input id="mfa-code" inputMode="numeric" autoComplete="one-time-code" required autoFocus {...codeForm.register("code")} />
              </Field>
              <Button type="submit">Turn on</Button>
            </form>
          ) : (
            <div className="space-y-3">
              <p className="text-sm font-medium text-green-800">Two-step sign-in is on.</p>
              <p className="text-sm">Keep these backup codes somewhere safe. Each works once if you lose your phone.</p>
              <ul className="grid grid-cols-2 gap-1 rounded-md bg-slate-100 p-3 font-mono text-sm">
                {enrolment.backupCodes.map((c) => <li key={c}>{c}</li>)}
              </ul>
              <Button
                onClick={async () => {
                  await refresh();
                  await navigate({ to: "/" });
                }}
              >
                I have saved them — continue
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

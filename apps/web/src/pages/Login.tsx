/** Sign-in: e-mail + password, then the authenticator code when two-step sign-in is on (ADR-0032). */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Button } from "../components/ui/button.tsx";
import { Input } from "../components/ui/input.tsx";
import { Card, CardContent } from "../components/ui/card.tsx";
import { Field, ProblemBanner } from "../components/form.tsx";
import { signIn, verifyTotp } from "../lib/session.ts";
import { useRefreshSession } from "../session.tsx";

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const refresh = useRefreshSession();
  const [step, setStep] = useState<"password" | "code">("password");
  const [error, setError] = useState<unknown>(null);
  const passwordForm = useForm<{ email: string; password: string }>();
  const codeForm = useForm<{ code: string }>();

  const finish = async () => {
    const me = await refresh();
    await navigate({ to: me?.mfaEnrolmentRequired ? "/setup-mfa" : "/" });
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardContent className="space-y-4 p-6">
          <h1 className="text-xl font-semibold">{t("login.title")}</h1>
          <ProblemBanner error={error} />
          {step === "password" ? (
            <form
              className="space-y-3"
              onSubmit={passwordForm.handleSubmit(async (v) => {
                setError(null);
                try {
                  if ((await signIn(v.email, v.password)) === "two-factor") setStep("code");
                  else await finish();
                } catch (e) {
                  setError(e);
                }
              })}
            >
              <Field label={t("login.email")} htmlFor="email">
                <Input id="email" type="email" autoComplete="username" required {...passwordForm.register("email")} />
              </Field>
              <Field label={t("login.password")} htmlFor="password">
                <Input id="password" type="password" autoComplete="current-password" required {...passwordForm.register("password")} />
              </Field>
              <Button type="submit" className="w-full" disabled={passwordForm.formState.isSubmitting}>{t("login.submit")}</Button>
            </form>
          ) : (
            <form
              className="space-y-3"
              onSubmit={codeForm.handleSubmit(async (v) => {
                setError(null);
                try {
                  await verifyTotp(v.code.replace(/\s/g, ""));
                  await finish();
                } catch (e) {
                  setError(e);
                }
              })}
            >
              <Field label={t("login.code")} htmlFor="code">
                <Input id="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" required autoFocus {...codeForm.register("code")} />
              </Field>
              <Button type="submit" className="w-full" disabled={codeForm.formState.isSubmitting}>{t("login.verify")}</Button>
            </form>
          )}
          <p className="text-center text-sm">
            <Link to="/device" className="text-brand-700 hover:underline">{t("login.tablet")}</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

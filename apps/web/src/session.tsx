/**
 * Who is signed in (from /api/v1/me) and the step-up prompt: when the server answers "confirm your password",
 * ask for it, re-authenticate and retry the action once.
 */
import { createContext, useCallback, useContext, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "./lib/api.ts";
import { currentUser, stepUp } from "./lib/session.ts";
import type { Me } from "./lib/session.ts";
import { can } from "./lib/permissions.ts";
import { Dialog } from "./components/ui/dialog.tsx";
import { Input } from "./components/ui/input.tsx";
import { Button } from "./components/ui/button.tsx";
import { Field, ProblemBanner } from "./components/form.tsx";

export function useMe() {
  return useQuery({ queryKey: ["me"], queryFn: currentUser, staleTime: 60_000 });
}

export function useCan(): (permission: string) => boolean {
  const { data } = useMe();
  return (permission) => can(data?.permissions, permission);
}

export function useRefreshSession(): () => Promise<Me | null> {
  const client = useQueryClient();
  return async () => {
    await client.invalidateQueries();
    return client.fetchQuery({ queryKey: ["me"], queryFn: currentUser });
  };
}

type WithStepUp = <T>(action: () => Promise<T>) => Promise<T>;
const StepUpContext = createContext<WithStepUp>((action) => action());

export function useStepUp(): WithStepUp {
  return useContext(StepUpContext);
}

export function StepUpProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<unknown>(null);
  const pending = useRef<((ok: boolean) => void) | null>(null);

  const ask = () =>
    new Promise<boolean>((resolve) => {
      pending.current = resolve;
      setPassword("");
      setError(null);
      setOpen(true);
    });

  const withStepUp = useCallback<WithStepUp>(async (action) => {
    try {
      return await action();
    } catch (e) {
      if (!(e instanceof ApiError && e.needsStepUp)) throw e;
      if (!(await ask())) throw e;
      return action();
    }
  }, []);

  const confirm = async () => {
    try {
      await stepUp(password);
      setOpen(false);
      pending.current?.(true);
    } catch (e) {
      setError(e);
    }
  };

  return (
    <StepUpContext.Provider value={withStepUp}>
      {children}
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o) pending.current?.(false);
          setOpen(o);
        }}
        title="Confirm your password"
        description="Changing people or roles needs your password again."
      >
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void confirm();
          }}
        >
          <ProblemBanner error={error} />
          <Field label="Password" htmlFor="step-up-password">
            <Input id="step-up-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { pending.current?.(false); setOpen(false); }}>Cancel</Button>
            <Button type="submit">Confirm</Button>
          </div>
        </form>
      </Dialog>
    </StepUpContext.Provider>
  );
}

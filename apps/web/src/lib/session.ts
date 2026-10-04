/** Sign-in flows through /api/auth (Better Auth, ADR-0032): password + TOTP, device PIN, step-up, sign-out. */
import { ApiError, api } from "./api.ts";

export interface Me {
  userId: string;
  tenantId: string;
  tenantName: string;
  tenantStatus: string;
  displayName: string;
  authMethod: "password" | "passkey" | "oidc" | "device-pin";
  mfaEnrolmentRequired: boolean;
  deviceSiteId?: string;
  roles: string[];
  permissions: string[];
}

export async function currentUser(): Promise<Me | null> {
  try {
    return await api.get<Me>("/api/v1/me");
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

/** Returns "two-factor" when the account has TOTP and a code must follow. */
export async function signIn(email: string, password: string): Promise<"done" | "two-factor"> {
  const r = await api.post<{ twoFactorRedirect?: boolean }>("/api/auth/sign-in/email", { email, password });
  return r.twoFactorRedirect ? "two-factor" : "done";
}

export async function verifyTotp(code: string, trustDevice = false): Promise<void> {
  await api.post("/api/auth/two-factor/verify-totp", { code, trustDevice });
}

export async function enableTotp(password: string): Promise<{ totpURI: string; backupCodes: string[] }> {
  return api.post("/api/auth/two-factor/enable", { password });
}

export async function stepUp(password: string): Promise<void> {
  await api.post("/api/auth/step-up", { password });
}

export async function signOut(): Promise<void> {
  await api.post("/api/auth/sign-out", {});
}

/* ---- shop-floor tablets (Step 6 §4.3) ---- */

const DEVICE_KEY = "erp.deviceToken";

export const deviceToken = {
  get: (): string | null => localStorage.getItem(DEVICE_KEY),
  set: (token: string) => localStorage.setItem(DEVICE_KEY, token.trim()),
  clear: () => localStorage.removeItem(DEVICE_KEY),
};

export async function signInWithPin(employeeCode: string, pin: string): Promise<void> {
  const token = deviceToken.get();
  if (!token) throw new ApiError(400, "about:blank", "This tablet is not set up", undefined, []);
  await api.post("/api/auth/sign-in/device-pin", { deviceToken: token, employeeCode, pin });
}

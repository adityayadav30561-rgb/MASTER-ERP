/**
 * Password and PIN rules (ADR-0032, NIST SP 800-63B; OWASP Password Storage Cheat Sheet).
 */
import { createHash } from "node:crypto";
import { hash as argon2Hash, verify as argon2Verify } from "@node-rs/argon2";

const ARGON2 = { algorithm: 2 /* Argon2id */, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export const hashSecret = (secret: string): Promise<string> => argon2Hash(secret, ARGON2);
export const verifySecret = (hash: string, secret: string): Promise<boolean> => argon2Verify(hash, secret);
export const sha256 = (s: string): string => createHash("sha256").update(s).digest("hex");

/** Most common breached passwords (offline floor; the online breached-password check adds the rest). */
const COMMON = new Set([
  "password", "password123", "123456789012345", "qwertyuiopasdfg", "iloveyou12345678", "welcome@12345678",
  "admin@123456789", "p@ssw0rd123456789", "12345678", "123456789", "1234567890", "qwerty123", "password1",
]);

export interface PasswordCheck {
  ok: boolean;
  message?: string;
}

/** At least 15 characters, or at least 8 when the person uses two-factor login; never a known common one. */
export function checkPassword(password: string, options: { mfaEnabled: boolean }): PasswordCheck {
  const min = options.mfaEnabled ? 8 : 15;
  if (password.length < min) {
    return { ok: false, message: options.mfaEnabled ? "Use at least 8 characters" : "Use at least 15 characters — a short sentence works well (or 8 with two-factor login)" };
  }
  if (password.length > 128) return { ok: false, message: "Use at most 128 characters" };
  if (COMMON.has(password.toLowerCase())) return { ok: false, message: "This password is too common; choose another" };
  return { ok: true };
}

/** Shop-floor PIN: exactly 6 digits, not trivially guessable. */
export function checkPin(pin: string): PasswordCheck {
  if (!/^\d{6}$/.test(pin)) return { ok: false, message: "The PIN must be 6 digits" };
  if (/^(\d)\1{5}$/.test(pin) || "0123456789".includes(pin) || "9876543210".includes(pin)) return { ok: false, message: "This PIN is too easy to guess" };
  return { ok: true };
}

export const PIN_MAX_FAILURES = 5;
export const PIN_LOCK_MINUTES = 15;

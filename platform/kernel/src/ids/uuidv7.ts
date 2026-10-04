/**
 * UUID version 7 (RFC 9562): 48-bit Unix milliseconds + 74 random bits.
 * Time-ordered ids keep B-tree indexes compact and make ids sortable by creation (ADR-0049).
 * Within one millisecond, the 12-bit `rand_a` field is used as a counter (RFC 9562 §6.2, method 1),
 * so ids created by this process are strictly increasing.
 */
import { randomFillSync } from "node:crypto";

let lastMs = -1;
let counter = 0;

export function newId(now: number = Date.now()): string {
  let ms = now;
  if (ms <= lastMs) {
    counter++;
    if (counter > 0xfff) {
      // Counter exhausted within this millisecond: borrow the next millisecond.
      lastMs++;
      counter = 0;
    }
    ms = lastMs;
  } else {
    lastMs = ms;
    const seed = new Uint8Array(2);
    randomFillSync(seed);
    counter = ((seed[0] ?? 0) << 4) | ((seed[1] ?? 0) >> 4); // random start, leaves headroom
    counter &= 0x7ff;
  }
  const bytes = new Uint8Array(16);
  randomFillSync(bytes, 8);
  const msBig = BigInt(ms);
  for (let i = 0; i < 6; i++) bytes[i] = Number((msBig >> BigInt(8 * (5 - i))) & 0xffn);
  bytes[6] = 0x70 | ((counter >> 8) & 0x0f); // version 7
  bytes[7] = counter & 0xff;
  bytes[8] = 0x80 | ((bytes[8] ?? 0) & 0x3f); // variant 10
  const hex = Buffer.from(bytes).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/** Milliseconds since the epoch encoded in a UUIDv7. */
export function timestampOf(id: string): number {
  return Number.parseInt(id.replace(/-/g, "").slice(0, 12), 16);
}

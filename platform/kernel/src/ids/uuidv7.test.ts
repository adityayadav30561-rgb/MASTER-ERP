import { describe, expect, it } from "vitest";
import { isUuid, newId, timestampOf } from "./index.ts";

describe("UUIDv7 (RFC 9562)", () => {
  it("has version 7 and variant 10, and encodes the time", () => {
    const now = Date.UTC(2026, 9, 4, 10, 15);
    const id = newId(now);
    expect(isUuid(id)).toBe(true);
    expect(id[14]).toBe("7");
    expect(["8", "9", "a", "b"]).toContain(id[19]);
    expect(timestampOf(id)).toBeGreaterThanOrEqual(now);
  });

  it("is strictly increasing within the process, even inside one millisecond", () => {
    const ids = Array.from({ length: 20_000 }, () => newId());
    const sorted = [...ids].sort();
    expect(sorted).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

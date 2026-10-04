import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { formField } from "./api.ts";
import { formatDate, groupIndian } from "./format.ts";
import { can, permissionMatches } from "./permissions.ts";

describe("web helpers", () => {
  it("matches permissions like the server", () => {
    expect(permissionMatches("foundation.*", "foundation.party.read")).toBe(true);
    expect(permissionMatches("foundation.party.read", "foundation.party.create")).toBe(false);
    expect(can(["inventory.goods_receipt.*", "foundation.item.read"], "foundation.item.read")).toBe(true);
    expect(can(undefined, "foundation.item.read")).toBe(false);
  });

  it("formats dates and groups numbers the Indian way, without floats", () => {
    expect(formatDate("2026-10-04")).toBe("04-10-2026");
    expect(groupIndian("1234567.50")).toBe("12,34,567.50");
    expect(groupIndian("-100000")).toBe("-1,00,000");
    expect(groupIndian("999")).toBe("999");
    // Grouping never changes the digits (property).
    fc.assert(fc.property(fc.bigInt({ min: 0n, max: 10n ** 20n }), (n) => groupIndian(n.toString()).replace(/,/g, "") === n.toString()));
  });

  it("maps server field paths to form field names", () => {
    expect(formField("addresses[0].postalCode")).toBe("addresses.0.postalCode");
    expect(formField("ext.gsm")).toBe("ext.gsm");
  });
});

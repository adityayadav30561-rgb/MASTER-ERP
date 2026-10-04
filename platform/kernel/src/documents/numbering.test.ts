import { describe, expect, it } from "vitest";
import { fiscalYear, periodKey, renderNumber, validatePattern } from "./index.ts";

describe("numbering patterns (pure)", () => {
  it("computes the Indian financial year (April–March)", () => {
    expect(fiscalYear("2026-03-31")).toMatchObject({ short: "25-26", long: "2025-26" });
    expect(fiscalYear("2026-04-01")).toMatchObject({ short: "26-27", long: "2026-27" });
    expect(fiscalYear("2026-12-31", 1)).toMatchObject({ short: "26", long: "2026" });
  });

  it("renders the Step 5 example SPV/{FY}/{SEQ:4} → SPV/25-26/0042", () => {
    expect(renderNumber("SPV/{FY}/{SEQ:4}", { date: "2025-10-04", sequence: 42n, fyStartMonth: 4, companyCode: "SP", siteCode: "VAPI" })).toBe("SPV/25-26/0042");
    expect(renderNumber("{COMPANY}-{SITE}/{YYYY}{MM}/{SEQ:5}", { date: "2026-10-04", sequence: 7n, fyStartMonth: 4, companyCode: "AP", siteCode: "BHW" })).toBe("AP-BHW/202610/00007");
  });

  it("derives the counter period from the reset policy", () => {
    expect(periodKey("fiscal_year", "2027-01-15", 4)).toBe("2026-27");
    expect(periodKey("calendar_year", "2027-01-15", 4)).toBe("2027");
    expect(periodKey("monthly", "2027-01-15", 4)).toBe("2027-01");
    expect(periodKey("never", "2027-01-15", 4)).toBe("");
  });

  it("rejects patterns without a sequence or with unknown tokens", () => {
    expect(() => validatePattern("INV/{FY}")).toThrow(/SEQ/);
    expect(() => validatePattern("INV/{FOO}/{SEQ:4}")).toThrow(/Unknown token/);
  });
});

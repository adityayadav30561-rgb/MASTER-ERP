import { describe, expect, it } from "vitest";
import { gstinCheckCharacter, gstinRegion, regionHint, validateGstin, validateHsnSac, validatePan, validatePinCode } from "./index.ts";

describe("PAN", () => {
  it.each([
    ["AAPFU0939F", undefined],
    ["ABCPE1234F", undefined],
    ["ABCDE1234F", "has an unknown holder type in the 4th letter"], // D is not a holder type
    ["ABCP1234F", "must look like ABCDE1234F (5 letters, 4 digits, 1 letter)"],
  ])("%s", (pan, message) => expect(validatePan(pan)).toBe(message));
});

describe("GSTIN", () => {
  it("accepts the published example and computes its check character", () => {
    expect(validateGstin("27AAPFU0939F1ZV")).toBeUndefined();
    expect(gstinCheckCharacter("27AAPFU0939F1Z")).toBe("V");
    expect(gstinRegion("27AAPFU0939F1ZV")).toBe("IN-MH");
  });

  it("explains what is wrong", () => {
    expect(validateGstin("27AAPFU0939F1ZX")).toMatch(/wrong check character/);
    expect(validateGstin("27AAPFU0939F1Z")).toMatch(/15 characters/);
    expect(validateGstin("28AAPFU0939F1ZV")).toMatch(/unknown state code 28/); // 28 = pre-2014 Andhra Pradesh
    expect(validateGstin("27aapfu0939f1zv")).toMatch(/format/);
    expect(validateGstin("27AAPFU0939F1ZV", { pan: "AAPFU0939G" })).toMatch(/does not contain the party's PAN/);
  });

  it("property: changing any one character is detected", () => {
    const valid = "27AAPFU0939F1ZV";
    let detected = 0;
    let changes = 0;
    for (let i = 2; i < 14; i++) {
      for (const c of "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
        if (c === valid[i]) continue;
        const changed = valid.slice(0, i) + c + valid.slice(i + 1);
        if (/^[0-9]{2}[A-Z]{3}[ABCFGHLJPT][A-Z][0-9]{4}[A-Z][1-9A-Z][A-Z]/.test(changed)) {
          changes++;
          if (validateGstin(changed) !== undefined) detected++;
        }
      }
    }
    expect(detected).toBe(changes); // every single-character typo in a well-formed GSTIN is caught by the checksum
  });
});

describe("HSN / SAC, PIN code, state codes", () => {
  it.each([
    ["48109200", "stock", undefined],
    ["4810", "stock", undefined],
    ["48109", "stock", "must be an HSN code of 4, 6 or 8 digits"],
    ["998912", "stock", "codes starting with 99 are SAC codes for services, not goods"],
    ["998912", "service", undefined],
    [null, "stock", "HSN code is required for stock items"],
    [null, "non_stock", undefined],
  ] as const)("%s (%s)", (code, type, message) => expect(validateHsnSac(code, type)).toBe(message));

  it("checks PIN codes and points old state codes to current ones", () => {
    expect(validatePinCode("IN", "421302")).toBeUndefined();
    expect(validatePinCode("IN", "021302")).toMatch(/6-digit/);
    expect(validatePinCode("AE", "anything")).toBeUndefined();
    expect(regionHint("IN-OR")).toBe("use the current code IN-OD");
  });
});

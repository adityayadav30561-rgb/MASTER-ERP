import { describe, expect, it } from "vitest";
import { Money } from "@master-erp/kernel/decimal";
import { integerInWords, rupeesInWords } from "./words.ts";

describe("amount in words (Indian system)", () => {
  it.each([
    ["0", "Zero"],
    ["7", "Seven"],
    ["45", "Forty-Five"],
    ["100", "One Hundred"],
    ["20395", "Twenty Thousand Three Hundred Ninety-Five"],
    ["100000", "One Lakh"],
    ["1234567", "Twelve Lakh Thirty-Four Thousand Five Hundred Sixty-Seven"],
    ["10000000", "One Crore"],
    ["987654321", "Ninety-Eight Crore Seventy-Six Lakh Fifty-Four Thousand Three Hundred Twenty-One"],
  ])("%s → %s", (n, words) => expect(integerInWords(n)).toBe(words));

  it("adds paise", () => {
    expect(rupeesInWords(Money.of("79656.05", "INR"))).toBe("Rupees Seventy-Nine Thousand Six Hundred Fifty-Six and Five Paise Only");
  });
});

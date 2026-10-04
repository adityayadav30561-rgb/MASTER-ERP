import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pageCount, PdfRenderer, TemplateRenderer } from "./index.ts";

const base = fileURLToPath(new URL("./templates/base/", import.meta.url));
const tenant = fileURLToPath(new URL("./templates/tenant/", import.meta.url));
const data = { title: "Delivery Challan", copies: ["ORIGINAL", "DUPLICATE"], company: "Demo Printers", customer: "<b>Sample</b> & Co", lines: [{ item: "Carton", qty: "5000" }] };

describe("templates (LiquidJS)", () => {
  it("escapes data and lets a tenant override a template part", async () => {
    const html = await new TemplateRenderer([base, tenant]).render("delivery-challan", data);
    expect(html).toContain("&lt;b&gt;Sample&lt;/b&gt; &amp; Co");
    expect(html).toContain("ISO 9001 certified"); // tenant branding wins over the base one
    expect(await new TemplateRenderer([base]).render("delivery-challan", data)).not.toContain("ISO 9001");
  });
});

describe.skipIf(!process.env.PLAYWRIGHT_BROWSERS_PATH)("PDF output (Chromium)", { timeout: 60_000 }, () => {
  let pdf: PdfRenderer;
  beforeAll(async () => {
    pdf = await PdfRenderer.start();
  });
  afterAll(async () => pdf?.close());

  it("renders one page per copy", async () => {
    const out = await pdf.render(await new TemplateRenderer([base, tenant]).render("delivery-challan", data));
    expect(out.subarray(0, 4).toString()).toBe("%PDF");
    expect(pageCount(out)).toBe(2);
  });
});

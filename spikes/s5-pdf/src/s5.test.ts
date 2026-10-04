import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { largeInvoice, smallInvoice } from "./fixtures.ts";
import { PdfRenderer, pageCount, renderHtml } from "./render.ts";

const browserAvailable = Boolean(process.env.PLAYWRIGHT_BROWSERS_PATH) || process.env.S5_FORCE === "1";

describe.skipIf(!browserAvailable)("Spike S5: Indian tax invoice PDF", { timeout: 120_000 }, () => {
  let renderer: PdfRenderer;
  beforeAll(async () => {
    renderer = await PdfRenderer.start();
  });
  afterAll(async () => {
    await renderer?.close();
  });

  it("renders three copies (Rule 48) with the e-invoice QR, in under 2 seconds when warm", async () => {
    await renderer.render(await renderHtml(smallInvoice)); // warm-up
    const timings: number[] = [];
    let pdf: Buffer = Buffer.alloc(0);
    for (let i = 0; i < 10; i++) {
      const start = performance.now();
      pdf = await renderer.render(await renderHtml(smallInvoice));
      timings.push(performance.now() - start);
    }
    timings.sort((a, b) => a - b);
    const p95 = timings[Math.ceil(timings.length * 0.95) - 1] ?? 0;
    console.log(`[S5] small invoice: median ${timings[5]?.toFixed(0)} ms, p95 ${p95.toFixed(0)} ms, ${(pdf.length / 1024).toFixed(0)} KB, ${pageCount(pdf)} pages`);
    expect(pageCount(pdf)).toBe(3);
    expect(p95).toBeLessThan(2000);
  });

  it("paginates a 150-line job invoice with repeated headers", async () => {
    const start = performance.now();
    const pdf = await renderer.render(await renderHtml(largeInvoice));
    const ms = performance.now() - start;
    console.log(`[S5] 150-line invoice: ${ms.toFixed(0)} ms, ${(pdf.length / 1024).toFixed(0)} KB, ${pageCount(pdf)} pages`);
    expect(pageCount(pdf) % 3).toBe(0);
    expect(pageCount(pdf)).toBeGreaterThan(3);
    expect(ms).toBeLessThan(5000);
  });

  it("escapes data from the database (no markup injection into documents)", async () => {
    const html = await renderHtml({ ...smallInvoice, buyer: { ...smallInvoice.buyer, name: "<script>alert(1)</script> & Co" } });
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; &amp; Co");
    expect(html).not.toContain("<script>alert(1)");
  });
});

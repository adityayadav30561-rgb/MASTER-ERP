/**
 * Spike S5 benchmark: memory of the browser processes and a sample PDF for the documentation.
 * Run: node spikes/s5-pdf/src/bench.ts
 */
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { largeInvoice, smallInvoice } from "./fixtures.ts";
import { PdfRenderer, renderHtml } from "./render.ts";

const rssOfChromiumMb = () =>
  Number(execSync("ps -eo rss,comm | awk '/headless_shell|chrome/ {s+=$1} END {print s+0}'").toString().trim()) / 1024;

const renderer = await PdfRenderer.start();
const idle = rssOfChromiumMb();
let peak = idle;
for (let i = 0; i < 30; i++) {
  await renderer.render(await renderHtml(i % 5 === 0 ? largeInvoice : smallInvoice));
  peak = Math.max(peak, rssOfChromiumMb());
}
const after = rssOfChromiumMb();
console.log(`[S5] chromium RSS: idle ${idle.toFixed(0)} MB, peak ${peak.toFixed(0)} MB, after 30 documents ${after.toFixed(0)} MB`);
const out = new URL("../../../docs/03-implementation/assets/", import.meta.url);
writeFileSync(new URL("sample-tax-invoice.pdf", out), await renderer.render(await renderHtml(smallInvoice)));
await renderer.close();

console.log("[S5] wrote docs/03-implementation/assets/sample-tax-invoice.pdf (PNG preview: pdftoppm -png -r 80 -singlefile -f 1 -l 1)");

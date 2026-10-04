/**
 * Document output (ADR-0057, spike S5): LiquidJS templates (auto-escaped, logic-limited, safe for
 * tenant-editable branding) → HTML → headless Chromium → PDF, in the worker process.
 */
import { Liquid } from "liquidjs";
import { chromium } from "playwright-core";
import type { Browser } from "playwright-core";

export class TemplateRenderer {
  readonly #engine: Liquid;

  /** `root`: folder(s) with .liquid templates; later layers (tenant) win over earlier ones (industry, country). */
  constructor(roots: readonly string[]) {
    this.#engine = new Liquid({ root: [...roots].reverse(), extname: ".liquid", outputEscape: "escape", strictFilters: true, cache: true });
  }

  render(template: string, data: Record<string, unknown>): Promise<string> {
    return this.#engine.renderFile(template, data);
  }

  renderString(source: string, data: Record<string, unknown>): Promise<string> {
    return this.#engine.parseAndRender(source, data);
  }
}

/** One long-lived browser per worker; a fresh context per document; JavaScript disabled in documents. */
export class PdfRenderer {
  readonly #browser: Browser;

  private constructor(browser: Browser) {
    this.#browser = browser;
  }

  static async start(): Promise<PdfRenderer> {
    return new PdfRenderer(await chromium.launch({ headless: true }));
  }

  async render(html: string, options: { format?: "A4" | "A5" | "Letter"; landscape?: boolean } = {}): Promise<Buffer> {
    const context = await this.#browser.newContext({ javaScriptEnabled: false });
    try {
      const page = await context.newPage();
      await page.setContent(html, { waitUntil: "load" });
      return await page.pdf({ format: options.format ?? "A4", landscape: options.landscape ?? false, printBackground: true, preferCSSPageSize: true });
    } finally {
      await context.close();
    }
  }

  async close(): Promise<void> {
    await this.#browser.close();
  }
}

export function pageCount(pdf: Buffer): number {
  return (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
}

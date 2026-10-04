/**
 * Spike S5 — tax invoice PDF: view model → LiquidJS (auto-escaped) → HTML → headless Chromium → PDF.
 * In production this runs in the worker process (ADR-0057), with one long-lived browser.
 */
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Liquid } from "liquidjs";
import QRCode from "qrcode";
import { chromium } from "playwright-core";
import type { Browser } from "playwright-core";
import { formatDecimal } from "@master-erp/kernel/decimal";
import type { Decimal, Money } from "@master-erp/kernel/decimal";
import { computeInvoice } from "@master-erp/spike-s4-decimals";
import type { InvoiceLineInput, SupplyType } from "@master-erp/spike-s4-decimals";
import { rupeesInWords } from "./words.ts";

export interface Party {
  name: string;
  address: string;
  gstin: string;
  state: string;
  state_code: string;
  bank?: string;
}

export interface InvoiceInput {
  number: string; // ≤ 16 characters, unique per financial year (CGST Rule 46(b))
  date: string;
  reference: string;
  transport: string;
  supplier: Party;
  buyer: Party;
  shipTo: string;
  supply: SupplyType;
  lines: (InvoiceLineInput & { uqc: string })[];
  terms: string;
  einvoice: boolean;
}

/** Rule 48: original for recipient, duplicate for transporter, triplicate for supplier. */
export const COPIES = ["ORIGINAL FOR RECIPIENT", "DUPLICATE FOR TRANSPORTER", "TRIPLICATE FOR SUPPLIER"];

const money = (m: Money) => formatDecimal(m.amount, "en-IN", 2, 2);
const plain = (d: Decimal | string) => (typeof d === "string" ? d : d.toString());

/**
 * Simulated IRP signed QR: in production the IRP (via the GSP) returns a signed JWT; we only print it.
 * The simulation has a realistic length so the QR density matches reality.
 */
function simulatedSignedQr(input: InvoiceInput, total: string, irn: string): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const header = b64({ alg: "RS256", kid: "SIMULATED", typ: "JWT" });
  const payload = b64({
    data: JSON.stringify({
      SellerGstin: input.supplier.gstin, BuyerGstin: input.buyer.gstin, DocNo: input.number, DocTyp: "INV",
      DocDt: input.date, TotInvVal: total, ItemCnt: input.lines.length, MainHsnCode: input.lines[0]?.hsn, Irn: irn,
      IrnDt: `${input.date} 10:15:00`,
    }),
    iss: "NIC",
  });
  const signature = createHash("sha512").update(header + payload).digest("base64url").repeat(4).slice(0, 342);
  return `${header}.${payload}.${signature}`;
}

export async function buildViewModel(input: InvoiceInput): Promise<Record<string, unknown>> {
  const inv = computeInvoice(input.lines, input.supply);
  const irn = createHash("sha256").update(`${input.supplier.gstin}2026-27INV${input.number}`).digest("hex");
  const einvoice = input.einvoice
    ? {
        irn,
        ack_no: "112620000000001",
        ack_date: input.date,
        qr_svg: await QRCode.toString(simulatedSignedQr(input, inv.grandTotal.toString(), irn), { type: "svg", errorCorrectionLevel: "M", margin: 0 }),
      }
    : undefined;
  return {
    copies: COPIES,
    invoice: { number: input.number, date: input.date, place_of_supply: `${input.buyer.state} (${input.buyer.state_code})`, reverse_charge: "No", reference: input.reference, transport: input.transport },
    supplier: input.supplier,
    buyer: input.buyer,
    ship_to: input.shipTo,
    terms: input.terms,
    intra: input.supply === "intra-state",
    einvoice,
    lines: inv.lines.map((l, i) => {
      const src = input.lines[i];
      return {
        description: l.description, hsn: l.hsn, qty: plain(src?.quantity ?? ""), uqc: src?.uqc ?? "", rate: plain(src?.rate ?? ""),
        gst_rate: `${src?.gstRate ?? ""}%`, taxable: money(l.taxable), cgst: money(l.cgst), sgst: money(l.sgst), igst: money(l.igst), total: money(l.total),
      };
    }),
    totals: {
      taxable: money(inv.taxable), cgst: money(inv.cgst), sgst: money(inv.sgst), igst: money(inv.igst),
      before_round_off: money(inv.grandTotal.minus(inv.roundOff)), round_off: money(inv.roundOff), grand_total: money(inv.grandTotal),
      in_words: rupeesInWords(inv.grandTotal),
    },
  };
}

const engine = new Liquid({
  root: fileURLToPath(new URL(".", import.meta.url)),
  extname: ".liquid",
  outputEscape: "escape", // tenant-editable templates cannot inject markup
  strictFilters: true,
  strictVariables: false,
});

export async function renderHtml(input: InvoiceInput): Promise<string> {
  return engine.renderFile("tax-invoice", await buildViewModel(input));
}

/** One long-lived browser per worker; one fresh page per document; JavaScript disabled in documents. */
export class PdfRenderer {
  readonly #browser: Browser;

  private constructor(browser: Browser) {
    this.#browser = browser;
  }

  static async start(): Promise<PdfRenderer> {
    return new PdfRenderer(await chromium.launch({ headless: true }));
  }

  async render(html: string): Promise<Buffer> {
    const context = await this.#browser.newContext({ javaScriptEnabled: false });
    try {
      const page = await context.newPage();
      await page.setContent(html, { waitUntil: "load" });
      return await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
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

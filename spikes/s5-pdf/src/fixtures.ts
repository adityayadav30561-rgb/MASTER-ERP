/** Fictional parties and jobs for the spike (sample GSTIN format, not real businesses). */
import type { InvoiceInput } from "./render.ts";

const supplier = {
  name: "Demo Offset Printers Pvt. Ltd.",
  address: "Gala 12, Industrial Estate, Bhiwandi, Thane, Maharashtra 421302",
  gstin: "27AAAAA0000A1Z5",
  state: "Maharashtra",
  state_code: "27",
  bank: "Demo Bank · A/c 000000000000 · IFSC DEMO0000001",
};

export const smallInvoice: InvoiceInput = {
  number: "INV/26-27/00042",
  date: "04-10-2026",
  reference: "Job J-1077 · PO 4500012345",
  transport: "Road · MH04AB1234 · E-way bill 1234 5678 9012",
  supplier,
  buyer: {
    name: "Sample Pharma Packaging LLP",
    address: "Plot 7, MIDC, Taloja, Raigad, Maharashtra 410208",
    gstin: "27BBBBB1111B1Z6",
    state: "Maharashtra",
    state_code: "27",
  },
  shipTo: "Same as billing address",
  supply: "intra-state",
  lines: [
    { description: "Mono carton 3-ply, 4-colour + varnish", hsn: "48191010", quantity: "5000", uqc: "NOS", rate: "3.4567", gstRate: "18" },
    { description: "Offset printing charges", hsn: "998912", quantity: "1", uqc: "OTH", rate: "12500", discount: "500", gstRate: "18" },
    { description: "Paper board 300 gsm (customer-supplied excess)", hsn: "48109200", quantity: "630.5", uqc: "KGS", rate: "92.75", gstRate: "12" },
  ],
  terms: "Payment within 30 days. Interest @ 18% p.a. on overdue amounts. Subject to Thane jurisdiction.",
  einvoice: true,
};

/** A large job invoice: 150 lines, inter-state, to test page breaks and render time. */
export const largeInvoice: InvoiceInput = {
  ...smallInvoice,
  number: "INV/26-27/00043",
  supply: "inter-state",
  buyer: { ...smallInvoice.buyer, name: "Sample Cartons Pvt. Ltd.", gstin: "24CCCCC2222C1Z7", state: "Gujarat", state_code: "24", address: "Survey 45, GIDC, Vapi, Gujarat 396195" },
  lines: Array.from({ length: 150 }, (_, i) => ({
    description: `Printed label SKU-${1000 + i}, 70×40 mm, chromo 80 gsm`,
    hsn: "48211020",
    quantity: String(1000 + i * 37),
    uqc: "NOS",
    rate: `0.${String(4321 + i).padStart(4, "0")}`,
    gstRate: "18",
  })),
};

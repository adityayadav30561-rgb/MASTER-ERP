/** Example lifecycles used by kernel tests (the real ones live in the modules). */
import type { LifecycleDefinition } from "./lifecycle.ts";

/** Purchase order, as drawn in Step 2 §6.2 (simplified). */
export const purchaseOrder: LifecycleDefinition = {
  documentType: "purchase.purchase_order",
  initial: "draft",
  states: {
    draft: { editable: true },
    submitted: {},
    approved: {},
    released: {},
    closed: { final: true },
    cancelled: { final: true },
    superseded: { final: true },
  },
  transitions: [
    { action: "submit", from: ["draft"], to: "submitted", event: "submitted" },
    { action: "reject", from: ["submitted"], to: "draft", event: "rejected" },
    { action: "approve", from: ["submitted"], to: "approved", event: "approved" },
    {
      action: "release", from: ["approved"], to: "released", event: "released", assignNumber: true, posts: true,
      guards: [(d) => (d.party_id ? undefined : "A purchase order needs a vendor before release")],
    },
    { action: "close", from: ["released"], to: "closed", event: "closed" },
    { action: "cancel", from: ["draft", "approved", "released"], to: "cancelled", event: "cancelled", cancels: true },
    { action: "amend", from: ["released"], to: "superseded", event: "amended", amends: true },
  ],
};

/** Goods receipt: posted immediately from draft. */
export const goodsReceipt: LifecycleDefinition = {
  documentType: "inventory.goods_receipt",
  initial: "draft",
  states: { draft: { editable: true }, posted: {}, cancelled: { final: true } },
  transitions: [
    { action: "post", from: ["draft"], to: "posted", event: "posted", assignNumber: true, posts: true },
    { action: "cancel", from: ["posted"], to: "cancelled", event: "cancelled", cancels: true },
  ],
};

/** GST tax invoice: gapless statutory numbering at posting. */
export const taxInvoice: LifecycleDefinition = {
  documentType: "sales.tax_invoice",
  initial: "draft",
  states: { draft: { editable: true }, posted: {}, cancelled: { final: true } },
  transitions: [
    { action: "post", from: ["draft"], to: "posted", event: "posted", assignNumber: true, posts: true },
    { action: "cancel", from: ["posted"], to: "cancelled", event: "cancelled", cancels: true },
  ],
};

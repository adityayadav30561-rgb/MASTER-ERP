import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newId } from "../ids/index.ts";
import { newTraceId, withTenant } from "../db/index.ts";
import type { ExecutionContext } from "../db/index.ts";
import { createTestDatabase, hasTestDatabase } from "../testing/index.ts";
import type { TestDatabase } from "../testing/index.ts";
import { provisionTenant } from "../tenancy/index.ts";
import { FileError, FileService, LocalFileStorage } from "./index.ts";

const PDF = new Uint8Array(Buffer.from("%PDF-1.7\n% sample\n%%EOF"));
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);

describe.skipIf(!hasTestDatabase)("K11 files", { timeout: 60_000 }, () => {
  let t: TestDatabase;
  let alpha: ExecutionContext;
  let beta: ExecutionContext;
  const storage = new LocalFileStorage(mkdtempSync(join(tmpdir(), "erp-files-")), "s".repeat(40));
  const files = new FileService(storage, { maxBytes: 1024 });
  const doc = newId();

  beforeAll(async () => {
    t = await createTestDatabase();
    alpha = { tenantId: await provisionTenant(t.owner.db, { code: "alpha", name: "Alpha", status: "active" }), actor: { kind: "user", userId: newId() }, traceId: newTraceId() };
    beta = { tenantId: await provisionTenant(t.owner.db, { code: "beta", name: "Beta", status: "active" }), actor: { kind: "user", userId: newId() }, traceId: newTraceId() };
  });
  afterAll(async () => t?.drop());

  it("stores tenant-keyed files and serves them through short-lived signed links", async () => {
    const f = await withTenant(t.app.db, alpha, (tx) => files.store(tx, alpha, { objectType: "kernel.document", objectId: doc, filename: "artwork proof.pdf", contentType: "application/pdf", bytes: PDF }));
    expect(f.storage_key.startsWith(`${alpha.tenantId}/`)).toBe(true);
    const url = await withTenant(t.app.db, alpha, (tx) => files.downloadUrl(tx, f.id, 60));
    const u = new URL(url, "http://x");
    const key = decodeURIComponent(u.pathname.replace(/^\/files\//, ""));
    expect(storage.verify(key, u.searchParams.get("expires") ?? "", u.searchParams.get("signature") ?? "")).toBe(true);
    expect(storage.verify(key, u.searchParams.get("expires") ?? "", "forged")).toBe(false);
    expect(storage.verify(key, String(Math.floor(Date.now() / 1000) - 1), u.searchParams.get("signature") ?? "")).toBe(false);
    expect((await withTenant(t.app.db, alpha, (tx) => files.read(tx, f.id))).equals(Buffer.from(PDF))).toBe(true);
    // Another tenant cannot even see that the file exists.
    await expect(withTenant(t.app.db, beta, (tx) => files.get(tx, f.id))).rejects.toThrow(/not found/);
  });

  it("checks type, real content, name and size", async () => {
    const store = (filename: string, contentType: string, bytes: Uint8Array) =>
      withTenant(t.app.db, alpha, (tx) => files.store(tx, alpha, { objectType: "kernel.document", objectId: doc, filename, contentType, bytes }));
    await expect(store("x.exe", "application/x-msdownload", PDF)).rejects.toThrow(/not accepted/);
    await expect(store("fake.pdf", "application/pdf", PNG)).rejects.toThrow(/does not match/);
    await expect(store("photo.pdf", "image/png", PNG)).rejects.toThrow(/should end in .png/);
    await expect(store("big.pdf", "application/pdf", new Uint8Array(2048).fill(0x25))).rejects.toThrow(FileError);
    const ok = await store("../../etc/passwd.png", "image/png", PNG);
    expect(ok.filename).toBe(".._.._etc_passwd.png");
  });

  it("never deletes retained records and never changes stored files", async () => {
    const invoice = await withTenant(t.app.db, alpha, (tx) =>
      files.store(tx, alpha, { objectType: "kernel.document", objectId: doc, filename: "INV-26-27-00042.pdf", contentType: "application/pdf", bytes: PDF, retained: true }),
    );
    await expect(withTenant(t.app.db, alpha, (tx) => files.remove(tx, invoice.id))).rejects.toThrow(/retained record/);
    await expect(withTenant(t.app.db, alpha, (tx) => tx.updateTable("kernel.file").set({ filename: "renamed.pdf" }).where("id", "=", invoice.id).execute())).rejects.toThrow(/immutable/);
    const attachments = await withTenant(t.app.db, alpha, (tx) => files.list(tx, "kernel.document", doc));
    const proof = attachments.find((a) => a.filename === "artwork proof.pdf");
    await withTenant(t.app.db, alpha, (tx) => files.remove(tx, proof?.id ?? ""));
    expect((await withTenant(t.app.db, alpha, (tx) => files.list(tx, "kernel.document", doc))).map((a) => a.filename)).not.toContain("artwork proof.pdf");
  });
});

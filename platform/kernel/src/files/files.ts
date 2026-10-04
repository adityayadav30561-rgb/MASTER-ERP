/**
 * K11 Files: attachments and generated documents behind a storage port (local disk for development and
 * on-premise; S3-compatible object storage in the cloud). Keys are tenant-prefixed; downloads use
 * short-lived signed URLs; uploads are checked for size, type and real content (magic bytes).
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { newId } from "../ids/index.ts";
import type { Tx } from "../db/database.ts";
import type { ExecutionContext } from "../db/context.ts";

export interface FileStorage {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  /** URL that works for `seconds` only. */
  signedUrl(key: string, seconds: number): string;
}

export class FileError extends Error {
  override name = "FileError";
}

/** Local-disk storage with HMAC-signed download links (development, on-premise). */
export class LocalFileStorage implements FileStorage {
  readonly #root: string;
  readonly #secret: string;
  readonly #baseUrl: string;

  constructor(root: string, secret: string, baseUrl = "/files") {
    if (secret.length < 32) throw new FileError("Signing secret too short");
    this.#root = resolve(root);
    this.#secret = secret;
    this.#baseUrl = baseUrl;
  }

  #path(key: string): string {
    const p = resolve(join(this.#root, key));
    if (!p.startsWith(this.#root + "/")) throw new FileError("Invalid storage key");
    return p;
  }

  async put(key: string, bytes: Uint8Array): Promise<void> {
    const p = this.#path(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, bytes, { flag: "wx" }); // never overwrite
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.#path(key));
  }

  async delete(key: string): Promise<void> {
    await rm(this.#path(key), { force: true });
  }

  #sign(key: string, expires: number): string {
    return createHmac("sha256", this.#secret).update(`${key}\n${expires}`).digest("base64url");
  }

  signedUrl(key: string, seconds: number): string {
    const expires = Math.floor(Date.now() / 1000) + seconds;
    return `${this.#baseUrl}/${key}?expires=${expires}&signature=${this.#sign(key, expires)}`;
  }

  /** Check a download link (the server's /files route calls this before streaming). */
  verify(key: string, expires: string, signature: string): boolean {
    const exp = Number(expires);
    if (!Number.isSafeInteger(exp) || exp < Date.now() / 1000) return false;
    const expected = Buffer.from(this.#sign(key, exp));
    const given = Buffer.from(signature);
    return expected.length === given.length && timingSafeEqual(expected, given);
  }
}

/** Allowed upload types with their magic bytes (content must match the declared type). */
const TYPES: Record<string, { magic?: number[]; extensions: string[] }> = {
  "application/pdf": { magic: [0x25, 0x50, 0x44, 0x46], extensions: ["pdf"] },
  "image/png": { magic: [0x89, 0x50, 0x4e, 0x47], extensions: ["png"] },
  "image/jpeg": { magic: [0xff, 0xd8, 0xff], extensions: ["jpg", "jpeg"] },
  "image/webp": { magic: [0x52, 0x49, 0x46, 0x46], extensions: ["webp"] },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { magic: [0x50, 0x4b, 0x03, 0x04], extensions: ["xlsx"] },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { magic: [0x50, 0x4b, 0x03, 0x04], extensions: ["docx"] },
  "text/csv": { extensions: ["csv"] },
};

export const MAX_FILE_BYTES = 20 * 1024 * 1024;

export interface StoredFile {
  id: string;
  filename: string;
  content_type: string;
  size_bytes: string;
  sha256: string;
  storage_key: string;
  classification: "normal" | "confidential" | "personal";
  retained: boolean;
}

export class FileService {
  readonly #storage: FileStorage;
  readonly #maxBytes: number;

  constructor(storage: FileStorage, options: { maxBytes?: number } = {}) {
    this.#storage = storage;
    this.#maxBytes = options.maxBytes ?? MAX_FILE_BYTES;
  }

  async store(
    tx: Tx,
    ctx: ExecutionContext,
    input: { objectType: string; objectId: string; filename: string; contentType: string; bytes: Uint8Array; classification?: StoredFile["classification"]; retained?: boolean },
  ): Promise<StoredFile> {
    const type = TYPES[input.contentType];
    if (!type) throw new FileError(`Files of type ${input.contentType} are not accepted`);
    if (input.bytes.byteLength === 0) throw new FileError("The file is empty");
    if (input.bytes.byteLength > this.#maxBytes) throw new FileError(`The file is larger than ${Math.round(this.#maxBytes / 1024 / 1024)} MB`);
    if (type.magic && !type.magic.every((b, i) => input.bytes[i] === b)) throw new FileError("The file content does not match its type");
    // eslint-disable-next-line no-control-regex -- strip control characters and path separators on purpose
    const filename = input.filename.normalize("NFC").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 200);
    const ext = filename.split(".").pop()?.toLowerCase() ?? "";
    if (!type.extensions.includes(ext)) throw new FileError(`A ${input.contentType} file should end in .${type.extensions[0]}`);

    const id = newId();
    const key = `${ctx.tenantId}/${new Date().getUTCFullYear()}/${id}`;
    const sha256 = createHash("sha256").update(input.bytes).digest("hex");
    await tx
      .insertInto("kernel.file")
      .values({
        id, object_type: input.objectType, object_id: input.objectId, filename, content_type: input.contentType,
        size_bytes: String(input.bytes.byteLength), sha256, storage_key: key,
        classification: input.classification ?? "normal", retained: input.retained ?? false,
      })
      .execute();
    // Written after the row: if the transaction later rolls back, the orphan object is removed by the sweep job.
    await this.#storage.put(key, input.bytes, input.contentType);
    return this.get(tx, id);
  }

  async get(tx: Tx, id: string): Promise<StoredFile> {
    const f = await tx
      .selectFrom("kernel.file")
      .select(["id", "filename", "content_type", "size_bytes", "sha256", "storage_key", "classification", "retained"])
      .where("id", "=", id)
      .where("deleted_at", "is", null)
      .executeTakeFirst();
    if (!f) throw new FileError("File not found");
    return f as StoredFile;
  }

  async list(tx: Tx, objectType: string, objectId: string): Promise<StoredFile[]> {
    return (await tx
      .selectFrom("kernel.file")
      .select(["id", "filename", "content_type", "size_bytes", "sha256", "storage_key", "classification", "retained"])
      .where("object_type", "=", objectType)
      .where("object_id", "=", objectId)
      .where("deleted_at", "is", null)
      .orderBy("id")
      .execute()) as StoredFile[];
  }

  /** A download link valid for a few minutes (only after authorization of the owning record). */
  async downloadUrl(tx: Tx, id: string, seconds = 300): Promise<string> {
    const f = await this.get(tx, id);
    return this.#storage.signedUrl(f.storage_key, seconds);
  }

  async read(tx: Tx, id: string): Promise<Buffer> {
    const f = await this.get(tx, id);
    const bytes = await this.#storage.get(f.storage_key);
    if (createHash("sha256").update(bytes).digest("hex") !== f.sha256) throw new FileError("Stored file is corrupted or was altered");
    return bytes;
  }

  /** Soft delete; retained records (statutory output) are refused by the database. */
  async remove(tx: Tx, id: string): Promise<void> {
    await tx.updateTable("kernel.file").set({ deleted_at: new Date() }).where("id", "=", id).execute();
  }
}

import { put, get } from "@vercel/blob";
import { promises as fs } from "fs";
import path from "path";

/**
 * Файлове сховище.
 * - Є BLOB_READ_WRITE_TOKEN → Vercel Blob (private), як і раніше.
 * - Немає → локальний диск (FILES_DIR або ./data/files) — для VPS і розробки.
 * У БД зберігаємо url: або https-URL блоба, або "local:<key>".
 */

const LOCAL_PREFIX = "local:";

function localRoot(): string {
  return process.env.FILES_DIR || path.join(process.cwd(), "data", "files");
}

function safeKey(key: string): string {
  const normalized = path.posix.normalize(key).replace(/^\/+/, "");
  if (normalized.startsWith("..")) throw new Error("Invalid storage key");
  return normalized;
}

export async function putFile(key: string, data: Buffer, contentType?: string): Promise<string> {
  const k = safeKey(key);
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(k, data, { access: "private", addRandomSuffix: false, contentType });
    return blob.url;
  }
  const full = path.join(localRoot(), k);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, data);
  return LOCAL_PREFIX + k;
}

export async function readFile(url: string): Promise<Buffer> {
  if (url.startsWith(LOCAL_PREFIX)) {
    return fs.readFile(path.join(localRoot(), safeKey(url.slice(LOCAL_PREFIX.length))));
  }
  const res = await get(url, { access: "private" });
  if (!res) throw new Error("File not found in blob storage");
  return Buffer.from(await new Response(res.stream).arrayBuffer());
}

export function extFromName(name: string): string {
  const m = /\.([a-z0-9]{1,6})$/i.exec(name);
  return m ? "." + m[1].toLowerCase() : "";
}

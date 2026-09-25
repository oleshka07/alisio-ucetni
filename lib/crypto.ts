import * as crypto from "crypto";

/**
 * AES-256-GCM для паролів поштових скриньок і банківських токенів.
 * Формат (сумісний з ALiSiO PMS bank-inbox-engine): iv:tag:ciphertext (base64).
 * Ключ: ENCRYPTION_KEY (64 hex = 32 байти). Для сумісності з PMS читає й BANK_INBOX_SECRET.
 */
function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY || process.env.BANK_INBOX_SECRET;
  if (!hex || !/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(
      "ENCRYPTION_KEY must be 64 hex chars. Generate: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }
  return Buffer.from(hex, "hex");
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

export function decryptSecret(encrypted: string): string {
  const [ivB, tagB, ctB] = encrypted.split(":");
  if (!ivB || !tagB || !ctB) throw new Error("Invalid encrypted payload format");
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivB, "base64"));
  decipher.setAuthTag(Buffer.from(tagB, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ctB, "base64")), decipher.final()]).toString("utf8");
}

export function sha256Hex(data: Buffer | string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

export function hmacHex(secret: string, data: string): string {
  return crypto.createHmac("sha256", secret).update(data).digest("hex");
}

/** Constant-time string compare. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";

const CIPHERTEXT_VERSION = "v1";
const IV_LENGTH = 12;
const KEY_LENGTH = 32;

/**
 * Encrypts sensitive application fields before they are written to SQLite.
 *
 * The application layer deliberately uses a random IV for every value. Exact
 * lookups that are needed for uniqueness use createSensitiveLookup instead of
 * making ciphertext deterministic.
 */
export function encryptSensitive(value: string): string {
  if (!value || isSensitiveCiphertext(value)) {
    return value;
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", getDataEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [
    CIPHERTEXT_VERSION,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
}

export function decryptSensitive(value: unknown): string {
  if (value === undefined || value === null || value === "") {
    return "";
  }
  if (typeof value !== "string" || !isSensitiveCiphertext(value)) {
    return String(value);
  }

  const [version, encodedIv, encodedTag, encodedCiphertext, ...extra] = value.split(":");
  if (
    version !== CIPHERTEXT_VERSION ||
    !encodedIv ||
    !encodedTag ||
    !encodedCiphertext ||
    extra.length > 0
  ) {
    throw new Error("敏感数据密文格式不正确");
  }

  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      getDataEncryptionKey(),
      Buffer.from(encodedIv, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(encodedTag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encodedCiphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("敏感数据解密失败，请检查 DATA_ENCRYPTION_KEY 配置");
  }
}

export function decryptSensitiveOptional(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  return decryptSensitive(value);
}

export function createSensitiveLookup(value: string): string {
  return createHmac("sha256", getDataEncryptionKey()).update(value, "utf8").digest("hex");
}

export function isSensitiveCiphertext(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(`${CIPHERTEXT_VERSION}:`);
}

export function assertDataEncryptionKey(): void {
  getDataEncryptionKey();
}

function getDataEncryptionKey(): Buffer {
  const configured = process.env.DATA_ENCRYPTION_KEY?.trim();
  if (!configured && process.env.NODE_ENV === "production") {
    throw new Error("生产环境必须配置 DATA_ENCRYPTION_KEY");
  }

  const source = configured || process.env.JWT_SECRET?.trim() || "admin-x-development-data-key";
  return createHash("sha256").update(source, "utf8").digest().subarray(0, KEY_LENGTH);
}

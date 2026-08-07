import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const HASH_ALGORITHM = "scrypt";
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_LENGTH).toString("hex");
  const hash = scryptSync(password, salt, KEY_LENGTH).toString("hex");
  return `${HASH_ALGORITHM}:${salt}:${hash}`;
}

export function verifyPassword(password: string, encodedHash: string): boolean {
  const [algorithm, salt, encodedKey] = encodedHash.split(":");
  if (algorithm !== HASH_ALGORITHM || !salt || !encodedKey) {
    return false;
  }

  try {
    const actualKey = scryptSync(password, salt, KEY_LENGTH);
    const expectedKey = Buffer.from(encodedKey, "hex");
    return expectedKey.length === actualKey.length && timingSafeEqual(actualKey, expectedKey);
  } catch {
    return false;
  }
}

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const OTP_STEP_SECONDS = 30;
const MFA_KEY = createHash("sha256")
  .update(process.env.JWT_SECRET ?? "admin-x-development-secret")
  .digest();

export function generateMfaSecret(): string {
  return encodeBase32(randomBytes(20));
}

export function createMfaOtpAuthUrl(secret: string, username: string): string {
  const label = encodeURIComponent(`Admin X:${username}`);
  const issuer = encodeURIComponent("Admin X");
  return `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=${OTP_STEP_SECONDS}`;
}

export function verifyMfaCode(secret: string, code: string, now = Date.now()): boolean {
  if (!/^[0-9]{6}$/.test(code.trim())) {
    return false;
  }
  const currentStep = Math.floor(now / 1000 / OTP_STEP_SECONDS);
  for (const offset of [-1, 0, 1]) {
    const expected = generateCode(secret, currentStep + offset);
    const actualBuffer = Buffer.from(code.trim());
    const expectedBuffer = Buffer.from(expected);
    if (
      actualBuffer.length === expectedBuffer.length &&
      timingSafeEqual(actualBuffer, expectedBuffer)
    ) {
      return true;
    }
  }
  return false;
}

export function encryptMfaSecret(secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", MFA_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
}

export function decryptMfaSecret(value: string): string {
  if (!value || !value.startsWith("v1:")) {
    return value;
  }
  const [, ivValue, tagValue, encryptedValue] = value.split(":");
  if (!ivValue || !tagValue || !encryptedValue) {
    return "";
  }
  try {
    const decipher = createDecipheriv("aes-256-gcm", MFA_KEY, Buffer.from(ivValue, "base64url"));
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return "";
  }
}

function generateCode(secret: string, counter: number): string {
  const key = decodeBase32(secret);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", key).update(buffer).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

function encodeBase32(value: Buffer): string {
  let bits = 0;
  let bitCount = 0;
  let output = "";
  for (const byte of value) {
    bits = (bits << 8) | byte;
    bitCount += 8;
    while (bitCount >= 5) {
      bitCount -= 5;
      output += BASE32_ALPHABET[(bits >> bitCount) & 31];
    }
  }
  if (bitCount > 0) {
    output += BASE32_ALPHABET[(bits << (5 - bitCount)) & 31];
  }
  return output;
}

function decodeBase32(value: string): Buffer {
  let bits = 0;
  let bitCount = 0;
  const bytes: number[] = [];
  for (const character of value.toUpperCase().replace(/=+$/, "")) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index < 0) {
      throw new Error("Invalid MFA secret");
    }
    bits = (bits << 5) | index;
    bitCount += 5;
    if (bitCount >= 8) {
      bitCount -= 8;
      bytes.push((bits >> bitCount) & 0xff);
    }
  }
  return Buffer.from(bytes);
}

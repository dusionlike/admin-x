import type { AuditRecord } from "@admin-x/shared";

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu;
const IPV4_PATTERN = /\b(?:\d{1,3}\.){3}\d{1,3}\b/gu;
const IPV4_ADDRESS_PATTERN = /^(?:\d{1,3}\.){3}\d{1,3}$/u;
const ACCOUNT_MENTION_PATTERN = /(^|[\s([{"'“‘，。:：；、（【])@([a-z0-9][a-z0-9._-]{1,63})/giu;
const SENSITIVE_KEY_PATTERN = /(?:password|token|secret|credential|code|authorization|cookie)/iu;

export function maskAuditRecords(records: AuditRecord[]): AuditRecord[] {
  return records.map(maskAuditRecord);
}

export function maskAuditRecord(record: AuditRecord): AuditRecord {
  return {
    ...record,
    actorName: maskLabel(record.actorName),
    actorUsername: record.actorUsername ? maskIdentifier(record.actorUsername) : undefined,
    after: maskAuditValue(record.after),
    before: maskAuditValue(record.before),
    description: maskAuditText(record.description),
    ipAddress: record.ipAddress ? maskIpAddress(record.ipAddress) : undefined,
    requestId: record.requestId ? maskIdentifier(record.requestId) : undefined,
    targetId: record.targetId ? maskIdentifier(record.targetId) : undefined,
    title: maskAuditText(record.title),
    userAgent: record.userAgent ? maskAuditText(record.userAgent) : undefined,
  };
}

export function maskAuditText(value: string): string {
  return value
    .replace(EMAIL_PATTERN, maskEmail)
    .replace(IPV4_PATTERN, maskIpAddress)
    .replace(
      ACCOUNT_MENTION_PATTERN,
      (_match, prefix: string, username: string) => `${prefix}@${maskIdentifier(username)}`,
    );
}

function maskAuditValue(value: unknown, key?: string): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === "string") {
    const normalizedKey = key?.toLowerCase() ?? "";
    if (SENSITIVE_KEY_PATTERN.test(normalizedKey)) {
      return "[已脱敏]";
    }
    if (normalizedKey.includes("email")) {
      return maskEmail(value);
    }
    if (normalizedKey.includes("ip")) {
      return maskIpAddress(value);
    }
    if (normalizedKey.includes("username") || normalizedKey.includes("account")) {
      return maskIdentifier(value);
    }
    if (normalizedKey.includes("displayname") || normalizedKey.includes("actorname")) {
      return maskLabel(value);
    }
    return maskAuditText(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => maskAuditValue(item, key));
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        maskAuditValue(entryValue, entryKey),
      ]),
    );
  }
  return value;
}

function maskEmail(value: string): string {
  const separator = value.indexOf("@");
  if (separator <= 0) {
    return "[已脱敏邮箱]";
  }
  return `${value.slice(0, 1)}***${value.slice(separator)}`;
}

function maskIdentifier(value: string): string {
  const characters = [...value];
  if (characters.length <= 1) {
    return "*";
  }
  if (characters.length === 2) {
    return `${characters[0]}*`;
  }
  return `${characters[0]}***${characters.at(-1)}`;
}

function maskIpAddress(value: string): string {
  if (IPV4_ADDRESS_PATTERN.test(value)) {
    return value.replace(/^(\d+\.\d+)\.\d+\.\d+$/u, "$1.*.*");
  }
  if (value.includes(":")) {
    return `${value.split(":", 1)[0]}:*`;
  }
  return "[已脱敏地址]";
}

function maskLabel(value: string): string {
  const characters = [...value];
  if (characters.length <= 1) {
    return "*";
  }
  return `${characters[0]}${"*".repeat(Math.max(1, characters.length - 1))}`;
}

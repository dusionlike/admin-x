import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import { UnauthorizedException } from "@nestjs/common";

export const REQUEST_TIMESTAMP_HEADER = "x-admin-x-timestamp";
export const REQUEST_NONCE_HEADER = "x-admin-x-nonce";
export const REQUEST_SIGNATURE_HEADER = "x-admin-x-signature";
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

export function assertRequestIntegrity(
  request: Request,
  token: string,
  sessionId: string | undefined,
  consumeNonce: (sessionId: string, nonce: string, expiresAt: string) => boolean,
): void {
  if (!sessionId) {
    throw new UnauthorizedException("会话缺少请求完整性标识");
  }

  const timestampText = readHeader(request, REQUEST_TIMESTAMP_HEADER);
  const nonce = readHeader(request, REQUEST_NONCE_HEADER);
  const signature = readHeader(request, REQUEST_SIGNATURE_HEADER)?.toLowerCase();
  const timestamp = Number(timestampText);
  if (
    !timestampText ||
    !Number.isSafeInteger(timestamp) ||
    Math.abs(Date.now() - timestamp) > MAX_CLOCK_SKEW_MS
  ) {
    throw new UnauthorizedException("请求时间戳无效或已过期");
  }
  if (!nonce || !/^[A-Za-z0-9_-]{16,128}$/u.test(nonce)) {
    throw new UnauthorizedException("请求随机数无效");
  }
  if (!signature || !/^[a-f0-9]{64}$/u.test(signature)) {
    throw new UnauthorizedException("请求签名缺失或格式不正确");
  }

  const canonical = canonicalRequest(request, timestampText, nonce);
  const expected = createHmac("sha256", token).update(canonical, "utf8").digest("hex");
  const expectedBytes = Buffer.from(expected, "utf8");
  const actualBytes = Buffer.from(signature, "utf8");
  if (expectedBytes.length !== actualBytes.length || !timingSafeEqual(expectedBytes, actualBytes)) {
    throw new UnauthorizedException("请求签名校验失败");
  }

  const expiresAt = new Date(timestamp + MAX_CLOCK_SKEW_MS).toISOString();
  if (!consumeNonce(sessionId, nonce, expiresAt)) {
    throw new UnauthorizedException("请求随机数已使用，禁止重复提交");
  }
}

export function canonicalRequest(
  request: Pick<Request, "method" | "path" | "body">,
  timestamp: string,
  nonce: string,
): string {
  const path = request.path.replace(/^\/api(?=\/|$)/u, "").split("?", 1)[0] || "/";
  const body = request.body === undefined ? "" : JSON.stringify(request.body);
  return [request.method.toUpperCase(), path, timestamp, nonce, body ?? ""].join("\n");
}

function readHeader(request: Request, name: string): string | undefined {
  const value = request.headers[name];
  const candidate = Array.isArray(value) ? value[0] : value;
  return typeof candidate === "string" ? candidate.trim() : undefined;
}

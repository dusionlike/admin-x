import { BadRequestException, HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { createHash, randomInt, randomUUID, timingSafeEqual } from "node:crypto";

import type { LoginCaptchaResponse } from "@admin-x/shared";

import type { AuditContext } from "../database/database.service.js";

const CAPTCHA_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const CAPTCHA_CODE_LENGTH = 4;
const CAPTCHA_EXPIRES_MS = 5 * 60 * 1_000;
const CAPTCHA_MAX_ATTEMPTS = 5;
const CAPTCHA_REQUEST_WINDOW_MS = 60 * 1_000;
const CAPTCHA_REQUEST_LIMIT = 30;
const CAPTCHA_COLORS = ["#4f46a5", "#0f766e", "#b45309", "#be123c"] as const;

interface CaptchaChallenge {
  attempts: number;
  codeHash: string;
  createdAt: number;
  expiresAt: number;
  requestIp?: string;
}

@Injectable()
export class CaptchaService {
  private readonly challenges = new Map<string, CaptchaChallenge>();
  private readonly requestsByIp = new Map<string, number[]>();

  issue(context?: AuditContext): LoginCaptchaResponse {
    this.cleanup();
    const requestIp = context?.ipAddress?.trim() || undefined;
    this.assertIssueRateLimit(requestIp ?? "unknown");

    const id = randomUUID();
    const code = createCaptchaCode();
    const createdAt = Date.now();
    this.challenges.set(id, {
      attempts: 0,
      codeHash: hashCaptchaCode(id, code),
      createdAt,
      expiresAt: createdAt + CAPTCHA_EXPIRES_MS,
      requestIp,
    });

    return {
      expiresIn: CAPTCHA_EXPIRES_MS / 1_000,
      id,
      image: createCaptchaImage(code),
    };
  }

  assertValid(
    id: string | undefined,
    code: string | undefined,
    context?: AuditContext,
    consume = true,
  ): void {
    if (!this.verify(id, code, context, consume)) {
      throw new BadRequestException("图形验证码错误或已过期，请刷新后重试");
    }
  }

  verify(
    id: string | undefined,
    code: string | undefined,
    context?: AuditContext,
    consume = true,
  ): boolean {
    this.cleanup();
    if (!id || !code) {
      return false;
    }

    const challenge = this.challenges.get(id);
    if (!challenge || (challenge.requestIp && context?.ipAddress !== challenge.requestIp)) {
      return false;
    }
    if (challenge.attempts >= CAPTCHA_MAX_ATTEMPTS) {
      this.challenges.delete(id);
      return false;
    }

    const normalizedCode = code.trim().toUpperCase();
    if (!/^[A-Z0-9]{4}$/u.test(normalizedCode)) {
      this.recordFailedAttempt(id, challenge);
      return false;
    }

    const expected = Buffer.from(challenge.codeHash, "hex");
    const actual = Buffer.from(hashCaptchaCode(id, normalizedCode), "hex");
    const valid = expected.length === actual.length && timingSafeEqual(expected, actual);
    if (!valid) {
      this.recordFailedAttempt(id, challenge);
      return false;
    }

    if (consume) {
      this.challenges.delete(id);
    }
    return true;
  }

  private assertIssueRateLimit(requestIp: string): void {
    const now = Date.now();
    const cutoff = now - CAPTCHA_REQUEST_WINDOW_MS;
    const recentRequests = (this.requestsByIp.get(requestIp) ?? []).filter(
      (timestamp) => timestamp > cutoff,
    );
    if (recentRequests.length >= CAPTCHA_REQUEST_LIMIT) {
      throw new HttpException("验证码获取过于频繁，请稍后再试", HttpStatus.TOO_MANY_REQUESTS);
    }
    recentRequests.push(now);
    this.requestsByIp.set(requestIp, recentRequests);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [id, challenge] of this.challenges) {
      if (challenge.expiresAt <= now || challenge.attempts >= CAPTCHA_MAX_ATTEMPTS) {
        this.challenges.delete(id);
      }
    }
    const cutoff = now - CAPTCHA_REQUEST_WINDOW_MS;
    for (const [requestIp, timestamps] of this.requestsByIp) {
      const recentRequests = timestamps.filter((timestamp) => timestamp > cutoff);
      if (recentRequests.length > 0) {
        this.requestsByIp.set(requestIp, recentRequests);
      } else {
        this.requestsByIp.delete(requestIp);
      }
    }
  }

  private recordFailedAttempt(id: string, challenge: CaptchaChallenge): void {
    challenge.attempts += 1;
    if (challenge.attempts >= CAPTCHA_MAX_ATTEMPTS) {
      this.challenges.delete(id);
    }
  }
}

function createCaptchaCode(): string {
  return Array.from(
    { length: CAPTCHA_CODE_LENGTH },
    () => CAPTCHA_ALPHABET[randomInt(0, CAPTCHA_ALPHABET.length)],
  ).join("");
}

function hashCaptchaCode(id: string, code: string): string {
  return createHash("sha256").update(`${id}:${code}`, "utf8").digest("hex");
}

function createCaptchaImage(code: string): string {
  const lines = Array.from({ length: 5 }, () => {
    const startX = randomInt(0, 145);
    const startY = randomInt(4, 45);
    const endX = randomInt(0, 145);
    const endY = randomInt(4, 45);
    const color = CAPTCHA_COLORS[randomInt(0, CAPTCHA_COLORS.length)];
    return `<path d="M ${startX} ${startY} Q 72 ${randomInt(0, 48)} ${endX} ${endY}" fill="none" stroke="${color}" stroke-opacity=".24" stroke-width="1.4"/>`;
  }).join("");
  const dots = Array.from({ length: 26 }, () => {
    const color = CAPTCHA_COLORS[randomInt(0, CAPTCHA_COLORS.length)];
    return `<circle cx="${randomInt(2, 143)}" cy="${randomInt(2, 47)}" r="${randomInt(1, 2)}" fill="${color}" fill-opacity=".28"/>`;
  }).join("");
  const characters = [...code]
    .map((character, index) => {
      const x = 18 + index * 35 + randomInt(-3, 4);
      const y = 32 + randomInt(-4, 5);
      const rotation = randomInt(-18, 19);
      const color = CAPTCHA_COLORS[randomInt(0, CAPTCHA_COLORS.length)];
      return `<text x="${x}" y="${y}" fill="${color}" font-family="Arial, sans-serif" font-size="25" font-weight="700" text-anchor="middle" transform="rotate(${rotation} ${x} ${y})">${character}</text>`;
    })
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="48" viewBox="0 0 144 48"><rect width="144" height="48" rx="8" fill="#f4f6fb"/>${lines}${dots}${characters}</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}

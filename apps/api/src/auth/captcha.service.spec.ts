import { expect, test } from "vite-plus/test";

import { CaptchaService, isCaptchaDisabled } from "./captcha.service.js";

test("only disables captcha for an explicit non-production environment", () => {
  expect(isCaptchaDisabled({ CAPTCHA_DISABLED: "true", NODE_ENV: "test" })).toBe(true);
  expect(isCaptchaDisabled({ CAPTCHA_DISABLED: "ON", NODE_ENV: "development" })).toBe(true);
  expect(isCaptchaDisabled({ CAPTCHA_DISABLED: "false", NODE_ENV: "test" })).toBe(false);
  expect(isCaptchaDisabled({ CAPTCHA_DISABLED: "true", NODE_ENV: "production" })).toBe(false);
});

test("issues a readable captcha and consumes it after a successful verification", () => {
  const service = new CaptchaService();
  const context = { ipAddress: "127.0.0.1", requestId: "captcha-test" };
  const issued = service.issue(context);
  const svg = Buffer.from(issued.image.split(",")[1] ?? "", "base64").toString("utf8");
  const code = [...svg.matchAll(/<text[^>]*>([A-Z0-9])<\/text>/gu)]
    .map((match) => match[1])
    .join("");

  expect(issued.id).toHaveLength(36);
  expect(issued.expiresIn).toBe(300);
  expect(issued.image.startsWith("data:image/svg+xml;base64,")).toBe(true);
  expect(code).toHaveLength(4);
  expect(service.verify(issued.id, code.toLowerCase(), context)).toBe(true);
  expect(service.verify(issued.id, code, context)).toBe(false);
});

test("supports non-consuming verification for the email-code preflight and limits failures", () => {
  const service = new CaptchaService();
  const context = { ipAddress: "127.0.0.2", requestId: "captcha-preflight-test" };
  const issued = service.issue(context);
  const svg = Buffer.from(issued.image.split(",")[1] ?? "", "base64").toString("utf8");
  const code = [...svg.matchAll(/<text[^>]*>([A-Z0-9])<\/text>/gu)]
    .map((match) => match[1])
    .join("");

  expect(service.verify(issued.id, code, context, false)).toBe(true);
  expect(service.verify(issued.id, code, context, false)).toBe(true);
  expect(service.verify(issued.id, code, context)).toBe(true);

  const locked = service.issue(context);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    expect(service.verify(locked.id, "!!!!", context)).toBe(false);
  }
  expect(service.verify(locked.id, "!!!!", context)).toBe(false);
});

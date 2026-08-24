import "./env.js";

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import "reflect-metadata";

import { randomUUID } from "node:crypto";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { NextFunction, Request, Response } from "express";
import * as classTransformer from "class-transformer";
import * as classValidator from "class-validator";

import { API_PREFIX } from "@admin-x/shared";

import { AppModule } from "./app.module.js";
import type { RequestWithId } from "./auth/request-context.js";

if (!process.env.DATABASE_PATH?.trim()) {
  process.env.DATABASE_PATH = fileURLToPath(new URL("../data/admin-x.sqlite", import.meta.url));
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  app.disable("x-powered-by");
  const allowedOrigins = (process.env.FRONTEND_ORIGIN ?? "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const secureTransportRequired =
    process.env.SECURE_TRANSPORT_REQUIRED === "true" ||
    (process.env.NODE_ENV === "production" && process.env.SECURE_TRANSPORT_REQUIRED !== "false");
  app.use((request: RequestWithId, response: Response, next: NextFunction) => {
    const requestId = String(request.headers["x-request-id"] ?? randomUUID()).slice(0, 100);
    const forwardedProto = request.headers["x-forwarded-proto"];
    const isSecureRequest =
      request.secure ||
      (typeof forwardedProto === "string" && forwardedProto.split(",")[0]?.trim() === "https");
    request.requestId = requestId;
    response.setHeader("X-Request-Id", requestId);
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("X-Frame-Options", "DENY");
    response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; form-action 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self' http://localhost:3000 http://localhost:5173",
    );
    response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    if (request.path.startsWith(API_PREFIX)) {
      response.setHeader("Cache-Control", "no-store");
    }
    if (isSecureRequest) {
      response.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    if (secureTransportRequired && request.path.startsWith(API_PREFIX) && !isSecureRequest) {
      response.status(426).json({
        code: 426,
        data: null,
        message: "管理接口必须通过 HTTPS 或受信任的 TLS 反向代理访问",
        requestId,
      });
      return;
    }
    if (
      request.path.startsWith(API_PREFIX) &&
      isStateChangingMethod(request.method) &&
      !isTrustedRequestOrigin(request, allowedOrigins)
    ) {
      response.status(403).json({
        code: 403,
        data: null,
        message: "请求来源校验失败",
        requestId,
      });
      return;
    }
    next();
  });
  app.useBodyParser("json", { limit: "1mb" });
  app.useBodyParser("urlencoded", { limit: "1mb", parameterLimit: 100 });

  app.enableCors({
    credentials: true,
    origin: allowedOrigins,
  });
  app.setGlobalPrefix(API_PREFIX.slice(1));
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      transformerPackage: classTransformer,
      transform: true,
      validatorPackage: classValidator,
      whitelist: true,
    }),
  );

  const frontendDist =
    process.env.FRONTEND_DIST?.trim() || fileURLToPath(new URL("./public", import.meta.url));
  const frontendIndex = join(frontendDist, "index.html");

  if (existsSync(frontendIndex)) {
    console.log(`Admin X web assets are served from ${frontendDist}`);
    app.useStaticAssets(frontendDist, { index: false });
    app.use((request: Request, response: Response, next: NextFunction) => {
      const acceptsHtml = request.headers.accept?.includes("text/html") ?? false;

      if (request.method !== "GET" || request.path.startsWith(API_PREFIX) || !acceptsHtml) {
        next();
        return;
      }

      response.type("html").send(readFileSync(frontendIndex, "utf8"));
    });
  } else {
    console.log(`Admin X web assets were not found at ${frontendDist}`);
  }

  const port = Number(process.env.PORT?.trim() || 3000);
  await app.listen(port);
  console.log(`Admin X API is running at http://localhost:${port}${API_PREFIX}`);
}

void bootstrap();

function isStateChangingMethod(method: string): boolean {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase());
}

function isTrustedRequestOrigin(request: Request, allowedOrigins: string[]): boolean {
  const origin = getHeaderValue(request.headers.origin);
  const referer = getHeaderValue(request.headers.referer);
  if (!origin && !referer) {
    return Boolean(getHeaderValue(request.headers.authorization));
  }
  if (origin && !isAllowedOrigin(origin, allowedOrigins)) {
    return false;
  }
  if (referer && !isAllowedOrigin(referer, allowedOrigins)) {
    return false;
  }
  return true;
}

function isAllowedOrigin(value: string, allowedOrigins: string[]): boolean {
  try {
    const candidate = new URL(value).origin;
    return allowedOrigins.some((allowedOrigin) => new URL(allowedOrigin).origin === candidate);
  } catch {
    return false;
  }
}

function getHeaderValue(value: string | string[] | undefined): string | undefined {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate?.trim() || undefined;
}

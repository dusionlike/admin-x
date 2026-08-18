import "./env.js";

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import "reflect-metadata";

import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { NextFunction, Request, Response } from "express";
import * as classTransformer from "class-transformer";
import * as classValidator from "class-validator";

import { API_PREFIX } from "@admin-x/shared";

import { AppModule } from "./app.module.js";

if (!process.env.DATABASE_PATH?.trim()) {
  process.env.DATABASE_PATH = fileURLToPath(new URL("../data/admin-x.sqlite", import.meta.url));
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  app.useBodyParser("json", { limit: "1mb" });
  app.useBodyParser("urlencoded", { limit: "1mb" });
  const allowedOrigins = (process.env.FRONTEND_ORIGIN ?? "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    credentials: true,
    origin: allowedOrigins,
  });
  app.setGlobalPrefix(API_PREFIX.slice(1));
  app.useGlobalPipes(
    new ValidationPipe({
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

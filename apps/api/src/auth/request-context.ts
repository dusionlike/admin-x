import { randomUUID } from "node:crypto";
import type { Request } from "express";

import type { AuditContext } from "../database/database.service.js";

export type RequestWithId = Request & { requestId?: string };

export function getAuditContext(request: RequestWithId): AuditContext {
  return {
    ipAddress: (request.ip || request.socket.remoteAddress || "unknown").slice(0, 100),
    requestId: request.requestId ?? randomUUID(),
    userAgent: String(request.headers["user-agent"] ?? "").slice(0, 500),
  };
}

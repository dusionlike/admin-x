import { ForbiddenException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { meetsSecurityLevel, type AuthUser } from "@admin-x/shared";

import { AuthService } from "./auth.service.js";
import { DatabaseService } from "../database/database.service.js";
import { getAuditContext, type RequestWithId } from "./request-context.js";
import { assertRequestIntegrity } from "../security/request-integrity.js";

export type AuthenticatedRequest = RequestWithId & {
  integrityChecked?: boolean;
  user: AuthUser;
  sessionId?: string;
};

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    const token = authorization?.replace(/^Bearer\s+/i, "");
    if (!token) {
      this.recordFailure(request, "未提供访问令牌");
      throw new UnauthorizedException("请先登录");
    }

    try {
      request.user = this.authService.authenticate(token, getAuditContext(request));
      request.sessionId = readSessionId(token);
      if (isStateChangingMethod(request.method) && !request.integrityChecked) {
        assertRequestIntegrity(request, token, request.sessionId, (sessionId, nonce, expiresAt) =>
          this.database.consumeRequestNonce(sessionId, nonce, expiresAt),
        );
        request.integrityChecked = true;
      }
      this.assertResourceSecurityLevel(request);
    } catch (error) {
      if (!(error instanceof ForbiddenException)) {
        this.recordFailure(request, "访问令牌校验失败");
      }
      throw error;
    }
    return true;
  }

  private recordFailure(request: AuthenticatedRequest, reason: string): void {
    this.database.addActivity({
      action: "auth.token.failure",
      actorName: "未认证请求",
      context: getAuditContext(request),
      description: `${reason}，访问资源 ${request.path}`,
      result: "blocked",
      title: "访问令牌校验失败",
      type: "login",
      resource: request.path,
    });
  }

  private assertResourceSecurityLevel(request: AuthenticatedRequest): void {
    const resource = resourceForPath(request.path);
    const required = this.database.getResourceSecurityLevel(resource);
    if (meetsSecurityLevel(request.user.securityLevel, required)) {
      return;
    }
    this.database.addActivity({
      action: "authorization.security-label.denied",
      actor: {
        displayName: request.user.displayName,
        id: request.user.id,
        role: request.user.role,
        username: request.user.username,
      },
      context: getAuditContext(request),
      description: `${request.user.displayName}（@${request.user.username}）的安全级别不足以访问 ${resource}`,
      result: "blocked",
      title: "安全标记访问控制失败",
      type: "system",
      resource,
    });
    throw new ForbiddenException("当前用户安全级别不足以访问此资源");
  }
}

function resourceForPath(path: string): string {
  const normalized = path.replace(/^\/api(?=\/|$)/u, "");
  if (normalized.startsWith("/security")) return "security";
  if (normalized.startsWith("/audit")) return "audit";
  if (normalized.startsWith("/compliance")) return "compliance";
  if (normalized.startsWith("/users")) return "user-directory";
  if (normalized.startsWith("/auth")) return "auth";
  if (normalized.startsWith("/dashboard") || normalized.startsWith("/analytics")) {
    return "dashboard";
  }
  return "dashboard";
}

function isStateChangingMethod(method: string): boolean {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase());
}

function readSessionId(token: string): string | undefined {
  const payload = token.split(".")[1];
  if (!payload) {
    return undefined;
  }
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      jti?: unknown;
    };
    return typeof decoded.jti === "string" ? decoded.jti : undefined;
  } catch {
    return undefined;
  }
}

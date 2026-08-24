import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import type { AuthUser } from "@admin-x/shared";

import { AuthService } from "./auth.service.js";
import { DatabaseService } from "../database/database.service.js";
import { getAuditContext, type RequestWithId } from "./request-context.js";

export type AuthenticatedRequest = RequestWithId & { user: AuthUser };

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
    } catch (error) {
      this.recordFailure(request, "访问令牌校验失败");
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
}

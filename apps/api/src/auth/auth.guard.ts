import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import type { AuthUser } from "@admin-x/shared";

import { AuthService } from "./auth.service.js";
import { getAuditContext, type RequestWithId } from "./request-context.js";

export type AuthenticatedRequest = RequestWithId & { user: AuthUser };

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    const token = authorization?.replace(/^Bearer\s+/i, "");
    if (!token) {
      throw new UnauthorizedException("请先登录");
    }

    request.user = this.authService.authenticate(token, getAuditContext(request));
    return true;
  }
}

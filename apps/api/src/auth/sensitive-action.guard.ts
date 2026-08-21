import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";

import { DatabaseService } from "../database/database.service.js";
import { UsersService } from "../users/users.service.js";
import type { AuthenticatedRequest } from "./auth.guard.js";
import { REAUTHENTICATION_HEADER, verifyReauthenticationToken } from "./reauth.js";
import { getAuditContext } from "./request-context.js";

@Injectable()
export class SensitiveActionGuard implements CanActivate {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(UsersService) private readonly usersService: UsersService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user) {
      throw new UnauthorizedException("请先登录");
    }

    if (!this.database.getSecurityPolicy().sensitiveActionReauth) {
      return true;
    }

    const rawToken = request.headers[REAUTHENTICATION_HEADER];
    const token = Array.isArray(rawToken) ? rawToken[0] : rawToken;
    const sessionVersion = this.usersService.findAuthenticatedUser(request.user.id)?.sessionVersion;
    if (
      !token ||
      sessionVersion === undefined ||
      !verifyReauthenticationToken(token, request.user.id, sessionVersion)
    ) {
      this.database.addActivity({
        action: "authorization.reauth.blocked",
        actor: {
          displayName: request.user.displayName,
          id: request.user.id,
          role: request.user.role,
          username: request.user.username,
        },
        context: getAuditContext(request),
        description: `${request.user.displayName}（@${request.user.username}）尝试执行需要二次验证的敏感操作 ${request.path}`,
        result: "blocked",
        title: "敏感操作需要二次验证",
        type: "system",
        resource: request.path,
      });
      throw new HttpException("敏感操作需要先验证当前密码", HttpStatus.PRECONDITION_REQUIRED);
    }
    return true;
  }
}

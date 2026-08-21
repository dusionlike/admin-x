import { ForbiddenException, Inject, Injectable, SetMetadata } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import type { Permission } from "@admin-x/shared";
import { hasPermission } from "@admin-x/shared";

import { DatabaseService } from "../database/database.service.js";
import type { AuthenticatedRequest } from "./auth.guard.js";
import { getAuditContext } from "./request-context.js";

export const REQUIRED_PERMISSIONS = Symbol("ADMIN_X_REQUIRED_PERMISSIONS");

export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(REQUIRED_PERMISSIONS, permissions);

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[]>(REQUIRED_PERMISSIONS, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const role = request.user?.role;
    if (
      !role ||
      !required.every(
        (permission) =>
          hasPermission(role, permission) ||
          (permission === "role:assign" && this.canBootstrapRoleAssignment(role)),
      )
    ) {
      if (request.user) {
        this.database.addActivity({
          action: "authorization.denied",
          actor: {
            displayName: request.user.displayName,
            id: request.user.id,
            role: request.user.role,
            username: request.user.username,
          },
          context: getAuditContext(request),
          description: `${request.user.displayName}（@${request.user.username}）尝试访问未授权资源 ${request.path}`,
          result: "failure",
          title: "权限校验失败",
          type: "system",
          resource: request.path,
        });
      }
      throw new ForbiddenException("当前角色没有执行此操作的权限");
    }
    return true;
  }

  private canBootstrapRoleAssignment(role: AuthenticatedRequest["user"]["role"]): boolean {
    if (role !== "system-admin") {
      return false;
    }
    const row = this.database.connection
      .prepare(
        "SELECT COUNT(*) AS count FROM users WHERE role = 'security-admin' AND status = 'active'",
      )
      .get() as { count?: number | bigint } | undefined;
    return Number(row?.count ?? 0) === 0;
  }
}

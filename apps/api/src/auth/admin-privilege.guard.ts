import { ForbiddenException, Injectable } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";

import { isAdministratorRole } from "@admin-x/shared";

import type { AuthenticatedRequest } from "./auth.guard.js";

@Injectable()
export class AdminPrivilegeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const role = request.user?.role;
    if (!role || !isAdministratorRole(role)) {
      throw new ForbiddenException("只有管理员可以执行此操作");
    }
    return true;
  }
}

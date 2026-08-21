import { Global, Module } from "@nestjs/common";

import { UsersModule } from "../users/users.module.js";
import { AuthController } from "./auth.controller.js";
import { AuthGuard } from "./auth.guard.js";
import { AdminPrivilegeGuard } from "./admin-privilege.guard.js";
import { PermissionGuard } from "./permission.guard.js";
import { SensitiveActionGuard } from "./sensitive-action.guard.js";
import { AuthService } from "./auth.service.js";

@Global()
@Module({
  controllers: [AuthController],
  imports: [UsersModule],
  providers: [AdminPrivilegeGuard, AuthGuard, AuthService, PermissionGuard, SensitiveActionGuard],
  exports: [AdminPrivilegeGuard, AuthGuard, AuthService, PermissionGuard, SensitiveActionGuard],
})
export class AuthModule {}

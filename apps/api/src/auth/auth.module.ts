import { Global, Module } from "@nestjs/common";

import { UsersModule } from "../users/users.module.js";
import { AuthController } from "./auth.controller.js";
import { AuthGuard } from "./auth.guard.js";
import { AdminPrivilegeGuard } from "./admin-privilege.guard.js";
import { PermissionGuard } from "./permission.guard.js";
import { AuthService } from "./auth.service.js";

@Global()
@Module({
  controllers: [AuthController],
  imports: [UsersModule],
  providers: [AdminPrivilegeGuard, AuthGuard, AuthService, PermissionGuard],
  exports: [AdminPrivilegeGuard, AuthGuard, AuthService, PermissionGuard],
})
export class AuthModule {}

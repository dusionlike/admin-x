import { Global, Module } from "@nestjs/common";

import { UsersModule } from "../users/users.module.js";
import { AuthController } from "./auth.controller.js";
import { AuthGuard } from "./auth.guard.js";
import { AdminPrivilegeGuard } from "./admin-privilege.guard.js";
import { AuthService } from "./auth.service.js";

@Global()
@Module({
  controllers: [AuthController],
  imports: [UsersModule],
  providers: [AdminPrivilegeGuard, AuthGuard, AuthService],
  exports: [AdminPrivilegeGuard, AuthGuard, AuthService],
})
export class AuthModule {}

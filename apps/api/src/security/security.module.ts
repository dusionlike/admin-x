import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { UsersModule } from "../users/users.module.js";
import { SecurityController } from "./security.controller.js";
import { SecurityService } from "./security.service.js";

@Module({
  controllers: [SecurityController],
  imports: [AuthModule, DatabaseModule, UsersModule],
  providers: [SecurityService],
})
export class SecurityModule {}

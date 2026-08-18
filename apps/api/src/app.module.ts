import { Module } from "@nestjs/common";

import { AuthModule } from "./auth/auth.module.js";
import { AuditModule } from "./audit/audit.module.js";
import { DatabaseModule } from "./database/database.module.js";
import { DashboardModule } from "./dashboard/dashboard.module.js";
import { UsersModule } from "./users/users.module.js";

@Module({
  imports: [DatabaseModule, AuthModule, AuditModule, DashboardModule, UsersModule],
})
export class AppModule {}

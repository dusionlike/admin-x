import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";

import { AuthModule } from "./auth/auth.module.js";
import { AuditModule } from "./audit/audit.module.js";
import { RequestAuditInterceptor } from "./audit/request-audit.interceptor.js";
import { DatabaseModule } from "./database/database.module.js";
import { DashboardModule } from "./dashboard/dashboard.module.js";
import { ComplianceModule } from "./compliance/compliance.module.js";
import { SecurityModule } from "./security/security.module.js";
import { UsersModule } from "./users/users.module.js";

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    AuditModule,
    DashboardModule,
    ComplianceModule,
    SecurityModule,
    UsersModule,
  ],
  providers: [{ provide: APP_INTERCEPTOR, useClass: RequestAuditInterceptor }],
})
export class AppModule {}

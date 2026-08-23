import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { UsersModule } from "../users/users.module.js";
import { ComplianceController } from "./compliance.controller.js";
import { HealthController } from "./health.controller.js";
import { ComplianceService } from "./compliance.service.js";

@Module({
  controllers: [ComplianceController, HealthController],
  imports: [AuthModule, DatabaseModule, UsersModule],
  providers: [ComplianceService],
})
export class ComplianceModule {}

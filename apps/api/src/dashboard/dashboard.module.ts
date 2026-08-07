import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { UsersModule } from "../users/users.module.js";
import { DashboardController } from "./dashboard.controller.js";
import { DashboardService } from "./dashboard.service.js";

@Module({
  controllers: [DashboardController],
  imports: [AuthModule, DatabaseModule, UsersModule],
  providers: [DashboardService],
})
export class DashboardModule {}

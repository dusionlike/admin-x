import { Controller, Get, Inject, ServiceUnavailableException } from "@nestjs/common";

import { DatabaseService } from "../database/database.service.js";

@Controller()
export class HealthController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  @Get("health")
  health() {
    return {
      data: { database: this.database.isHealthy(), status: "ok" },
      message: "success",
      code: 0,
      instanceId: process.env.INSTANCE_ID || "admin-x-single-node",
    };
  }

  @Get("ready")
  ready() {
    if (!this.database.isHealthy()) {
      throw new ServiceUnavailableException("数据库尚未就绪");
    }
    return {
      data: {
        database: true,
        highAvailability: process.env.HA_ENABLED === "true",
        status: "ready",
      },
      message: "success",
      code: 0,
      instanceId: process.env.INSTANCE_ID || "admin-x-single-node",
    };
  }
}

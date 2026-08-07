import { Controller, Get, Inject, UseGuards } from "@nestjs/common";

import type { ApiResponse, DashboardOverview } from "@admin-x/shared";
import { createApiResponse } from "@admin-x/shared";

import { AuthGuard } from "../auth/auth.guard.js";
import { DashboardService } from "./dashboard.service.js";

@Controller("dashboard")
@UseGuards(AuthGuard)
export class DashboardController {
  constructor(@Inject(DashboardService) private readonly dashboardService: DashboardService) {}

  @Get("overview")
  overview(): ApiResponse<DashboardOverview> {
    return createApiResponse(this.dashboardService.getOverview());
  }
}

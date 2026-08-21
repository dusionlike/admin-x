import { Controller, Get, Inject, Request, UseGuards } from "@nestjs/common";

import type { AnalyticsOverview, ApiResponse, DashboardOverview } from "@admin-x/shared";
import { createApiResponse } from "@admin-x/shared";

import { AuthGuard } from "../auth/auth.guard.js";
import type { AuthenticatedRequest } from "../auth/auth.guard.js";
import { PermissionGuard, RequirePermissions } from "../auth/permission.guard.js";
import { DashboardService } from "./dashboard.service.js";

@Controller("dashboard")
@UseGuards(AuthGuard, PermissionGuard)
export class DashboardController {
  constructor(@Inject(DashboardService) private readonly dashboardService: DashboardService) {}

  @Get("overview")
  @RequirePermissions("dashboard:view")
  overview(@Request() request: AuthenticatedRequest): ApiResponse<DashboardOverview> {
    return createApiResponse(this.dashboardService.getOverview(request.user));
  }

  @Get("analytics")
  @RequirePermissions("analytics:view")
  analytics(@Request() request: AuthenticatedRequest): ApiResponse<AnalyticsOverview> {
    return createApiResponse(this.dashboardService.getAnalytics(request.user));
  }
}

import { Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";

import type { ApiResponse, AuditListQuery, AuditRecord, PageResult } from "@admin-x/shared";
import { createApiResponse } from "@admin-x/shared";

import { AuthGuard } from "../auth/auth.guard.js";
import { PermissionGuard, RequirePermissions } from "../auth/permission.guard.js";
import { AuditService } from "./audit.service.js";

@Controller("audit")
@UseGuards(AuthGuard, PermissionGuard)
@RequirePermissions("audit:read")
export class AuditController {
  constructor(@Inject(AuditService) private readonly auditService: AuditService) {}

  @Get()
  list(@Query() query: AuditListQuery): ApiResponse<PageResult<AuditRecord>> {
    return createApiResponse(this.auditService.list(query));
  }
}

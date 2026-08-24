import { Controller, Get, Header, Inject, Query, Request, UseGuards } from "@nestjs/common";

import type { ApiResponse, AuditRecord, AuthUser, PageResult } from "@admin-x/shared";
import { createApiResponse } from "@admin-x/shared";

import { AuthGuard } from "../auth/auth.guard.js";
import type { AuthenticatedRequest } from "../auth/auth.guard.js";
import { PermissionGuard, RequirePermissions } from "../auth/permission.guard.js";
import { getAuditContext } from "../auth/request-context.js";
import { AuditListQueryDto } from "./audit.dto.js";
import { AuditService } from "./audit.service.js";
import { DtoValidationPipe } from "../validation/dto-validation.pipe.js";

@Controller("audit")
@UseGuards(AuthGuard, PermissionGuard)
@RequirePermissions("audit:read")
export class AuditController {
  constructor(@Inject(AuditService) private readonly auditService: AuditService) {}

  @Get()
  list(
    @Query(new DtoValidationPipe(AuditListQueryDto)) query: AuditListQueryDto,
  ): ApiResponse<PageResult<AuditRecord>> {
    return createApiResponse(this.auditService.list(query));
  }

  @Get("export")
  @RequirePermissions("audit:export")
  @Header("Content-Type", "text/csv; charset=utf-8")
  @Header("Content-Disposition", "attachment; filename=admin-x-audit.csv")
  export(
    @Query(new DtoValidationPipe(AuditListQueryDto)) query: AuditListQueryDto,
    @Request() request: AuthenticatedRequest,
  ): string {
    return this.auditService.export(query, request.user as AuthUser, getAuditContext(request));
  }
}

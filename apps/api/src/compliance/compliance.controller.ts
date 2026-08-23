import { Body, Controller, Get, Inject, Param, Post, Request, UseGuards } from "@nestjs/common";

import type {
  ApiResponse,
  AuthUser,
  BackupRecord,
  BackupVerification,
  ComplianceOverview,
  VulnerabilityScanRecord,
} from "@admin-x/shared";
import { createApiResponse } from "@admin-x/shared";

import { AuthGuard } from "../auth/auth.guard.js";
import type { AuthenticatedRequest } from "../auth/auth.guard.js";
import { PermissionGuard, RequirePermissions } from "../auth/permission.guard.js";
import { getAuditContext } from "../auth/request-context.js";
import { SensitiveActionGuard } from "../auth/sensitive-action.guard.js";
import { ComplianceService } from "./compliance.service.js";
import { CreateBackupDto, CreateVulnerabilityScanDto } from "./compliance.dto.js";

@Controller("compliance")
@UseGuards(AuthGuard, PermissionGuard)
@RequirePermissions("compliance:read")
export class ComplianceController {
  constructor(@Inject(ComplianceService) private readonly complianceService: ComplianceService) {}

  @Get("overview")
  overview(): ApiResponse<ComplianceOverview> {
    return createApiResponse(this.complianceService.getOverview());
  }

  @Get("backups")
  backups(): ApiResponse<BackupRecord[]> {
    return createApiResponse(this.complianceService.listBackups());
  }

  @Post("backups")
  @UseGuards(AuthGuard, PermissionGuard, SensitiveActionGuard)
  @RequirePermissions("backup:manage")
  async createBackup(
    @Body() body: CreateBackupDto,
    @Request() request: AuthenticatedRequest,
  ): Promise<ApiResponse<BackupRecord>> {
    return createApiResponse(
      await this.complianceService.createBackup(
        body.target,
        request.user as AuthUser,
        getAuditContext(request),
      ),
    );
  }

  @Post("backups/:id/verify")
  @UseGuards(AuthGuard, PermissionGuard, SensitiveActionGuard)
  @RequirePermissions("backup:manage")
  async verifyBackup(
    @Param("id") id: string,
    @Request() request: AuthenticatedRequest,
  ): Promise<ApiResponse<BackupVerification>> {
    return createApiResponse(
      await this.complianceService.verifyBackup(id, request.user, getAuditContext(request)),
    );
  }

  @Get("vulnerability-scans")
  scans(): ApiResponse<VulnerabilityScanRecord[]> {
    return createApiResponse(this.complianceService.listVulnerabilityScans());
  }

  @Post("vulnerability-scans")
  @UseGuards(AuthGuard, PermissionGuard, SensitiveActionGuard)
  @RequirePermissions("compliance:manage")
  scan(
    @Body() body: CreateVulnerabilityScanDto,
    @Request() request: AuthenticatedRequest,
  ): ApiResponse<VulnerabilityScanRecord> {
    return createApiResponse(
      this.complianceService.runVulnerabilityScan(body, request.user, getAuditContext(request)),
    );
  }
}

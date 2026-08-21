import { Body, Controller, Get, Inject, Patch, Request, UseGuards } from "@nestjs/common";

import type { ApiResponse, SecurityPolicy } from "@admin-x/shared";
import { createApiResponse } from "@admin-x/shared";

import { AuthGuard } from "../auth/auth.guard.js";
import type { AuthenticatedRequest } from "../auth/auth.guard.js";
import { PermissionGuard, RequirePermissions } from "../auth/permission.guard.js";
import { getAuditContext } from "../auth/request-context.js";
import { SensitiveActionGuard } from "../auth/sensitive-action.guard.js";
import { UpdateSecurityPolicyDto } from "./security.dto.js";
import { SecurityService } from "./security.service.js";

@Controller("security")
@UseGuards(AuthGuard, PermissionGuard)
@RequirePermissions("security:manage")
export class SecurityController {
  constructor(@Inject(SecurityService) private readonly securityService: SecurityService) {}

  @Get("policy")
  policy(): ApiResponse<SecurityPolicy> {
    return createApiResponse(this.securityService.getPolicy());
  }

  @Patch("policy")
  @UseGuards(AuthGuard, PermissionGuard, SensitiveActionGuard)
  updatePolicy(
    @Body() body: UpdateSecurityPolicyDto,
    @Request() request: AuthenticatedRequest,
  ): ApiResponse<SecurityPolicy> {
    return createApiResponse(
      this.securityService.updatePolicy(body, request.user, getAuditContext(request)),
    );
  }
}

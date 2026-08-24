import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from "@nestjs/common";

import type {
  ApiResponse,
  EmailMfaPolicyStatus,
  EmailMfaSettings,
  IntegrityInspection,
  ResourceSecurityLabel,
  SecurityPolicy,
} from "@admin-x/shared";
import { createApiResponse } from "@admin-x/shared";

import { AuthGuard } from "../auth/auth.guard.js";
import type { AuthenticatedRequest } from "../auth/auth.guard.js";
import { PermissionGuard, RequirePermissions } from "../auth/permission.guard.js";
import { getAuditContext } from "../auth/request-context.js";
import { SensitiveActionGuard } from "../auth/sensitive-action.guard.js";
import {
  UpdateEmailMfaPolicyDto,
  UpdateEmailMfaTransportDto,
  UpdateResourceSecurityLabelDto,
  UpdateSecurityPolicyDto,
} from "./security.dto.js";
import { SecurityService } from "./security.service.js";
import { DtoValidationPipe } from "../validation/dto-validation.pipe.js";

@Controller("security")
@UseGuards(AuthGuard, PermissionGuard)
@RequirePermissions("security:manage")
export class SecurityController {
  constructor(@Inject(SecurityService) private readonly securityService: SecurityService) {}

  @Get("resource-labels")
  resourceLabels(): ApiResponse<ResourceSecurityLabel[]> {
    return createApiResponse(this.securityService.listResourceSecurityLabels());
  }

  @Get("integrity")
  integrity(): ApiResponse<IntegrityInspection> {
    return createApiResponse(this.securityService.inspectIntegrity());
  }

  @Patch("resource-labels/:resource")
  @UseGuards(AuthGuard, PermissionGuard, SensitiveActionGuard)
  updateResourceLabel(
    @Param("resource") resource: string,
    @Body(new DtoValidationPipe(UpdateResourceSecurityLabelDto))
    body: UpdateResourceSecurityLabelDto,
    @Request() request: AuthenticatedRequest,
  ): ApiResponse<ResourceSecurityLabel> {
    return createApiResponse(
      this.securityService.updateResourceSecurityLabel(
        resource,
        body.label,
        request.user,
        getAuditContext(request),
      ),
    );
  }

  @Get("policy")
  policy(): ApiResponse<SecurityPolicy> {
    return createApiResponse(this.securityService.getPolicy());
  }

  @Patch("policy")
  @UseGuards(AuthGuard, PermissionGuard, SensitiveActionGuard)
  updatePolicy(
    @Body(new DtoValidationPipe(UpdateSecurityPolicyDto)) body: UpdateSecurityPolicyDto,
    @Request() request: AuthenticatedRequest,
  ): ApiResponse<SecurityPolicy> {
    return createApiResponse(
      this.securityService.updatePolicy(body, request.user, getAuditContext(request)),
    );
  }

  @Get("email-mfa")
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermissions("system:manage")
  emailMfaSettings(): ApiResponse<EmailMfaSettings> {
    return createApiResponse(this.securityService.getEmailMfaSettings());
  }

  @Patch("email-mfa/transport")
  @UseGuards(AuthGuard, PermissionGuard, SensitiveActionGuard)
  @RequirePermissions("system:manage")
  async updateEmailMfaTransport(
    @Body(new DtoValidationPipe(UpdateEmailMfaTransportDto))
    body: UpdateEmailMfaTransportDto,
    @Request() request: AuthenticatedRequest,
  ): Promise<ApiResponse<EmailMfaSettings>> {
    return createApiResponse(
      await this.securityService.updateEmailMfaTransport(
        body,
        request.user,
        getAuditContext(request),
      ),
    );
  }

  @Post("email-mfa/test")
  @UseGuards(AuthGuard, PermissionGuard, SensitiveActionGuard)
  @RequirePermissions("system:manage")
  async testEmailMfa(
    @Request() request: AuthenticatedRequest,
  ): Promise<ApiResponse<{ maskedEmail: string }>> {
    return createApiResponse(
      await this.securityService.testEmailMfa(request.user, getAuditContext(request)),
    );
  }

  @Get("email-mfa/policy")
  emailMfaPolicy(): ApiResponse<EmailMfaPolicyStatus> {
    return createApiResponse(this.securityService.getEmailMfaPolicy());
  }

  @Patch("email-mfa/policy")
  @UseGuards(AuthGuard, PermissionGuard, SensitiveActionGuard)
  @RequirePermissions("security:manage")
  async updateEmailMfaPolicy(
    @Body(new DtoValidationPipe(UpdateEmailMfaPolicyDto)) body: UpdateEmailMfaPolicyDto,
    @Request() request: AuthenticatedRequest,
  ): Promise<ApiResponse<EmailMfaPolicyStatus>> {
    return createApiResponse(
      await this.securityService.updateEmailMfaPolicy(
        body.enabled,
        request.user,
        getAuditContext(request),
      ),
    );
  }
}

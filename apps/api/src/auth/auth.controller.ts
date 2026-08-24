import { Body, Controller, Get, Inject, Post, Request, UseGuards } from "@nestjs/common";

import type {
  ApiResponse,
  AuthUser,
  EmailMfaCodeResponse,
  LoginResponse,
  MfaPublicConfig,
  MfaSetupResponse,
  MfaStatus,
  ReauthenticationResponse,
  SetupStatus,
} from "@admin-x/shared";
import { createApiResponse } from "@admin-x/shared";

import { AuthGuard } from "./auth.guard.js";
import type { AuthenticatedRequest } from "./auth.guard.js";
import {
  ChangeExpiredPasswordDto,
  LoginDto,
  EmailMfaCodeRequestDto,
  MfaCodeDto,
  MfaDisableDto,
  MfaSetupDto,
  ReauthenticationDto,
  SetupAdminDto,
} from "./auth.dto.js";
import { AuthService } from "./auth.service.js";
import { getAuditContext } from "./request-context.js";
import { DtoValidationPipe } from "../validation/dto-validation.pipe.js";

@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Post("login")
  login(
    @Body(new DtoValidationPipe(LoginDto)) body: LoginDto,
    @Request() request: AuthenticatedRequest,
  ): ApiResponse<LoginResponse> {
    return createApiResponse(this.authService.login(body, getAuditContext(request)));
  }

  @Get("setup-status")
  setupStatus(): ApiResponse<SetupStatus> {
    return createApiResponse(this.authService.getSetupStatus());
  }

  @Post("setup")
  setup(
    @Body(new DtoValidationPipe(SetupAdminDto)) body: SetupAdminDto,
    @Request() request: AuthenticatedRequest,
  ): ApiResponse<LoginResponse> {
    return createApiResponse(this.authService.setupAdmin(body, getAuditContext(request)));
  }

  @Get("mfa/config")
  mfaConfig(): ApiResponse<MfaPublicConfig> {
    return createApiResponse(this.authService.getMfaPublicConfig());
  }

  @Post("mfa/email/request")
  async requestEmailMfaCode(
    @Body(new DtoValidationPipe(EmailMfaCodeRequestDto)) body: EmailMfaCodeRequestDto,
    @Request() request: AuthenticatedRequest,
  ): Promise<ApiResponse<EmailMfaCodeResponse>> {
    return createApiResponse(
      await this.authService.requestEmailMfaCode(
        body.username,
        body.password,
        getAuditContext(request),
      ),
    );
  }

  @Post("password/expired")
  changeExpiredPassword(
    @Body(new DtoValidationPipe(ChangeExpiredPasswordDto)) body: ChangeExpiredPasswordDto,
    @Request() request: AuthenticatedRequest,
  ): ApiResponse<null> {
    return createApiResponse(
      this.authService.changeExpiredPassword(body, getAuditContext(request)),
    );
  }

  @Get("me")
  @UseGuards(AuthGuard)
  me(@Request() request: AuthenticatedRequest): ApiResponse<AuthUser> {
    return createApiResponse(request.user);
  }

  @Post("logout")
  @UseGuards(AuthGuard)
  logout(@Request() request: AuthenticatedRequest): ApiResponse<null> {
    return createApiResponse(this.authService.logout(request.user, getAuditContext(request)));
  }

  @Post("reauth")
  @UseGuards(AuthGuard)
  reauthenticate(
    @Body(new DtoValidationPipe(ReauthenticationDto)) body: ReauthenticationDto,
    @Request() request: AuthenticatedRequest,
  ): ApiResponse<ReauthenticationResponse> {
    return createApiResponse(
      this.authService.reauthenticate(
        request.user.id,
        body.currentPassword,
        getAuditContext(request),
      ),
    );
  }

  @Get("mfa/status")
  @UseGuards(AuthGuard)
  mfaStatus(@Request() request: AuthenticatedRequest): ApiResponse<MfaStatus> {
    return createApiResponse(this.authService.getMfaStatus(request.user.id));
  }

  @Post("mfa/setup")
  @UseGuards(AuthGuard)
  setupMfa(
    @Body(new DtoValidationPipe(MfaSetupDto)) body: MfaSetupDto,
    @Request() request: AuthenticatedRequest,
  ): ApiResponse<MfaSetupResponse> {
    return createApiResponse(
      this.authService.setupMfa(request.user.id, body.currentPassword, getAuditContext(request)),
    );
  }

  @Post("mfa/enable")
  @UseGuards(AuthGuard)
  enableMfa(
    @Body(new DtoValidationPipe(MfaCodeDto)) body: MfaCodeDto,
    @Request() request: AuthenticatedRequest,
  ): ApiResponse<MfaStatus> {
    return createApiResponse(
      this.authService.enableMfa(request.user.id, body.code, getAuditContext(request)),
    );
  }

  @Post("mfa/disable")
  @UseGuards(AuthGuard)
  disableMfa(
    @Body(new DtoValidationPipe(MfaDisableDto)) body: MfaDisableDto,
    @Request() request: AuthenticatedRequest,
  ): ApiResponse<MfaStatus> {
    return createApiResponse(
      this.authService.disableMfa(
        request.user.id,
        body.currentPassword,
        body.code,
        getAuditContext(request),
      ),
    );
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Request,
  UseGuards,
} from "@nestjs/common";

import type {
  ApiResponse,
  AuthSession,
  AuthUser,
  EmailMfaCodeResponse,
  LoginCaptchaResponse,
  LoginResponse,
  MfaPublicConfig,
  ReauthenticationResponse,
  SetupStatus,
} from "@admin-x/shared";
import { createApiResponse } from "@admin-x/shared";

import { AuthGuard } from "./auth.guard.js";
import type { AuthenticatedRequest } from "./auth.guard.js";
import { CaptchaService } from "./captcha.service.js";
import {
  ChangeExpiredPasswordDto,
  EmailMfaCodeRequestDto,
  LoginDto,
  ReauthenticationDto,
  SetupAdminDto,
} from "./auth.dto.js";
import { AuthService } from "./auth.service.js";
import { getAuditContext } from "./request-context.js";
import { DtoValidationPipe } from "../validation/dto-validation.pipe.js";

@Controller("auth")
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(CaptchaService) private readonly captchaService: CaptchaService,
  ) {}

  @Get("captcha")
  captcha(@Request() request: AuthenticatedRequest): ApiResponse<LoginCaptchaResponse> {
    return createApiResponse(this.captchaService.issue(getAuditContext(request)));
  }

  @Post("login")
  login(
    @Body(new DtoValidationPipe(LoginDto)) body: LoginDto,
    @Request() request: AuthenticatedRequest,
  ): ApiResponse<LoginResponse> {
    this.captchaService.assertValid(body.captchaId, body.captchaCode, getAuditContext(request));
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
    this.captchaService.assertValid(
      body.captchaId,
      body.captchaCode,
      getAuditContext(request),
      false,
    );
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

  @Get("sessions")
  @UseGuards(AuthGuard)
  sessions(@Request() request: AuthenticatedRequest): ApiResponse<AuthSession[]> {
    return createApiResponse(this.authService.listSessions(request.user.id, request.sessionId));
  }

  @Delete("sessions/:id")
  @UseGuards(AuthGuard)
  revokeSession(
    @Param("id", new ParseUUIDPipe()) sessionId: string,
    @Request() request: AuthenticatedRequest,
  ): ApiResponse<null> {
    return createApiResponse(
      this.authService.revokeSession(request.user, sessionId, getAuditContext(request)),
    );
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
}

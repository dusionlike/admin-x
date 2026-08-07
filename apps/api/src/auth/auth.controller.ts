import { Body, Controller, Get, Inject, Post, Request, UseGuards } from "@nestjs/common";

import type { ApiResponse, AuthUser, LoginResponse, SetupStatus } from "@admin-x/shared";
import { createApiResponse } from "@admin-x/shared";

import { AuthGuard } from "./auth.guard.js";
import type { AuthenticatedRequest } from "./auth.guard.js";
import { LoginDto, SetupAdminDto } from "./auth.dto.js";
import { AuthService } from "./auth.service.js";

@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Post("login")
  login(@Body() body: LoginDto): ApiResponse<LoginResponse> {
    return createApiResponse(this.authService.login(body));
  }

  @Get("setup-status")
  setupStatus(): ApiResponse<SetupStatus> {
    return createApiResponse(this.authService.getSetupStatus());
  }

  @Post("setup")
  setup(@Body() body: SetupAdminDto): ApiResponse<LoginResponse> {
    return createApiResponse(this.authService.setupAdmin(body));
  }

  @Get("me")
  @UseGuards(AuthGuard)
  me(@Request() request: AuthenticatedRequest): ApiResponse<AuthUser> {
    return createApiResponse(request.user);
  }
}

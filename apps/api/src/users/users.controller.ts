import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from "@nestjs/common";

import type {
  ApiResponse,
  AuthUser,
  CreateUserRequest,
  PageResult,
  PersonalDataExport,
  PasswordStatus,
  UserListQuery,
  UserRecord,
} from "@admin-x/shared";
import { createApiResponse } from "@admin-x/shared";

import { AuthGuard } from "../auth/auth.guard.js";
import type { AuthenticatedRequest } from "../auth/auth.guard.js";
import { PermissionGuard, RequirePermissions } from "../auth/permission.guard.js";
import { getAuditContext } from "../auth/request-context.js";
import { SensitiveActionGuard } from "../auth/sensitive-action.guard.js";
import {
  CreateUserDto,
  PrivacyEraseDto,
  ResetUserPasswordDto,
  UpdatePasswordDto,
  UpdateProfileDto,
  UpdateUserDataScopeDto,
  UpdateUserRoleDto,
  UpdateUserStatusDto,
} from "./users.dto.js";
import { UsersService } from "./users.service.js";

@Controller("users")
@UseGuards(AuthGuard)
export class UsersController {
  constructor(@Inject(UsersService) private readonly usersService: UsersService) {}

  @Get()
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermissions("user:read")
  list(@Query() query: UserListQuery): ApiResponse<PageResult<UserRecord>> {
    return createApiResponse(this.usersService.list(query));
  }

  @Post()
  @UseGuards(AuthGuard, PermissionGuard, SensitiveActionGuard)
  @RequirePermissions("user:create")
  create(
    @Body() body: CreateUserDto,
    @Request() request: AuthenticatedRequest,
  ): ApiResponse<UserRecord> {
    return createApiResponse(
      this.usersService.create(body as CreateUserRequest, request.user, getAuditContext(request)),
    );
  }

  @Patch("me")
  updateProfile(
    @Body() body: UpdateProfileDto,
    @Request() request: AuthenticatedRequest,
  ): ApiResponse<AuthUser> {
    return createApiResponse(
      this.usersService.updateProfile(request.user.id, body, getAuditContext(request)),
    );
  }

  @Get("me/privacy/export")
  exportPersonalData(@Request() request: AuthenticatedRequest): ApiResponse<PersonalDataExport> {
    return createApiResponse(this.usersService.exportPersonalData(request.user.id));
  }

  @Get("me/password-status")
  passwordStatus(@Request() request: AuthenticatedRequest): ApiResponse<PasswordStatus> {
    return createApiResponse(this.usersService.getPasswordStatus(request.user.id));
  }

  @Post("me/privacy/erase")
  @UseGuards(AuthGuard, SensitiveActionGuard)
  erasePersonalData(
    @Body() body: PrivacyEraseDto,
    @Request() request: AuthenticatedRequest,
  ): ApiResponse<null> {
    return createApiResponse(
      this.usersService.erasePersonalData(request.user.id, body, getAuditContext(request)),
    );
  }

  @Patch("me/password")
  updatePassword(
    @Body() body: UpdatePasswordDto,
    @Request() request: AuthenticatedRequest,
  ): ApiResponse<null> {
    return createApiResponse(
      this.usersService.updateCurrentPassword(request.user.id, body, getAuditContext(request)),
    );
  }

  @Patch(":id/password")
  @UseGuards(AuthGuard, PermissionGuard, SensitiveActionGuard)
  @RequirePermissions("user:status")
  resetPassword(
    @Param("id") id: string,
    @Body() body: ResetUserPasswordDto,
    @Request() request: AuthenticatedRequest,
  ): ApiResponse<null> {
    return createApiResponse(
      this.usersService.resetPassword(id, body, request.user, getAuditContext(request)),
    );
  }

  @Patch(":id/status")
  @UseGuards(AuthGuard, PermissionGuard, SensitiveActionGuard)
  @RequirePermissions("user:status")
  updateStatus(
    @Param("id") id: string,
    @Body() body: UpdateUserStatusDto,
    @Request() request: AuthenticatedRequest,
  ): ApiResponse<UserRecord> {
    return createApiResponse(
      this.usersService.updateStatus(id, body.status, request.user, getAuditContext(request)),
    );
  }

  @Patch(":id/unlock")
  @UseGuards(AuthGuard, PermissionGuard, SensitiveActionGuard)
  @RequirePermissions("user:status")
  unlock(
    @Param("id") id: string,
    @Request() request: AuthenticatedRequest,
  ): ApiResponse<UserRecord> {
    return createApiResponse(this.usersService.unlock(id, request.user, getAuditContext(request)));
  }

  @Patch(":id/role")
  @UseGuards(AuthGuard, PermissionGuard, SensitiveActionGuard)
  @RequirePermissions("role:assign")
  updateRole(
    @Param("id") id: string,
    @Body() body: UpdateUserRoleDto,
    @Request() request: AuthenticatedRequest,
  ): ApiResponse<UserRecord> {
    return createApiResponse(
      this.usersService.updateRole(id, body.role, request.user, getAuditContext(request)),
    );
  }

  @Patch(":id/data-scope")
  @UseGuards(AuthGuard, PermissionGuard, SensitiveActionGuard)
  @RequirePermissions("security:manage")
  updateDataScope(
    @Param("id") id: string,
    @Body() body: UpdateUserDataScopeDto,
    @Request() request: AuthenticatedRequest,
  ): ApiResponse<UserRecord> {
    return createApiResponse(
      this.usersService.updateDataScope(id, body, request.user, getAuditContext(request)),
    );
  }

  @Delete(":id")
  @UseGuards(AuthGuard, PermissionGuard, SensitiveActionGuard)
  @RequirePermissions("user:delete")
  remove(@Param("id") id: string, @Request() request: AuthenticatedRequest): ApiResponse<null> {
    return createApiResponse(this.usersService.remove(id, request.user, getAuditContext(request)));
  }
}

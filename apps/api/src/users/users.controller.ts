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
  UserListQuery,
  UserRecord,
} from "@admin-x/shared";
import { createApiResponse } from "@admin-x/shared";

import { AuthGuard } from "../auth/auth.guard.js";
import type { AuthenticatedRequest } from "../auth/auth.guard.js";
import { PermissionGuard, RequirePermissions } from "../auth/permission.guard.js";
import {
  CreateUserDto,
  UpdatePasswordDto,
  UpdateProfileDto,
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
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermissions("user:create")
  create(
    @Body() body: CreateUserDto,
    @Request() request: AuthenticatedRequest,
  ): ApiResponse<UserRecord> {
    return createApiResponse(this.usersService.create(body as CreateUserRequest, request.user));
  }

  @Patch("me")
  updateProfile(
    @Body() body: UpdateProfileDto,
    @Request() request: AuthenticatedRequest,
  ): ApiResponse<AuthUser> {
    return createApiResponse(this.usersService.updateProfile(request.user.id, body));
  }

  @Patch("me/password")
  updatePassword(
    @Body() body: UpdatePasswordDto,
    @Request() request: AuthenticatedRequest,
  ): ApiResponse<null> {
    return createApiResponse(this.usersService.updateCurrentPassword(request.user.id, body));
  }

  @Patch(":id/status")
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermissions("user:status")
  updateStatus(
    @Param("id") id: string,
    @Body() body: UpdateUserStatusDto,
    @Request() request: AuthenticatedRequest,
  ): ApiResponse<UserRecord> {
    return createApiResponse(this.usersService.updateStatus(id, body.status, request.user));
  }

  @Patch(":id/role")
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermissions("role:assign")
  updateRole(
    @Param("id") id: string,
    @Body() body: UpdateUserRoleDto,
    @Request() request: AuthenticatedRequest,
  ): ApiResponse<UserRecord> {
    return createApiResponse(this.usersService.updateRole(id, body.role, request.user));
  }

  @Delete(":id")
  @UseGuards(AuthGuard, PermissionGuard)
  @RequirePermissions("user:delete")
  remove(@Param("id") id: string, @Request() request: AuthenticatedRequest): ApiResponse<null> {
    return createApiResponse(this.usersService.remove(id, request.user));
  }
}

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

import { AdminPrivilegeGuard } from "../auth/admin-privilege.guard.js";
import { AuthGuard } from "../auth/auth.guard.js";
import type { AuthenticatedRequest } from "../auth/auth.guard.js";
import {
  CreateUserDto,
  UpdatePasswordDto,
  UpdateProfileDto,
  UpdateUserStatusDto,
} from "./users.dto.js";
import { UsersService } from "./users.service.js";

@Controller("users")
@UseGuards(AuthGuard)
export class UsersController {
  constructor(@Inject(UsersService) private readonly usersService: UsersService) {}

  @Get()
  list(@Query() query: UserListQuery): ApiResponse<PageResult<UserRecord>> {
    return createApiResponse(this.usersService.list(query));
  }

  @Post()
  create(@Body() body: CreateUserDto): ApiResponse<UserRecord> {
    return createApiResponse(this.usersService.create(body as CreateUserRequest));
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
  @UseGuards(AuthGuard, AdminPrivilegeGuard)
  updateStatus(
    @Param("id") id: string,
    @Body() body: UpdateUserStatusDto,
    @Request() request: AuthenticatedRequest,
  ): ApiResponse<UserRecord> {
    return createApiResponse(this.usersService.updateStatus(id, body.status, request.user));
  }

  @Delete(":id")
  remove(@Param("id") id: string): ApiResponse<null> {
    return createApiResponse(this.usersService.remove(id));
  }
}

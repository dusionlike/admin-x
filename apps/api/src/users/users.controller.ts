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
  UseGuards,
} from "@nestjs/common";

import type {
  ApiResponse,
  CreateUserRequest,
  PageResult,
  UserListQuery,
  UserRecord,
} from "@admin-x/shared";
import { createApiResponse } from "@admin-x/shared";

import { AuthGuard } from "../auth/auth.guard.js";
import { CreateUserDto, UpdateUserStatusDto } from "./users.dto.js";
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

  @Patch(":id/status")
  updateStatus(
    @Param("id") id: string,
    @Body() body: UpdateUserStatusDto,
  ): ApiResponse<UserRecord> {
    return createApiResponse(this.usersService.updateStatus(id, body.status));
  }

  @Delete(":id")
  remove(@Param("id") id: string): ApiResponse<null> {
    return createApiResponse(this.usersService.remove(id));
  }
}

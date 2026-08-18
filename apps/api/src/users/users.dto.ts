import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

import type {
  CreateUserRequest,
  UpdatePasswordRequest,
  UpdateProfileRequest,
  UserRole,
  UserStatus,
} from "@admin-x/shared";

export class CreateUserDto implements CreateUserRequest {
  @IsNotEmpty({ message: "姓名不能为空" })
  @IsString({ message: "姓名必须是字符串" })
  displayName!: string;

  @IsEmail({}, { message: "请输入有效的邮箱地址" })
  email!: string;

  @IsNotEmpty({ message: "初始密码不能为空" })
  @IsString({ message: "初始密码必须是字符串" })
  @MinLength(8, { message: "初始密码长度不能少于 8 位" })
  password!: string;

  @IsEnum(["super-admin", "admin", "operator"], { message: "角色不合法" })
  role!: UserRole;

  @IsEnum(["active", "invited", "suspended"], { message: "状态不合法" })
  @IsOptional()
  status?: UserStatus;

  @IsNotEmpty({ message: "用户名不能为空" })
  @IsString({ message: "用户名必须是字符串" })
  @MinLength(3, { message: "用户名至少 3 个字符" })
  username!: string;
}

export class UpdateUserStatusDto {
  @IsEnum(["active", "invited", "suspended"], { message: "状态不合法" })
  status!: UserStatus;
}

export class UpdateProfileDto implements UpdateProfileRequest {
  @IsNotEmpty({ message: "显示名称不能为空" })
  @IsString({ message: "显示名称必须是字符串" })
  @MaxLength(50, { message: "显示名称不能超过 50 个字符" })
  displayName!: string;

  @IsEmail({}, { message: "请输入有效的邮箱地址" })
  @MaxLength(120, { message: "邮箱地址不能超过 120 个字符" })
  email!: string;

  @IsOptional()
  @IsString({ message: "个人简介必须是字符串" })
  @MaxLength(200, { message: "个人简介不能超过 200 个字符" })
  remark?: string;

  @IsOptional()
  @IsString({ message: "头像数据不正确" })
  @MaxLength(500_000, { message: "头像文件过大" })
  avatar?: string;
}

export class UpdatePasswordDto implements UpdatePasswordRequest {
  @IsNotEmpty({ message: "当前密码不能为空" })
  @IsString({ message: "当前密码必须是字符串" })
  currentPassword!: string;

  @IsNotEmpty({ message: "新密码不能为空" })
  @IsString({ message: "新密码必须是字符串" })
  @MinLength(8, { message: "新密码长度不能少于 8 位" })
  newPassword!: string;
}

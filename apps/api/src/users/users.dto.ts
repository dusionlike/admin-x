import {
  ArrayMaxSize,
  IsBoolean,
  IsArray,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsInt,
  MaxLength,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

import type {
  CreateUserRequest,
  DataScope,
  DataScopeType,
  ResetUserPasswordRequest,
  UpdatePasswordRequest,
  UpdateProfileRequest,
  PrivacyConsentRequest,
  UpdateUserDataScopeRequest,
  UpdateUserSecurityLevelRequest,
  UpdateUserRoleRequest,
  UserListQuery,
  UserRole,
  UserStatus,
  SecurityLevel,
} from "@admin-x/shared";

export class CreateUserDto implements CreateUserRequest {
  @IsNotEmpty({ message: "姓名不能为空" })
  @IsString({ message: "姓名必须是字符串" })
  @MaxLength(100, { message: "姓名不能超过 100 个字符" })
  displayName!: string;

  @IsEmail({}, { message: "请输入有效的邮箱地址" })
  @MaxLength(120, { message: "邮箱地址不能超过 120 个字符" })
  email!: string;

  @IsNotEmpty({ message: "初始密码不能为空" })
  @IsString({ message: "初始密码必须是字符串" })
  @MinLength(8, { message: "初始密码长度不能少于 8 位" })
  @MaxLength(128, { message: "初始密码不能超过 128 个字符" })
  password!: string;

  @IsEnum(
    ["system-admin", "security-admin", "audit-admin", "business-admin", "operator", "readonly"],
    {
      message: "角色不合法",
    },
  )
  role!: UserRole;

  @IsEnum(["active", "invited", "suspended"], { message: "状态不合法" })
  @IsOptional()
  status?: UserStatus;

  @IsNotEmpty({ message: "用户名不能为空" })
  @IsString({ message: "用户名必须是字符串" })
  @MinLength(3, { message: "用户名至少 3 个字符" })
  @MaxLength(64, { message: "用户名不能超过 64 个字符" })
  username!: string;

  @IsOptional()
  @IsString({ message: "备注必须是字符串" })
  @MaxLength(200, { message: "备注不能超过 200 个字符" })
  remark?: string;

  @IsBoolean({ message: "个人信息保护告知确认值不正确" })
  privacyNoticeAccepted!: boolean;
}

export class UpdateUserStatusDto {
  @IsEnum(["active", "invited", "suspended"], { message: "状态不合法" })
  status!: UserStatus;
}

export class UpdateUserRoleDto implements UpdateUserRoleRequest {
  @IsEnum(
    ["system-admin", "security-admin", "audit-admin", "business-admin", "operator", "readonly"],
    {
      message: "角色不合法",
    },
  )
  role!: UserRole;
}

export class DataScopeDto implements DataScope {
  @IsEnum(["all", "organization", "department", "project", "assigned", "self"], {
    message: "数据范围类型不合法",
  })
  type!: DataScopeType;

  @IsArray({ message: "数据范围编号必须是数组" })
  @IsString({ each: true, message: "数据范围编号必须是字符串" })
  @MaxLength(100, { each: true, message: "单个数据范围编号不能超过 100 个字符" })
  @ArrayMaxSize(100, { message: "数据范围编号不能超过 100 个" })
  ids!: string[];
}

export class UpdateUserDataScopeDto implements UpdateUserDataScopeRequest {
  @ValidateNested()
  @Type(() => DataScopeDto)
  dataScope!: DataScopeDto;
}

export class UpdateUserSecurityLevelDto implements UpdateUserSecurityLevelRequest {
  @IsEnum(["public", "internal", "secret", "confidential"], {
    message: "用户安全级别不合法",
  })
  securityLevel!: SecurityLevel;
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
  @MaxLength(128, { message: "当前密码不能超过 128 个字符" })
  currentPassword!: string;

  @IsNotEmpty({ message: "新密码不能为空" })
  @IsString({ message: "新密码必须是字符串" })
  @MinLength(8, { message: "新密码长度不能少于 8 位" })
  @MaxLength(128, { message: "新密码不能超过 128 个字符" })
  newPassword!: string;
}

export class ResetUserPasswordDto implements ResetUserPasswordRequest {
  @IsNotEmpty({ message: "新密码不能为空" })
  @IsString({ message: "新密码必须是字符串" })
  @MinLength(8, { message: "新密码长度不能少于 8 位" })
  @MaxLength(128, { message: "新密码不能超过 128 个字符" })
  newPassword!: string;
}

export class PrivacyEraseDto {
  @IsNotEmpty({ message: "当前密码不能为空" })
  @IsString({ message: "当前密码必须是字符串" })
  @MaxLength(128, { message: "当前密码不能超过 128 个字符" })
  currentPassword!: string;
}

export class PrivacyConsentDto implements PrivacyConsentRequest {
  @IsBoolean({ message: "个人信息保护告知确认值不正确" })
  accepted!: boolean;
}

export class UserListQueryDto implements UserListQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "页码必须是整数" })
  @Min(1, { message: "页码必须大于 0" })
  @Max(9_999, { message: "页码超出范围" })
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "每页数量必须是整数" })
  @Min(1, { message: "每页数量必须大于 0" })
  @Max(100, { message: "每页数量不能超过 100" })
  pageSize?: number;

  @IsOptional()
  @IsString({ message: "搜索关键词必须是字符串" })
  @MaxLength(100, { message: "搜索关键词不能超过 100 个字符" })
  keyword?: string;

  @IsOptional()
  @IsEnum(["all", "active", "invited", "suspended"], { message: "用户状态不合法" })
  status?: UserListQuery["status"];
}

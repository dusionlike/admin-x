import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, MinLength } from "class-validator";

import type { CreateUserRequest, UserRole, UserStatus } from "@admin-x/shared";

export class CreateUserDto implements CreateUserRequest {
  @IsNotEmpty({ message: "姓名不能为空" })
  @IsString({ message: "姓名必须是字符串" })
  displayName!: string;

  @IsEmail({}, { message: "请输入有效的邮箱地址" })
  email!: string;

  @IsNotEmpty({ message: "初始密码不能为空" })
  @IsString({ message: "初始密码必须是字符串" })
  @MinLength(6, { message: "初始密码长度不能少于 6 位" })
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

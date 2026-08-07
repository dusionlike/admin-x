import { IsEmail, IsNotEmpty, IsString, MinLength } from "class-validator";

import type { LoginRequest, SetupAdminRequest } from "@admin-x/shared";

export class LoginDto implements LoginRequest {
  @IsNotEmpty({ message: "用户名不能为空" })
  @IsString({ message: "用户名必须是字符串" })
  username!: string;

  @IsNotEmpty({ message: "密码不能为空" })
  @IsString({ message: "密码必须是字符串" })
  @MinLength(6, { message: "密码长度不能少于 6 位" })
  password!: string;
}

export class SetupAdminDto implements SetupAdminRequest {
  @IsNotEmpty({ message: "姓名不能为空" })
  @IsString({ message: "姓名必须是字符串" })
  displayName!: string;

  @IsEmail({}, { message: "请输入有效的邮箱地址" })
  email!: string;

  @IsNotEmpty({ message: "密码不能为空" })
  @IsString({ message: "密码必须是字符串" })
  @MinLength(6, { message: "密码长度不能少于 6 位" })
  password!: string;

  @IsNotEmpty({ message: "用户名不能为空" })
  @IsString({ message: "用户名必须是字符串" })
  @MinLength(3, { message: "用户名至少 3 个字符" })
  username!: string;
}

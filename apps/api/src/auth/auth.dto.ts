import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

import type {
  ChangeExpiredPasswordRequest,
  LoginRequest,
  ReauthenticationRequest,
  SetupAdminRequest,
} from "@admin-x/shared";

export class LoginDto implements LoginRequest {
  @IsNotEmpty({ message: "图形验证码标识不能为空" })
  @IsString({ message: "图形验证码标识必须是字符串" })
  @MaxLength(64, { message: "图形验证码标识不正确" })
  captchaId!: string;

  @IsNotEmpty({ message: "图形验证码不能为空" })
  @IsString({ message: "图形验证码必须是字符串" })
  @Matches(/^[A-Za-z0-9]{4}$/u, { message: "请输入 4 位图形验证码" })
  captchaCode!: string;

  @IsNotEmpty({ message: "用户名不能为空" })
  @IsString({ message: "用户名必须是字符串" })
  @MaxLength(64, { message: "用户名不能超过 64 个字符" })
  username!: string;

  @IsNotEmpty({ message: "密码不能为空" })
  @IsString({ message: "密码必须是字符串" })
  @MinLength(6, { message: "密码长度不能少于 6 位" })
  @MaxLength(128, { message: "密码不能超过 128 个字符" })
  password!: string;

  @IsOptional()
  @IsString({ message: "登录验证码必须是字符串" })
  @Matches(/^\d{6}$/, { message: "登录验证码应为 6 位数字" })
  mfaCode?: string;
}

export class EmailMfaCodeRequestDto {
  @IsNotEmpty({ message: "图形验证码标识不能为空" })
  @IsString({ message: "图形验证码标识必须是字符串" })
  @MaxLength(64, { message: "图形验证码标识不正确" })
  captchaId!: string;

  @IsNotEmpty({ message: "图形验证码不能为空" })
  @IsString({ message: "图形验证码必须是字符串" })
  @Matches(/^[A-Za-z0-9]{4}$/u, { message: "请输入 4 位图形验证码" })
  captchaCode!: string;

  @IsNotEmpty({ message: "用户名不能为空" })
  @IsString({ message: "用户名必须是字符串" })
  @MaxLength(64, { message: "用户名不能超过 64 个字符" })
  username!: string;

  @IsNotEmpty({ message: "密码不能为空" })
  @IsString({ message: "密码必须是字符串" })
  @MinLength(6, { message: "密码长度不能少于 6 位" })
  @MaxLength(128, { message: "密码不能超过 128 个字符" })
  password!: string;
}

export class ChangeExpiredPasswordDto implements ChangeExpiredPasswordRequest {
  @IsNotEmpty({ message: "用户名不能为空" })
  @IsString({ message: "用户名必须是字符串" })
  @MaxLength(64, { message: "用户名不能超过 64 个字符" })
  username!: string;

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

export class SetupAdminDto implements SetupAdminRequest {
  @IsNotEmpty({ message: "姓名不能为空" })
  @IsString({ message: "姓名必须是字符串" })
  @MaxLength(100, { message: "姓名不能超过 100 个字符" })
  displayName!: string;

  @IsEmail({}, { message: "请输入有效的邮箱地址" })
  @MaxLength(120, { message: "邮箱地址不能超过 120 个字符" })
  email!: string;

  @IsNotEmpty({ message: "密码不能为空" })
  @IsString({ message: "密码必须是字符串" })
  @MinLength(8, { message: "密码长度不能少于 8 位" })
  @MaxLength(128, { message: "密码不能超过 128 个字符" })
  password!: string;

  @IsNotEmpty({ message: "用户名不能为空" })
  @IsString({ message: "用户名必须是字符串" })
  @MinLength(3, { message: "用户名至少 3 个字符" })
  @MaxLength(64, { message: "用户名不能超过 64 个字符" })
  username!: string;

  @IsBoolean({ message: "个人信息保护告知确认值不正确" })
  privacyNoticeAccepted!: boolean;
}

export class ReauthenticationDto implements ReauthenticationRequest {
  @IsNotEmpty({ message: "当前密码不能为空" })
  @IsString({ message: "当前密码必须是字符串" })
  @MaxLength(128, { message: "当前密码不能超过 128 个字符" })
  currentPassword!: string;
}

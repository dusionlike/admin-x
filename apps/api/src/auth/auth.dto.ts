import {
  IsBoolean,
  IsEmail,
  IsEnum,
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
  @IsString({ message: "MFA 验证码必须是字符串" })
  @Matches(/^\d{6}$/, { message: "MFA 验证码应为 6 位数字" })
  mfaCode?: string;

  @IsEnum(["totp", "email"], { message: "MFA 验证方式不正确" })
  @IsOptional()
  mfaMethod?: LoginRequest["mfaMethod"];
}

export class EmailMfaCodeRequestDto {
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

export class MfaSetupDto {
  @IsNotEmpty({ message: "当前密码不能为空" })
  @IsString({ message: "当前密码必须是字符串" })
  @MaxLength(128, { message: "当前密码不能超过 128 个字符" })
  currentPassword!: string;
}

export class MfaCodeDto {
  @IsNotEmpty({ message: "MFA 验证码不能为空" })
  @IsString({ message: "MFA 验证码必须是字符串" })
  @Matches(/^\d{6}$/, { message: "MFA 验证码应为 6 位数字" })
  code!: string;
}

export class MfaDisableDto extends MfaCodeDto {
  @IsNotEmpty({ message: "当前密码不能为空" })
  @IsString({ message: "当前密码必须是字符串" })
  @MaxLength(128, { message: "当前密码不能超过 128 个字符" })
  currentPassword!: string;
}

export class ReauthenticationDto implements ReauthenticationRequest {
  @IsNotEmpty({ message: "当前密码不能为空" })
  @IsString({ message: "当前密码必须是字符串" })
  @MaxLength(128, { message: "当前密码不能超过 128 个字符" })
  currentPassword!: string;
}

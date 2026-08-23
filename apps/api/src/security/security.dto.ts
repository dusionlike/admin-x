import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";

import type {
  SecurityPolicy,
  UpdateEmailMfaPolicy,
  UpdateEmailMfaTransportSettings,
} from "@admin-x/shared";

export class UpdateSecurityPolicyDto implements SecurityPolicy {
  @IsArray({ message: "允许来源 IP 必须是数组" })
  @IsString({ each: true, message: "允许来源 IP 必须是字符串" })
  @MaxLength(100, { each: true, message: "单个 IP 范围不能超过 100 个字符" })
  allowedIpRanges!: string[];

  @IsInt({ message: "并发会话数必须是整数" })
  @Min(1, { message: "并发会话数至少为 1" })
  @Max(10, { message: "并发会话数不能超过 10" })
  concurrentSessionLimit!: number;

  @IsInt({ message: "锁定时长必须是整数" })
  @Min(30, { message: "锁定时长至少为 30 分钟" })
  @Max(1440, { message: "锁定时长不能超过 1440 分钟" })
  lockoutMinutes!: number;

  @IsInt({ message: "登录失败次数必须是整数" })
  @Min(3, { message: "登录失败次数至少为 3 次" })
  @Max(20, { message: "登录失败次数不能超过 20 次" })
  loginFailureLimit!: number;

  @IsBoolean({ message: "管理员 MFA 配置不正确" })
  mfaRequiredForAdministrators!: boolean;

  @IsInt({ message: "密码最小长度必须是整数" })
  @Min(8, { message: "密码最小长度不能少于 8 位" })
  @Max(64, { message: "密码最小长度不能超过 64 位" })
  passwordMinLength!: number;

  @IsInt({ message: "密码有效期必须是整数" })
  @Min(90, { message: "密码有效期不能少于 90 天" })
  @Max(3650, { message: "密码有效期不能超过 3650 天" })
  passwordMaxAgeDays!: number;

  @IsBoolean({ message: "敏感操作二次验证配置不正确" })
  sensitiveActionReauth!: boolean;

  @IsInt({ message: "会话超时时间必须是整数" })
  @Min(5, { message: "会话超时时间至少为 5 分钟" })
  @Max(480, { message: "会话超时时间不能超过 480 分钟" })
  sessionTimeoutMinutes!: number;
}

export class UpdateEmailMfaTransportDto implements UpdateEmailMfaTransportSettings {
  @IsNotEmpty({ message: "SMTP 主机不能为空" })
  @IsString({ message: "SMTP 主机必须是字符串" })
  @MaxLength(255, { message: "SMTP 主机不能超过 255 个字符" })
  smtpHost!: string;

  @IsInt({ message: "SMTP 端口必须是整数" })
  @Min(1, { message: "SMTP 端口至少为 1" })
  @Max(65_535, { message: "SMTP 端口不能超过 65535" })
  smtpPort!: number;

  @IsBoolean({ message: "SMTP 加密配置不正确" })
  smtpSecure!: boolean;

  @IsString({ message: "SMTP 用户名必须是字符串" })
  @MaxLength(200, { message: "SMTP 用户名不能超过 200 个字符" })
  smtpUser!: string;

  @IsOptional()
  @IsString({ message: "SMTP 密码必须是字符串" })
  @MaxLength(500, { message: "SMTP 密码不能超过 500 个字符" })
  smtpPassword?: string;

  @IsEmail({}, { message: "发件邮箱地址无效" })
  fromEmail!: string;

  @IsNotEmpty({ message: "发件人名称不能为空" })
  @IsString({ message: "发件人名称必须是字符串" })
  @MaxLength(100, { message: "发件人名称不能超过 100 个字符" })
  fromName!: string;
}

export class UpdateEmailMfaPolicyDto implements UpdateEmailMfaPolicy {
  @IsBoolean({ message: "邮箱 MFA 开关配置不正确" })
  enabled!: boolean;
}

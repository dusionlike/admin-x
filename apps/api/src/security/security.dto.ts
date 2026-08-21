import { IsArray, IsBoolean, IsInt, IsString, Max, MaxLength, Min } from "class-validator";

import type { SecurityPolicy } from "@admin-x/shared";

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
  @Min(1, { message: "锁定时长至少为 1 分钟" })
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
  @Min(0, { message: "密码有效期不能为负数" })
  @Max(3650, { message: "密码有效期不能超过 3650 天" })
  passwordMaxAgeDays!: number;

  @IsBoolean({ message: "敏感操作二次验证配置不正确" })
  sensitiveActionReauth!: boolean;

  @IsInt({ message: "会话超时时间必须是整数" })
  @Min(5, { message: "会话超时时间至少为 5 分钟" })
  @Max(480, { message: "会话超时时间不能超过 480 分钟" })
  sessionTimeoutMinutes!: number;
}

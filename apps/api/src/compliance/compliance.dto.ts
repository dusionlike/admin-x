import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

import type { BackupTarget } from "@admin-x/shared";

export class CreateBackupDto {
  @IsEnum(["local", "remote"], { message: "备份目标必须是本地或异地" })
  target!: BackupTarget;
}

export class CreateVulnerabilityScanDto {
  @IsInt({ message: "严重漏洞数量必须是整数" })
  @IsOptional()
  @Min(0, { message: "严重漏洞数量不能为负数" })
  criticalCount = 0;

  @IsInt({ message: "高危漏洞数量必须是整数" })
  @IsOptional()
  @Min(0, { message: "高危漏洞数量不能为负数" })
  highCount = 0;

  @IsInt({ message: "中危漏洞数量必须是整数" })
  @IsOptional()
  @Min(0, { message: "中危漏洞数量不能为负数" })
  mediumCount = 0;

  @IsInt({ message: "低危漏洞数量必须是整数" })
  @IsOptional()
  @Min(0, { message: "低危漏洞数量不能为负数" })
  @Max(100_000, { message: "低危漏洞数量超出范围" })
  lowCount = 0;

  @IsOptional()
  @IsString({ message: "扫描报告必须是字符串" })
  @MaxLength(2_000, { message: "扫描报告不能超过 2000 个字符" })
  report?: string;

  @IsOptional()
  @IsString({ message: "扫描器名称必须是字符串" })
  @MaxLength(100, { message: "扫描器名称不能超过 100 个字符" })
  scanner = "dependency-audit-gate";
}

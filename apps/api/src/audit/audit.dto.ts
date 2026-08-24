import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

import type { AuditListQuery } from "@admin-x/shared";

export class AuditListQueryDto implements AuditListQuery {
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
  @IsEnum(["all", "success", "failure", "blocked"], { message: "审计结果不合法" })
  result?: AuditListQuery["result"];
}

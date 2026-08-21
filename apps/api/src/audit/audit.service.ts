import { Inject, Injectable } from "@nestjs/common";

import type { AuditListQuery, AuditRecord, AuthUser, PageResult } from "@admin-x/shared";
import { createPageMeta, normalizePageQuery } from "@admin-x/shared";

import type { AuditContext } from "../database/database.service.js";
import { DatabaseService } from "../database/database.service.js";

@Injectable()
export class AuditService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  list(query: AuditListQuery): PageResult<AuditRecord> {
    const page = normalizePageQuery({
      keyword: query.keyword,
      page: query.page,
      pageSize: query.pageSize,
    });
    const offset = (page.page - 1) * page.pageSize;
    const result = query.result ?? "all";
    const total = this.database.countAuditRecords(page.keyword, result);
    return {
      items: this.database.listAuditRecords(page.keyword, result, page.pageSize, offset),
      meta: createPageMeta(total, page.page, page.pageSize),
    };
  }

  export(query: AuditListQuery, actor: AuthUser, context?: AuditContext): string {
    const result = query.result ?? "all";
    const records = this.database.listAuditRecords(query.keyword ?? "", result, 10_000, 0);
    this.database.addActivity({
      action: "audit.export",
      actor: {
        displayName: actor.displayName,
        id: actor.id,
        role: actor.role,
        username: actor.username,
      },
      context,
      description: `${actor.displayName}（@${actor.username}）导出了 ${records.length} 条审计记录`,
      title: "导出审计记录",
      type: "system",
      resource: "audit",
    });
    return [
      ["时间", "操作者", "账号", "角色", "结果", "操作", "资源", "对象", "IP", "详情"]
        .map(csvCell)
        .join(","),
      ...records.map((record) =>
        [
          record.createdAt,
          record.actorName,
          record.actorUsername ?? "",
          record.actorRole ?? "",
          record.result,
          record.title,
          record.resource,
          record.targetId ?? "",
          record.ipAddress ?? "",
          record.description,
        ]
          .map(csvCell)
          .join(","),
      ),
    ].join("\n");
  }
}

function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

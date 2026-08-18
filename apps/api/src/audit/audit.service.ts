import { Inject, Injectable } from "@nestjs/common";

import type { AuditListQuery, AuditRecord, PageResult } from "@admin-x/shared";
import { createPageMeta, normalizePageQuery } from "@admin-x/shared";

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
    const total = this.database.countAuditRecords(page.keyword);
    return {
      items: this.database.listAuditRecords(page.keyword, page.pageSize, offset),
      meta: createPageMeta(total, page.page, page.pageSize),
    };
  }
}

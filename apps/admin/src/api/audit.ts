import type { AuditListQuery, AuditRecord, PageResult } from "@admin-x/shared";

import { http, requestData } from "./http";

export const auditApi = {
  list(query: AuditListQuery) {
    return requestData<PageResult<AuditRecord>>({
      method: "GET",
      params: query,
      url: "/audit",
    });
  },
  export(query: AuditListQuery) {
    return http.get<string>("/audit/export", {
      params: query,
      responseType: "text",
    });
  },
};

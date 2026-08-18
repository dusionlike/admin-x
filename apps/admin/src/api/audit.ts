import type { AuditListQuery, AuditRecord, PageResult } from "@admin-x/shared";

import { requestData } from "./http";

export const auditApi = {
  list(query: AuditListQuery) {
    return requestData<PageResult<AuditRecord>>({
      method: "GET",
      params: query,
      url: "/audit",
    });
  },
};

import { expect, test } from "vite-plus/test";

import { AuditService } from "../audit/audit.service.js";
import { DatabaseService } from "../database/database.service.js";

test("masks sensitive audit fields in API results and exports", () => {
  const database = new DatabaseService(":memory:");
  const service = new AuditService(database);
  database.addActivity({
    action: "test.audit",
    actor: {
      displayName: "审计管理员",
      id: "actor-1",
      role: "audit-admin",
      username: "audit-admin",
    },
    after: {
      email: "person@example.com",
      password: "NeverExportThis123!",
      sourceIp: "192.168.1.25",
    },
    context: {
      ipAddress: "192.168.1.25",
      requestId: "audit-request-123",
    },
    description: "审计管理员（@audit-admin）处理 person@example.com，来源 192.168.1.25",
    title: "处理敏感记录",
    type: "update",
    resource: "test",
    targetId: "target-123",
  });

  const record = service.list({ page: 1, pageSize: 10 }).items[0];
  expect(record?.actorName).toBe("审****");
  expect(record?.actorUsername).toBe("a***n");
  expect(record?.ipAddress).toBe("192.168.*.*");
  expect(record?.description).not.toContain("person@example.com");
  expect(record?.description).not.toContain("192.168.1.25");
  expect(record?.description).toContain("a***n");
  expect(record?.after).toEqual({
    email: "p***@example.com",
    password: "[已脱敏]",
    sourceIp: "192.168.*.*",
  });

  const csv = service.export(
    { page: 1, pageSize: 10 },
    {
      displayName: "审计管理员",
      dataScope: { ids: [], type: "all" },
      email: "audit-admin@example.com",
      id: "actor-1",
      mfaEnabled: false,
      role: "audit-admin",
      securityLevel: "confidential",
      username: "audit-admin",
    },
  );
  expect(csv).not.toContain("person@example.com");
  expect(csv).not.toContain("192.168.1.25");
  expect(csv).toContain("a***n");
  database.onModuleDestroy();
});

import { expect, test } from "vite-plus/test";

import { encryptSensitive } from "../security/data-protection.js";
import { DatabaseService } from "../database/database.service.js";
import { UsersService } from "../users/users.service.js";
import { ComplianceService } from "./compliance.service.js";

test("cleans expired personal-data auxiliaries and keeps an audit evidence", () => {
  const previousRetention = process.env.PERSONAL_DATA_RETENTION_DAYS;
  process.env.PERSONAL_DATA_RETENTION_DAYS = "1";
  const database = new DatabaseService(":memory:");
  const users = new UsersService(database);
  const user = users.createAdmin({
    displayName: "留存管理员",
    email: "retention@admin-x.dev",
    password: "RetentionAdmin123!",
    privacyNoticeAccepted: true,
    username: "retention-admin",
  });
  const old = new Date(Date.now() - 2 * 86_400_000).toISOString();
  database.recordVisit(user.id);
  database.createSession(
    user.id,
    "expired-session",
    new Date(Date.now() - 60_000).toISOString(),
    1,
  );
  database.connection.prepare("UPDATE visit_events SET created_at = ?").run(old);
  database.connection.prepare("UPDATE auth_sessions SET expires_at = ?").run(old);
  database.connection
    .prepare(
      `UPDATE users
       SET last_active_at = ?, last_login_ip = ?, privacy_notice_accepted_at = ?,
           privacy_notice_ip = ?
       WHERE id = ?`,
    )
    .run(old, encryptSensitive("192.168.1.50"), old, encryptSensitive("192.168.1.51"), user.id);

  try {
    const compliance = new ComplianceService(database);
    const result = compliance.runPrivacyRetentionCleanup();

    expect(result.visitEvents).toBe(1);
    expect(result.sessions).toBe(1);
    expect(result.loginIps).toBe(1);
    expect(result.consentIps).toBe(1);
    expect(result.total).toBeGreaterThanOrEqual(4);
    expect(database.connection.prepare("SELECT COUNT(*) AS count FROM visit_events").get()).toEqual(
      {
        count: 0,
      },
    );
    expect(
      database.connection.prepare("SELECT COUNT(*) AS count FROM auth_sessions").get(),
    ).toEqual({ count: 0 });
    const raw = database.connection
      .prepare("SELECT last_login_ip, privacy_notice_ip FROM users WHERE id = ?")
      .get(user.id) as { last_login_ip?: string; privacy_notice_ip?: string };
    expect(raw.last_login_ip).toBe("");
    expect(raw.privacy_notice_ip).toBe("");
    expect(
      database.connection
        .prepare(
          "SELECT COUNT(*) AS count FROM activity_logs WHERE action = 'privacy.retention.cleanup'",
        )
        .get(),
    ).toEqual({ count: 1 });
  } finally {
    database.onModuleDestroy();
    if (previousRetention === undefined) {
      delete process.env.PERSONAL_DATA_RETENTION_DAYS;
    } else {
      process.env.PERSONAL_DATA_RETENTION_DAYS = previousRetention;
    }
  }
});

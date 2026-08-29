import { HttpException, UnauthorizedException } from "@nestjs/common";
import jwt from "jsonwebtoken";

import { expect, test } from "vite-plus/test";

import { DatabaseService } from "../database/database.service.js";
import { UsersService } from "../users/users.service.js";
import { EmailMfaService } from "./email-mfa.service.js";
import { AuthService } from "./auth.service.js";
import { verifyReauthenticationToken } from "./reauth.js";

function createAuth() {
  const database = new DatabaseService(":memory:");
  const users = new UsersService(database);
  const sentMessages: Array<{ text: string; to: string }> = [];
  const emailMfa = new EmailMfaService(database, () => ({
    sendMail: async (options) => {
      sentMessages.push({ text: options.text, to: options.to });
    },
    verify: async () => undefined,
  }));
  return {
    auth: new AuthService(database, users, emailMfa),
    database,
    emailMfa,
    sentMessages,
    users,
  };
}

test("issues a database-backed session and revokes the older session when the limit is one", () => {
  const { auth, database } = createAuth();
  const context = { ipAddress: "127.0.0.1", requestId: "test-request" };
  const setup = auth.setupAdmin(
    {
      displayName: "系统管理员",
      email: "session@admin-x.dev",
      password: "AdminPass123!",
      privacyNoticeAccepted: true,
      username: "session-admin",
    },
    context,
  );
  const nextLogin = auth.login({ password: "AdminPass123!", username: "session-admin" }, context);

  expect(() => auth.authenticate(setup.token, context)).toThrow("登录状态已失效");
  expect(auth.authenticate(nextLogin.token, context).username).toBe("session-admin");
  expect(
    database.connection.prepare("SELECT COUNT(*) AS count FROM auth_sessions").get(),
  ).toBeTruthy();
  database.onModuleDestroy();
});

test("refreshes an active session expiry on each authenticated request", () => {
  const { auth, database, users } = createAuth();
  const context = { ipAddress: "127.0.0.1", requestId: "session-refresh-test" };
  const setup = auth.setupAdmin(
    {
      displayName: "会话续期管理员",
      email: "session-refresh@admin-x.dev",
      password: "SessionRefresh123!",
      privacyNoticeAccepted: true,
      username: "session-refresh-admin",
    },
    context,
  );
  const session = database.connection
    .prepare("SELECT id FROM auth_sessions WHERE user_id = ?")
    .get(setup.user.id) as { id?: string };
  if (!session.id) {
    throw new Error("Expected an active session");
  }
  const sessionId = session.id;
  const oldLastSeenAt = new Date(Date.now() - 60_000).toISOString();
  const oldExpiresAt = new Date(Date.now() + 60_000).toISOString();
  database.connection
    .prepare("UPDATE auth_sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?")
    .run(oldLastSeenAt, oldExpiresAt, sessionId);

  const expiredJwt = jwt.sign(
    {
      mfaVerified: false,
      role: setup.user.role,
      sessionVersion: users.findAuthenticatedUser(setup.user.id)?.sessionVersion,
      username: setup.user.username,
    },
    process.env.JWT_SECRET ?? "admin-x-development-secret",
    { expiresIn: -1, jwtid: sessionId, subject: setup.user.id },
  );
  expect(auth.authenticate(expiredJwt, context).username).toBe("session-refresh-admin");

  const refreshed = database.connection
    .prepare("SELECT last_seen_at, expires_at FROM auth_sessions WHERE id = ?")
    .get(sessionId) as { expires_at?: string; last_seen_at?: string };
  expect(Date.parse(refreshed.last_seen_at ?? "")).toBeGreaterThan(Date.parse(oldLastSeenAt));
  expect(Date.parse(refreshed.expires_at ?? "")).toBeGreaterThan(Date.parse(oldExpiresAt));
  database.onModuleDestroy();
});

test("lists the current session and revokes a selected session", () => {
  const { auth, database } = createAuth();
  const context = { ipAddress: "127.0.0.1", requestId: "session-ledger-test" };
  const setup = auth.setupAdmin(
    {
      displayName: "会话台账管理员",
      email: "session-ledger@admin-x.dev",
      password: "SessionLedger123!",
      privacyNoticeAccepted: true,
      username: "session-ledger-admin",
    },
    context,
  );
  const session = database.connection
    .prepare("SELECT id FROM auth_sessions WHERE user_id = ?")
    .get(setup.user.id) as { id?: string };

  expect(session.id).toBeTruthy();
  expect(auth.listSessions(setup.user.id, session.id)).toEqual([
    expect.objectContaining({ current: true, ipAddress: "127.0.0.1" }),
  ]);
  auth.revokeSession(setup.user, session.id!, context);
  expect(auth.listSessions(setup.user.id)).toEqual([]);
  expect(() => auth.authenticate(setup.token, context)).toThrow("登录状态已失效");
  database.onModuleDestroy();
});

test("supports an expired-password reminder and self-service recovery flow", () => {
  const { auth, database } = createAuth();
  const context = { ipAddress: "127.0.0.1", requestId: "expired-password-test" };
  const setup = auth.setupAdmin(
    {
      displayName: "过期密码管理员",
      email: "expired-password@admin-x.dev",
      password: "ExpiredPassword123!",
      privacyNoticeAccepted: true,
      username: "expired-password-admin",
    },
    context,
  );
  database.connection
    .prepare("UPDATE users SET password_changed_at = ? WHERE id = ?")
    .run(new Date(Date.now() - 100 * 86_400_000).toISOString(), setup.user.id);

  expect(() =>
    auth.login({ password: "ExpiredPassword123!", username: "expired-password-admin" }, context),
  ).toThrow("密码已过期");
  expect(
    auth.changeExpiredPassword(
      {
        currentPassword: "ExpiredPassword123!",
        newPassword: "RecoveredPassword123!",
        username: "expired-password-admin",
      },
      context,
    ),
  ).toBeNull();
  expect(
    auth.login({ password: "RecoveredPassword123!", username: "expired-password-admin" }, context)
      .passwordStatus?.expired,
  ).toBe(false);
  database.onModuleDestroy();
});

test("locks an account after repeated password failures and records the blocked result", () => {
  const { auth, database } = createAuth();
  const context = { ipAddress: "10.0.0.8", requestId: "lockout-test" };
  auth.setupAdmin(
    {
      displayName: "锁定测试",
      email: "lockout@admin-x.dev",
      password: "LockoutPass123!",
      privacyNoticeAccepted: true,
      username: "lockout-admin",
    },
    context,
  );

  for (let attempt = 0; attempt < 4; attempt += 1) {
    expect(() =>
      auth.login({ password: "WrongPass123!", username: "lockout-admin" }, context),
    ).toThrow(UnauthorizedException);
  }
  expect(() =>
    auth.login({ password: "WrongPass123!", username: "lockout-admin" }, context),
  ).toThrow(HttpException);
  expect(() =>
    auth.login({ password: "LockoutPass123!", username: "lockout-admin" }, context),
  ).toThrow("账号已被临时锁定");

  const row = database.connection
    .prepare(
      "SELECT result FROM activity_logs WHERE action = 'auth.login.failure' ORDER BY rowid DESC LIMIT 1",
    )
    .get() as { result?: string };
  expect(row.result).toBe("blocked");
  database.onModuleDestroy();
});

test("keeps email MFA disabled by default and supports the split configuration flow", async () => {
  const { auth, database, emailMfa, sentMessages } = createAuth();
  const context = { ipAddress: "127.0.0.1", requestId: "email-mfa-test" };
  const setup = auth.setupAdmin(
    {
      displayName: "邮箱管理员",
      email: "email-mfa@admin-x.dev",
      password: "EmailMfaAdmin123!",
      privacyNoticeAccepted: true,
      username: "email-mfa-admin",
    },
    context,
  );

  expect(emailMfa.getSettings().enabled).toBe(false);
  expect(emailMfa.getSettings().configured).toBe(false);

  await emailMfa.updateTransportSettings(
    {
      fromEmail: "no-reply@admin-x.dev",
      fromName: "Admin X",
      smtpHost: "smtp.admin-x.dev",
      smtpPassword: "smtp-secret-123",
      smtpPort: 587,
      smtpSecure: false,
      smtpUser: "mailer@admin-x.dev",
    },
    setup.user,
    context,
  );
  const stored = database.connection
    .prepare("SELECT smtp_password_encrypted FROM email_mfa_config WHERE id = 1")
    .get() as { smtp_password_encrypted?: string };
  expect(stored.smtp_password_encrypted).toContain("v1:");
  expect(stored.smtp_password_encrypted).not.toContain("smtp-secret-123");
  expect(emailMfa.getSettings().enabled).toBe(false);
  expect(emailMfa.getSettings().configured).toBe(true);

  await emailMfa.setEnabled(true, setup.user, context);
  const sent = await emailMfa.issueCode(setup.user, context);
  expect(sent.maskedEmail).toBe("e***a@admin-x.dev");
  const code = sentMessages.at(-1)?.text.match(/：([0-9]{6})/u)?.[1];
  expect(code).toMatch(/^[0-9]{6}$/u);

  const login = auth.login(
    {
      mfaCode: code,
      password: "EmailMfaAdmin123!",
      username: "email-mfa-admin",
    },
    context,
  );
  expect(auth.authenticate(login.token, context).username).toBe("email-mfa-admin");
  database.onModuleDestroy();
});

test("binds sensitive-operation reauthentication to the current session version", () => {
  const { auth, database, users } = createAuth();
  const setup = auth.setupAdmin({
    displayName: "二次验证管理员",
    email: "reauth@admin-x.dev",
    password: "ReauthAdminPass123!",
    privacyNoticeAccepted: true,
    username: "reauth-admin",
  });
  const current = users.findAuthenticatedUser(setup.user.id);
  const reauth = auth.reauthenticate(setup.user.id, "ReauthAdminPass123!");

  expect(current).toBeDefined();
  expect(
    verifyReauthenticationToken(reauth.token, setup.user.id, current?.sessionVersion ?? -1),
  ).toBe(true);

  users.updatePassword(setup.user.id, "ReauthAdminPass456!");
  const updated = users.findAuthenticatedUser(setup.user.id);
  expect(
    verifyReauthenticationToken(reauth.token, setup.user.id, updated?.sessionVersion ?? -1),
  ).toBe(false);
  database.onModuleDestroy();
});

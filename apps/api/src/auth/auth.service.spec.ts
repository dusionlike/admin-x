import { HttpException, UnauthorizedException } from "@nestjs/common";

import { expect, test } from "vite-plus/test";

import { DatabaseService } from "../database/database.service.js";
import { UsersService } from "../users/users.service.js";
import { AuthService } from "./auth.service.js";
import { verifyReauthenticationToken } from "./reauth.js";

function createAuth() {
  const database = new DatabaseService(":memory:");
  const users = new UsersService(database);
  return { auth: new AuthService(database, users), database, users };
}

test("issues a database-backed session and revokes the older session when the limit is one", () => {
  const { auth, database } = createAuth();
  const context = { ipAddress: "127.0.0.1", requestId: "test-request" };
  const setup = auth.setupAdmin(
    {
      displayName: "系统管理员",
      email: "session@admin-x.dev",
      password: "AdminPass123!",
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

test("locks an account after repeated password failures and records the blocked result", () => {
  const { auth, database } = createAuth();
  const context = { ipAddress: "10.0.0.8", requestId: "lockout-test" };
  auth.setupAdmin(
    {
      displayName: "锁定测试",
      email: "lockout@admin-x.dev",
      password: "LockoutPass123!",
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

test("encrypts MFA secrets at rest before binding", () => {
  const { auth, database } = createAuth();
  const setup = auth.setupAdmin({
    displayName: "MFA 管理员",
    email: "mfa@admin-x.dev",
    password: "MfaAdminPass123!",
    username: "mfa-admin",
  });
  const mfa = auth.setupMfa(setup.user.id, "MfaAdminPass123!");
  const row = database.connection
    .prepare("SELECT mfa_secret FROM users WHERE id = ?")
    .get(setup.user.id) as { mfa_secret?: string };

  expect(mfa.secret).toHaveLength(32);
  expect(row.mfa_secret).not.toBe(mfa.secret);
  expect(auth.getMfaStatus(setup.user.id)).toEqual({ configured: true, enabled: false });
  database.onModuleDestroy();
});

test("binds sensitive-operation reauthentication to the current session version", () => {
  const { auth, database, users } = createAuth();
  const setup = auth.setupAdmin({
    displayName: "二次验证管理员",
    email: "reauth@admin-x.dev",
    password: "ReauthAdminPass123!",
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

import { mkdtempSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "vite-plus/test";

import { DatabaseService } from "../database/database.service.js";
import { verifyPassword } from "../auth/password.js";
import { UsersService } from "./users.service.js";

test("persists and filters users in SQLite", () => {
  const database = new DatabaseService(":memory:");
  const service = new UsersService(database);
  service.createAdmin({
    displayName: "初始管理员",
    email: "admin@example.com",
    password: "OwnerPass123!",
    username: "admin",
  });

  const result = service.list({ keyword: "初始管理员", page: 1, pageSize: 10 });

  expect(result.meta.total).toBe(1);
  expect(result.items[0]?.username).toBe("admin");
  database.onModuleDestroy();
});

test("creates and updates a user", () => {
  const database = new DatabaseService(":memory:");
  const service = new UsersService(database);
  const user = service.create({
    displayName: "测试成员",
    email: "test@admin-x.dev",
    password: "MemberPass123!",
    role: "operator",
    username: "tester",
  });

  expect(service.count()).toBe(1);
  expect(service.updateStatus(user.id, "active").status).toBe("active");
  database.onModuleDestroy();
});

test("allows the system administrator to bootstrap one active security administrator", () => {
  const database = new DatabaseService(":memory:");
  const service = new UsersService(database);
  const systemAdmin = service.createAdmin({
    displayName: "系统管理员",
    email: "bootstrap-system@admin-x.dev",
    password: "SystemPass123!",
    username: "bootstrap-system",
  });
  const systemActor = service.findAuthenticatedUser(systemAdmin.id)?.user;

  expect(systemActor).toBeDefined();
  const securityAdmin = service.create(
    {
      displayName: "安全管理员",
      email: "bootstrap-security@admin-x.dev",
      password: "SecurityPass123!",
      role: "security-admin",
      status: "invited",
      username: "bootstrap-security",
    },
    systemActor,
  );

  expect(securityAdmin.role).toBe("security-admin");
  expect(securityAdmin.status).toBe("active");
  expect(() =>
    service.create(
      {
        displayName: "第二安全管理员",
        email: "bootstrap-security-2@admin-x.dev",
        password: "SecurityPass456!",
        role: "security-admin",
        status: "active",
        username: "bootstrap-security-2",
      },
      systemActor,
    ),
  ).toThrow("首位安全管理员只能由系统管理员一次性初始化");
  database.onModuleDestroy();
});

test("allows bootstrap role assignment only until a security administrator exists", () => {
  const database = new DatabaseService(":memory:");
  const service = new UsersService(database);
  const systemAdmin = service.createAdmin({
    displayName: "系统管理员",
    email: "system@admin-x.dev",
    password: "SystemPass123!",
    username: "system-admin",
  });
  const firstUser = service.create({
    displayName: "安全管理员",
    email: "security@admin-x.dev",
    password: "SecurityPass123!",
    role: "operator",
    status: "active",
    username: "security-admin",
  });
  const systemActor = service.findAuthenticatedUser(systemAdmin.id)?.user;

  expect(systemActor).toBeDefined();
  expect(service.updateRole(firstUser.id, "security-admin", systemActor!).role).toBe(
    "security-admin",
  );

  const secondUser = service.create({
    displayName: "业务管理员",
    email: "business@admin-x.dev",
    password: "BusinessPass123!",
    role: "operator",
    username: "business-admin",
  });
  expect(() => service.updateRole(secondUser.id, "business-admin", systemActor!)).toThrow(
    "只有安全管理员可以分配角色",
  );
  database.onModuleDestroy();
});

test("migrates the legacy business user schema without retaining plaintext passwords", () => {
  const directory = mkdtempSync(join(tmpdir(), "admin-x-role-migration-"));
  const databasePath = join(directory, "legacy.sqlite");
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL COLLATE NOCASE UNIQUE,
      display_name TEXT NOT NULL,
      email TEXT NOT NULL COLLATE NOCASE UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('super-admin', 'admin', 'operator')),
      status TEXT NOT NULL CHECK (status IN ('active', 'invited', 'suspended')),
      group_id INTEGER NOT NULL DEFAULT 1,
      is_admin INTEGER NOT NULL DEFAULT 0,
      avatar TEXT NOT NULL DEFAULT '',
      remark TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      last_active_at TEXT,
      device_access_mode TEXT NOT NULL DEFAULT 'all',
      device_access_group_ids TEXT NOT NULL DEFAULT '[]',
      password TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE activity_logs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('login', 'create', 'update', 'system')),
      created_at TEXT NOT NULL
    );
    CREATE TABLE visit_events (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL
    );
  `);
  legacy
    .prepare(
      `INSERT INTO users
        (id, username, display_name, email, password_hash, role, status, created_at, password)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "legacy-user",
      "legacy-admin",
      "历史管理员",
      "legacy@admin-x.dev",
      "scrypt-hash",
      "super-admin",
      "active",
      new Date().toISOString(),
      "plaintext-should-be-removed",
    );
  legacy.close();

  const database = new DatabaseService(databasePath);
  const service = new UsersService(database);
  expect(service.get("legacy-user").role).toBe("system-admin");
  const userSchema = database.connection
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'")
    .get() as { sql?: string };
  expect(userSchema.sql).not.toContain("password TEXT");
  expect(database.connection.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  database.onModuleDestroy();
  rmSync(directory, { force: true, recursive: true });
});

test("protects the current and last active administrator", () => {
  const database = new DatabaseService(":memory:");
  const service = new UsersService(database);
  const admin = service.createAdmin({
    displayName: "管理员",
    email: "admin@admin-x.dev",
    password: "OwnerPass123!",
    username: "admin",
  });
  const current = service.findAuthenticatedUser(admin.id)?.user;

  expect(current).toBeDefined();
  expect(() => service.updateStatus(admin.id, "suspended", current!)).toThrow(
    "不能停用当前登录账号",
  );
  expect(() => service.updateStatus(admin.id, "suspended")).toThrow("至少保留一个正常的管理员账号");
  expect(service.findAuthenticatedUser(admin.id)?.status).toBe("active");

  database.onModuleDestroy();
});

test("updates the current profile and persists a cropped avatar", () => {
  const database = new DatabaseService(":memory:");
  const service = new UsersService(database);
  const admin = service.createAdmin({
    displayName: "旧名称",
    email: "profile@admin-x.dev",
    password: "OwnerPass123!",
    username: "profile-admin",
  });
  const avatar = "data:image/png;base64,iVBORw0KGgo=";

  const updated = service.updateProfile(admin.id, {
    avatar,
    displayName: "新名称",
    email: "new-profile@admin-x.dev",
    remark: "负责内部远程支持",
  });

  expect(updated.displayName).toBe("新名称");
  expect(updated.avatar).toBe(avatar);
  expect(updated.remark).toBe("负责内部远程支持");
  expect(service.get(admin.id).avatar).toBe(avatar);
  database.onModuleDestroy();
});

test("updates the current password only after verifying the old password", () => {
  const database = new DatabaseService(":memory:");
  const service = new UsersService(database);
  const admin = service.createAdmin({
    displayName: "密码管理员",
    email: "password@admin-x.dev",
    password: "OwnerPass123!",
    username: "password-admin",
  });

  expect(() =>
    service.updateCurrentPassword(admin.id, {
      currentPassword: "wrong-password",
      newPassword: "NewPass123!!",
    }),
  ).toThrow("当前密码不正确");

  expect(
    service.updateCurrentPassword(admin.id, {
      currentPassword: "OwnerPass123!",
      newPassword: "NewPass123!!",
    }),
  ).toBeNull();
  const credentials = service.findCredentials("password-admin");
  expect(credentials && verifyPassword("NewPass123!!", credentials.passwordHash)).toBe(true);
  database.onModuleDestroy();
});

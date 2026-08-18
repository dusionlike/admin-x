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
